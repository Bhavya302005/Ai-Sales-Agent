import unicodedata
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.conversation.dialogue_adapter import DialogueAdapter, DialogueInterpretation, FaqKey
from app.conversation.script import (
    HINDI_QUESTION_TRANSLATIONS,
    post_specific_qualification_question,
)
from app.conversation.tools import (
    CallbackSchedule,
    HumanHandoff,
    OptOut,
    SafeToolRequest,
    execute_safe_tool,
)
from app.persistence.models import Call, Lead, Product, ProductVersion, Requirement
from app.voice_sessions import VoiceCallContext

CONVERSATION_POLICY_VERSION = "conversation-policy.v1"


AFFIRMATIVE_REPLIES = (
    "yes",
    "yes please",
    "yep",
    "yup",
    "yeah",
    "sure",
    "sure thing",
    "okay",
    "ok",
    "absolutely",
    "certainly",
    "definitely",
    "of course",
    "go ahead",
    "go on",
    "continue",
    "continue please",
    "please proceed",
    "proceed",
    "carry on",
    "keep going",
    "please continue",
    "you may continue",
    "you can continue",
    "that is fine",
    "that s fine",
    "that should be fine",
    "works for me",
    "sounds good",
    "i can talk",
    "i have a minute",
    "i suppose so",
    "haan",
    "han",
    "haan ji",
    "ji haan",
    "bilkul",
    "theek hai",
    "thik hai",
    "aap boliye",
    "aage badhiye",
    "continue karo",
    "baat kar sakte hain",
    "हाँ",
    "जी हाँ",
    "बिल्कुल",
    "ठीक है",
    "बोलिए",
    "आगे बढ़िए",
    "जारी रखें",
)

NEGATIVE_REPLIES = (
    "no",
    "no thanks",
    "no thank you",
    "nope",
    "not now",
    "maybe later",
    "call later",
    "busy",
    "i am busy",
    "i m busy",
    "cannot talk",
    "can t talk",
    "bad time",
    "not a good time",
    "please stop",
    "i would rather not",
    "अभी नहीं",
    "बाद में",
    "व्यस्त",
    "नहीं",
)


def _matches_reply(normalized: str, phrases: tuple[str, ...]) -> bool:
    padded = f" {normalized} "
    return any(f" {phrase} " in padded for phrase in phrases)


def _confirmation_intent(normalized: str) -> Literal["yes", "no", "unclear"]:
    positive_exceptions = (
        "no problem",
        "don t mind",
        "do not mind",
        "why not",
    )
    unavailable = (
        "but i am busy",
        "but i m busy",
        "but not now",
        "call me later",
        "another time",
    )
    uncertain = (
        "maybe",
        "not sure",
        "need to think",
        "let me think",
        "perhaps",
    )
    # A negative or unavailable qualifier wins over a casual affirmative, for example
    # "yes, but I am busy". Consent and callbacks must never be inferred from ambiguity.
    if _matches_reply(normalized, unavailable):
        return "no"
    if _matches_reply(normalized, uncertain):
        return "unclear"
    if _matches_reply(normalized, positive_exceptions):
        return "yes"
    if _matches_reply(normalized, NEGATIVE_REPLIES):
        return "no"
    if _matches_reply(normalized, AFFIRMATIVE_REPLIES):
        return "yes"
    return "unclear"


def _looks_like_question(original: str, normalized: str) -> bool:
    question_openers = (
        "can you ",
        "could you ",
        "do you ",
        "does your ",
        "is there ",
        "are there ",
        "what ",
        "how ",
        "when ",
        "will you ",
        "would you ",
        "tell me ",
        "क्या ",
        "कैसे ",
        "कब ",
    )
    return "?" in original or normalized.startswith(question_openers)


class ConversationState(StrEnum):
    ELIGIBILITY_CHECKED = "EligibilityChecked"
    DISCLOSURE = "Disclosure"
    PERMISSION = "Permission"
    QUALIFICATION = "Qualification"
    FAQ = "FAQ"
    NEXT_STEP = "NextStep"
    HANDOFF = "Handoff"
    OPT_OUT = "OptOut"
    COMPLETED = "Completed"
    ENDED = "Ended"
    BLOCKED = "Blocked"


