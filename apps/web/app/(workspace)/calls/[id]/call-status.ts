import type { CallDetail } from "@/lib/api";

const OUTCOME_MESSAGES: Record<string, string> = {
  provider_dispatch_failed:
    "Twilio rejected or could not confirm the outbound request. Verify credentials, balance, and trial-number permissions before retrying.",
  twilio_busy: "The test participant's line was busy. Confirm availability before preparing another attempt.",
  twilio_no_answer:
    "The test participant did not answer within Twilio's timeout. Confirm availability before preparing another attempt.",
  twilio_canceled: "Twilio canceled the call before it connected. Review the Twilio call log before retrying.",
  twilio_failed: "Twilio could not connect the call. Review the Twilio call log before retrying.",
  twilio_conversation_relay_failed:
    "The phone connected, but Twilio ConversationRelay could not run the voice session.",
};

export function callFailureMessage(call: CallDetail): string {
  const base = call.outcome ? OUTCOME_MESSAGES[call.outcome] : undefined;
  const errorCode = call.usage.provider_error_code;
  const suffix =
    call.transport === "twilio" && typeof errorCode === "string" && /^\d{4,6}$/.test(errorCode)
      ? ` Twilio error code: ${errorCode}.`
      : "";
  return `${base ?? `The call ended with outcome: ${call.outcome ?? "unknown"}.`}${suffix}`;
}
