QUALIFICATION_QUESTIONS = (
    "To understand the requirement, which teams, content, and business processes are in scope, "
    "what problem are you trying to solve, and is the published requirement still accurate?",
    "What does your current environment look like, and roughly how many users, locations, "
    "data sources, and key integrations are involved?",
    "What outcome would make this project successful, and which requirements—such as security, "
    "downtime, compliance, or support—are most important?",
    "What deadline or business event is driving the migration, and how far along are you in the "
    "evaluation?",
    "Who owns the technical evaluation and commercial decision, and who else will be involved "
    "in approval?",
    "Has a budget range been approved, is it under review, or is it not decided yet?",
)


def post_specific_qualification_question(
    normalized_need: str,
    *,
    language: str,
) -> str:
    need = " ".join(normalized_need.split())[:320].rstrip(" .")
    if language == "hi-IN":
        return (
            f"आपकी प्रकाशित आवश्यकता में यह उल्लेख है: {need}। इसे सही तरह समझने के लिए, "
            "कौन सी टीमें, सामग्री और व्यावसायिक प्रक्रियाएँ दायरे में हैं, यह पहल किस समस्या के कारण "
            "शुरू हुई, और क्या प्रकाशित दायरा अभी भी सही है?"
        )
    return (
        f"Your published requirement mentions: {need}. To make sure I understand it correctly, "
        "which teams, content, and business processes are in scope, what problem triggered the "
        "initiative, "
        "and is the published scope still accurate?"
    )

HINDI_QUESTION_TRANSLATIONS = {
    QUALIFICATION_QUESTIONS[0]: (
        "आपकी आवश्यकता समझने के लिए, कौन सी टीमें, सामग्री और प्रक्रियाएँ दायरे में हैं, "
        "आप किस समस्या का समाधान चाहते हैं, और क्या प्रकाशित आवश्यकता अभी भी सही है?"
    ),
    QUALIFICATION_QUESTIONS[1]: (
        "आपका मौजूदा परिवेश कैसा है, और लगभग कितने उपयोगकर्ता, स्थान, डेटा स्रोत और "
        "मुख्य इंटीग्रेशन शामिल हैं?"
    ),
    QUALIFICATION_QUESTIONS[2]: (
        "इस परियोजना की सफलता आपके लिए कैसी दिखेगी, और सुरक्षा, डाउनटाइम, अनुपालन या सहायता में "
        "से कौन सी आवश्यकताएँ सबसे महत्वपूर्ण हैं?"
    ),
    QUALIFICATION_QUESTIONS[3]: (
        "इस माइग्रेशन की समय-सीमा या मुख्य व्यावसायिक कारण क्या है, और आपका मूल्यांकन अभी किस चरण में है?"
    ),
    QUALIFICATION_QUESTIONS[4]: (
        "तकनीकी मूल्यांकन और व्यावसायिक निर्णय की जिम्मेदारी किसके पास है, और अनुमोदन में और कौन शामिल होगा?"
    ),
    QUALIFICATION_QUESTIONS[5]: ("क्या बजट सीमा स्वीकृत है, समीक्षा में है, या अभी तय नहीं हुई है?"),
}