@dataclass(frozen=True)
class DialogueReply:
    text: str
    state: ConversationState
    end_call: bool = False
    outcome: str | None = None
    tools: tuple[str, ...] = ()


@dataclass
class ConversationSession:
    context: VoiceCallContext
    language: Literal["en-IN", "hi-IN"]
    product_name: str
    questions: tuple[str, ...]
    approved_facts: dict[str, str]
    lead_context: dict[str, str] = field(default_factory=dict)
    dialogue_adapter: DialogueAdapter | None = None
    max_turns: int = 14
    max_silences: int = 3
    max_tool_calls: int = 3
    state: ConversationState = ConversationState.PERMISSION
    turn_count: int = 0
    silence_count: int = 0
    tool_call_count: int = 0
    question_index: int = 0
    participant_answers: list[str] = field(default_factory=list)
    clarified_question_indices: set[int] = field(default_factory=set)
    pending_recap: str | None = None
    history: list[ConversationState] = field(
        default_factory=lambda: [
            ConversationState.ELIGIBILITY_CHECKED,
            ConversationState.DISCLOSURE,
            ConversationState.PERMISSION,
        ]
    )

    @property
    def disclosure(self) -> str:
        requirement = self.lead_context.get("requirement")
        if self.language == "hi-IN":
            context = (
                f"मैं आपकी प्रकाशित आवश्यकता—{requirement}—के बारे में बात कर रही हूँ। "
                if requirement
                else ""
            )
            return (
                f"नमस्ते, मैं {self.product_name} की एआई सहायक हूँ। "
                + context
                + "यह एक छोटी योग्यता बातचीत है और ऑडियो रिकॉर्ड नहीं किया जाएगा। "
                + "क्या अभी बात करना ठीक है?"
            )
        return (
            f"Hello, I’m the AI assistant for {self.product_name}. "
            + (
                f"I’m calling regarding your published requirement around "
                f"{requirement}. "
                if requirement
                else ""
            )
            + "This is a short qualification conversation and the audio is not recorded. "
            "Is now a good time to continue?"
        )

    def _transition(self, state: ConversationState) -> None:
        self.state = state
        self.history.append(state)

    def _tool(
        self, session: Session, request: SafeToolRequest, *, state: ConversationState | None = None
    ) -> str:
        # A participant's opt-out is a safety action, not a discretionary agent action.
        # It must remain available even when the ordinary tool budget is exhausted.
        if self.tool_call_count >= self.max_tool_calls and not isinstance(request, OptOut):
            raise RuntimeError("tool call budget exhausted")
        execute_safe_tool(
            session,
            context=self.context,
            state=(state or self.state).value,
            request=request,
        )
        if not isinstance(request, OptOut):
            self.tool_call_count += 1
        return request.tool

    def _question(self) -> str:
        if self.question_index >= len(self.questions):
            return ""
        question = self.questions[self.question_index]
        if self.language == "hi-IN":
            return HINDI_QUESTION_TRANSLATIONS.get(question, question)
        return question

    def _acknowledgement(self, answered_index: int) -> str:
        english = (
            "That gives me a clear starting point. ",
            "Helpful—I understand the environment better. ",
            "Understood; those priorities are important. ",
            "Got it—that clarifies the timing. ",
            "Thanks, that explains the decision process. ",
        )
        hindi = (
            "इससे मुझे एक स्पष्ट शुरुआत मिली। ",
            "अच्छा, अब मौजूदा परिवेश बेहतर समझ में आया। ",
            "समझ गई; ये प्राथमिकताएँ महत्वपूर्ण हैं। ",
            "ठीक है, इससे समय-सीमा स्पष्ट हुई। ",
            "धन्यवाद, इससे निर्णय प्रक्रिया स्पष्ट हुई। ",
        )
        options = hindi if self.language == "hi-IN" else english
        return options[min(answered_index, len(options) - 1)]

    def _next_step_prompt(self) -> str:
        recap = self.pending_recap
        if self.language == "hi-IN":
            return (
                (f"मैं संक्षेप में पुष्टि कर दूँ: {recap}। " if recap else "")
                + "क्या आप पुष्टि करते हैं कि एक मानव विशेषज्ञ सत्यापित परीक्षण संपर्क पर "
                + "आपसे अगला कदम तय करने के लिए संपर्क करे?"
            )
        return (
            (f"Let me confirm I understood: {recap} " if recap else "")
            + "Do you confirm that a human specialist may follow up using the verified "
            + "test contact to agree the next step?"
        )

    def _handoff(self, session: Session, *, reason: str, prefix: str) -> DialogueReply:
        if self.tool_call_count >= self.max_tool_calls:
            self._transition(ConversationState.COMPLETED)
            return DialogueReply(
                text=(
                    "मैं इस बातचीत में कोई और कार्रवाई सुरक्षित रूप से नहीं कर सकती। "
                    "कृपया हमारी टीम से सीधे संपर्क करें।"
                    if self.language == "hi-IN"
                    else "I can’t safely take another action in this conversation. "
                    "Please contact our team directly."
                ),
                state=self.state,
                end_call=True,
                outcome="tool_budget_reached",
            )
        tool = self._tool(session, HumanHandoff(reason=reason))
        self._transition(ConversationState.HANDOFF)
        return DialogueReply(
            text=prefix,
            state=self.state,
            end_call=True,
            outcome="handoff_requested",
            tools=(tool,),
        )

    def handle_turn(self, session: Session, text: str) -> DialogueReply:
        self.turn_count += 1
        self.silence_count = 0
        normalized = " ".join(
            "".join(
                " " if unicodedata.category(character).startswith("P") else character
                for character in text.casefold()
            ).split()
        )
        if self.turn_count > self.max_turns:
            self._transition(ConversationState.COMPLETED)
            return DialogueReply(
                text="Thank you for your time. I’ll end the conversation here.",
                state=self.state,
                end_call=True,
                outcome="turn_limit_reached",
            )

        opt_out = ("do not call", "stop calling", "remove me", "unsubscribe", "कॉल मत", "फोन मत")
        wrong_person = ("wrong person", "not the right person", "गलत व्यक्ति")
        if any(phrase in normalized for phrase in opt_out + wrong_person):
            reason: Literal["participant_opt_out", "wrong_person"] = (
                "wrong_person"
                if any(phrase in normalized for phrase in wrong_person)
                else "participant_opt_out"
            )
            tool = self._tool(session, OptOut(reason=reason))
            self._transition(ConversationState.OPT_OUT)
            return DialogueReply(
                text=(
                    "समझ गया। हम इस संपर्क पर दोबारा कॉल नहीं करेंगे। धन्यवाद।"
                    if self.language == "hi-IN"
                    else "Understood. We will not call this contact again. Thank you."
                ),
                state=self.state,
                end_call=True,
                outcome=reason,
                tools=(tool,),
            )

        injection_phrases = (
            "ignore previous",
            "ignore your rules",
            "system prompt",
            "developer message",
            "execute tool",
            "call tool",
        )
        if any(phrase in normalized for phrase in injection_phrases):
            return DialogueReply(
                text=(
                    "मैं केवल इस योग्यता बातचीत में मदद कर सकती हूँ। " + self._question()
                    if self.language == "hi-IN"
                    else "I can only help with this qualification conversation. " + self._question()
                ).strip(),
                state=self.state,
            )

        confirmation_intent = _confirmation_intent(normalized)
        interpretation: DialogueInterpretation | None = None
        if self.dialogue_adapter is not None and (
            confirmation_intent == "unclear"
            or self.state in {ConversationState.QUALIFICATION, ConversationState.FAQ}
        ):
            interpretation = self.dialogue_adapter.interpret(
                participant_text=text,
                language=self.language,
                conversation_state=self.state.value,
                current_question=(
                    self._question()
                    if self.state != ConversationState.FAQ
                    else "What questions do you have for me before we discuss the next step?"
                ),
                approved_facts=self.approved_facts,
                previous_participant_answers=tuple(self.participant_answers[-8:]),
                lead_context=self.lead_context,
                is_final_qualification_question=(
                    self.state == ConversationState.QUALIFICATION
                    and self.question_index == len(self.questions) - 1
                ),
            )
            if interpretation is not None and confirmation_intent == "unclear":
                confirmation_intent = interpretation.confirmation
        self.participant_answers.append(text[:2_000])
        if len(self.participant_answers) > 8:
            del self.participant_answers[:-8]
        if self.state == ConversationState.PERMISSION:
            if confirmation_intent == "yes":
                self._transition(ConversationState.QUALIFICATION)
                return DialogueReply(
                    text=(
                        "बहुत अच्छा। " + self._question()
                        if self.language == "hi-IN"
                        else "Great, thank you. " + self._question()
                    ),
                    state=self.state,
                )
            if confirmation_intent == "no":
                self._transition(ConversationState.ENDED)
                return DialogueReply(
                    text=(
                        "कोई समस्या नहीं। आपके समय के लिए धन्यवाद।"
                        if self.language == "hi-IN"
                        else "No problem. Thank you for your time."
                    ),
                    state=self.state,
                    end_call=True,
                    outcome="permission_declined",
                )
            return DialogueReply(
                text=(
                    "आगे बढ़ने के लिए कृपया हाँ कहें, या मना कर सकते हैं।"
                    if self.language == "hi-IN"
                    else "Please say yes if I may continue, or you can decline."
                ),
                state=self.state,
            )

        unsupported_topics = (
            "price",
            "pricing",
            "discount",
            "quote",
            "custom terms",
            "contract terms",
            "commercial contract",
            "legal terms",
            "guarantee",
            "commit to",
            "कीमत",
            "छूट",
        )
        direct_commercial_request = (
            "i need a quote",
            "send me a quote",
            "give me a quote",
            "give me the price",
            "share the price",
            "promise delivery",
        )
        if (
            _looks_like_question(text, normalized)
            and any(term in normalized for term in unsupported_topics)
        ) or any(phrase in normalized for phrase in direct_commercial_request):
            return self._handoff(
                session,
                reason="unsupported_pricing_or_commitment",
                prefix=(
                    "मैं कीमत या अनुबंध का वादा नहीं कर सकती। "
                    "सही जानकारी के लिए एक मानव विशेषज्ञ आपसे संपर्क करेगा।"
                    if self.language == "hi-IN"
                    else "I don’t want to guess about pricing or commitments. "
                    "A human specialist will follow up with the correct information."
                ),
            )

        explicit_handoff_request = (
            "talk to a specialist",
            "set up a meeting",
            "विशेषज्ञ से",
        )
        if any(phrase in normalized for phrase in explicit_handoff_request):
            return self._handoff(
                session,
                reason="positive_interest",
                prefix=(
                    "बहुत अच्छा। मैं यहाँ बिक्री का दबाव नहीं डालूँगी; एक मानव विशेषज्ञ अगला कदम संभालेगा।"
                    if self.language == "hi-IN"
                    else "That’s great to hear. I won’t keep selling; "
                    "a human specialist will take the next step."
                ),
            )

        if self.state == ConversationState.QUALIFICATION:
            faq_aliases: dict[FaqKey, tuple[str, ...]] = {
                "delivery": ("deliver", "delivery", "implement"),
                "deployment": ("deploy", "cloud", "hybrid"),
                "security": ("security", "secure"),
                "timeline": ("timeline", "how long", "when"),
                "support": ("support", "after implementation"),
            }
            for key, aliases in faq_aliases.items():
                if (
                    key in self.approved_facts
                    and (
                        (
                            _looks_like_question(text, normalized)
                            and any(alias in normalized for alias in aliases)
                        )
                        or (interpretation is not None and interpretation.faq_key == key)
                    )
                ):
                    self._transition(ConversationState.FAQ)
                    answer = self.approved_facts[key]
                    self._transition(ConversationState.QUALIFICATION)
                    return DialogueReply(
                        text=f"Based on our approved information: {answer} {self._question()}",
                        state=self.state,
                    )
            if (
                interpretation is not None
                and not interpretation.answer_sufficient
                and interpretation.follow_up_question
                and self.question_index not in self.clarified_question_indices
            ):
                self.clarified_question_indices.add(self.question_index)
                acknowledgement = (
                    interpretation.acknowledgement.strip() + " "
                    if interpretation.acknowledgement
                    else ""
                )
                return DialogueReply(
                    text=acknowledgement + interpretation.follow_up_question.strip(),
                    state=self.state,
                )
            answered_index = self.question_index
            self.question_index += 1
            if self.question_index < len(self.questions):
                acknowledgement = (
                    interpretation.acknowledgement.strip() + " "
                    if interpretation is not None and interpretation.acknowledgement
                    else self._acknowledgement(answered_index)
                )
                return DialogueReply(
                    text=acknowledgement + self._question(),
                    state=self.state,
                )
            self._transition(ConversationState.NEXT_STEP)
            recap = (
                interpretation.recap.strip()
                if interpretation is not None and interpretation.recap
                else None
            )
            self.pending_recap = recap
            self._transition(ConversationState.FAQ)
            return DialogueReply(
                text=(
                    "अगले कदम से पहले, आप मुझसे क्या पूछना चाहेंगे?"
                    if self.language == "hi-IN"
                    else "Before we discuss the next step, what questions do you have for me?"
                ),
                state=self.state,
            )

        if self.state == ConversationState.FAQ:
            no_more_questions = (
                "no question",
                "no questions",
                "nothing else",
                "that is all",
                "that's all",
                "move on",
                "कोई सवाल नहीं",
                "और कुछ नहीं",
            )
            if confirmation_intent == "no" or any(
                phrase in normalized for phrase in no_more_questions
            ):
                self._transition(ConversationState.NEXT_STEP)
                return DialogueReply(text=self._next_step_prompt(), state=self.state)

            question_faq_aliases: dict[FaqKey, tuple[str, ...]] = {
                "delivery": ("deliver", "delivery", "implement"),
                "deployment": ("deploy", "cloud", "hybrid"),
                "security": ("security", "secure", "risk", "downtime", "cutover"),
                "timeline": ("timeline", "how long", "when"),
                "support": ("support", "after implementation", "training"),
            }
            matched_key = interpretation.faq_key if interpretation is not None else None
            if matched_key is None:
                for key, aliases in question_faq_aliases.items():
                    if any(alias in normalized for alias in aliases):
                        matched_key = key
                        break
            if matched_key is not None and matched_key in self.approved_facts:
                answer = self.approved_facts[matched_key]
                suffix = (
                    " क्या आप कुछ और पूछना चाहेंगे?"
                    if self.language == "hi-IN"
                    else " What else would you like to ask?"
                )
                return DialogueReply(
                    text=f"Based on our approved information: {answer}{suffix}",
                    state=self.state,
                )

            return DialogueReply(
                text=(
                    "मैं उपलब्ध स्वीकृत जानकारी से इसकी पुष्टि नहीं कर सकती। मानव विशेषज्ञ इसे "
                    "स्पष्ट कर सकता है। क्या आपका कोई और प्रश्न है?"
                    if self.language == "hi-IN"
                    else "I can’t confirm that from the approved information available to me. "
                    "A human specialist can clarify it. What else would you like to ask?"
                ),
                state=self.state,
            )

        if self.state == ConversationState.NEXT_STEP:
            if confirmation_intent == "yes":
                if self.tool_call_count + 2 > self.max_tool_calls:
                    self._transition(ConversationState.COMPLETED)
                    return DialogueReply(
                        text=(
                            "मैं इस बातचीत में अगला कदम सुरक्षित रूप से तय नहीं कर सकती। "
                            "कृपया हमारी टीम से सीधे संपर्क करें।"
                            if self.language == "hi-IN"
                            else "I can’t safely arrange another action in this conversation. "
                            "Please contact our team directly."
                        ),
                        state=self.state,
                        end_call=True,
                        outcome="tool_budget_reached",
                    )
                callback = self._tool(
                    session,
                    CallbackSchedule(
                        proposed_time="human_to_confirm",
                        contact_details="verified_test_contact",
                        confirmed=True,
                    ),
                )
                handoff = self._tool(
                    session,
                    HumanHandoff(reason="confirmed_specialist_follow_up"),
                )
                self._transition(ConversationState.HANDOFF)
                return DialogueReply(
                    text=(
                        "पुष्टि के लिए धन्यवाद। एक मानव विशेषज्ञ समय तय करने के लिए संपर्क करेगा।"
                        if self.language == "hi-IN"
                        else "Thanks for confirming. A human specialist will contact you "
                        "to agree a time."
                    ),
                    state=self.state,
                    end_call=True,
                    outcome="handoff_requested",
                    tools=(callback, handoff),
                )
            if confirmation_intent == "no":
                self._transition(ConversationState.COMPLETED)
                return DialogueReply(
                    text=(
                        "ठीक है। हम कोई फॉलो-अप तय नहीं करेंगे। आपके समय के लिए धन्यवाद।"
                        if self.language == "hi-IN"
                        else "Understood. We will not arrange a follow-up. Thank you for your time."
                    ),
                    state=self.state,
                    end_call=True,
                    outcome="qualified_no_followup",
                )
            return DialogueReply(
                text=(
                    "कृपया स्पष्ट रूप से पुष्टि करें कि क्या कोई मानव विशेषज्ञ आपसे संपर्क कर सकता है।"
                    if self.language == "hi-IN"
                    else "Please confirm clearly whether a human specialist may contact you."
                ),
                state=self.state,
            )

        self._transition(ConversationState.COMPLETED)
        return DialogueReply(
            text="Thank you for your time.",
            state=self.state,
            end_call=True,
            outcome="completed",
        )

    def handle_silence(self) -> DialogueReply:
        self.silence_count += 1
        if self.silence_count >= self.max_silences:
            self._transition(ConversationState.ENDED)
            return DialogueReply(
                text="I can’t hear a response, so I’ll end the call. Thank you.",
                state=self.state,
                end_call=True,
                outcome="silence_limit_reached",
            )
        return DialogueReply(
            text=("क्या आप अभी भी सुन रहे हैं?" if self.language == "hi-IN" else "Are you still there?"),
            state=self.state,
        )


def create_conversation_session(
    session: Session,
    *,
    context: VoiceCallContext,
    language: Literal["en-IN", "hi-IN"],
    dialogue_adapter: DialogueAdapter | None = None,
) -> ConversationSession:
    row = session.execute(
        select(Call, Lead, Requirement, Product, ProductVersion)
        .join(
            Lead,
            (Lead.id == Call.lead_id) & (Lead.organization_id == context.organization_id),
        )
        .join(
            Requirement,
            (Requirement.id == Lead.requirement_id)
            & (Requirement.organization_id == context.organization_id),
        )
        .join(
            ProductVersion,
            (ProductVersion.id == Lead.product_version_id)
            & (ProductVersion.organization_id == context.organization_id),
        )
        .join(
            Product,
            (Product.id == ProductVersion.product_id)
            & (Product.organization_id == context.organization_id),
        )
        .where(
            Call.id == context.call_id,
            Call.organization_id == context.organization_id,
            Product.active_version_id == ProductVersion.id,
            ProductVersion.approved_at.is_not(None),
        )
    ).one_or_none()
    if row is None:
        raise ValueError("active approved conversation context is unavailable")
    _, _, requirement, product, version = row
    stored_facts = version.facts
    stored_questions = tuple(
        str(item) for item in stored_facts.get("_qualification_questions", [])
    )
    questions = stored_questions
    if stored_questions:
        questions = (
            post_specific_qualification_question(
                requirement.normalized_need,
                language=language,
            ),
            *stored_questions[1:],
        )
    lead_context = {"requirement": requirement.normalized_need}
    if requirement.category:
        lead_context["category"] = requirement.category.replace("_", " ")
    if requirement.geography:
        lead_context["geography"] = requirement.geography
    if requirement.urgency:
        lead_context["urgency"] = requirement.urgency
    if requirement.explicit_deadline:
        lead_context["explicit_deadline"] = requirement.explicit_deadline.date().isoformat()
    return ConversationSession(
        context=context,
        language=language,
        product_name=product.name,
        questions=questions,
        approved_facts={
            key: str(value) for key, value in stored_facts.items() if not key.startswith("_")
        },
        lead_context=lead_context,
        dialogue_adapter=dialogue_adapter,
    )
