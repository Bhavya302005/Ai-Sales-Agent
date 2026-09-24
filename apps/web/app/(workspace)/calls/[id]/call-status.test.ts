import { describe, expect, it } from "vitest";

import type { CallDetail } from "@/lib/api";

import { callFailureMessage } from "./call-status";

function failedCall(overrides: Partial<CallDetail> = {}): CallDetail {
  return {
    id: "call-id",
    lead_id: "lead-id",
    transport: "twilio",
    state: "failed",
    outcome: "twilio_conversation_relay_failed",
    max_duration_seconds: 60,
    usage: { provider_error_code: "64102" },
    eligibility_checks: [],
    transcript: [],
    qualification: null,
    handoff: null,
    ...overrides,
  };
}

describe("callFailureMessage", () => {
  it("shows an actionable ConversationRelay failure and safe provider code", () => {
    expect(callFailureMessage(failedCall())).toBe(
      "The phone connected, but Twilio ConversationRelay could not run the voice session. Twilio error code: 64102.",
    );
  });

  it("does not expose an untrusted provider error value", () => {
    expect(
      callFailureMessage(failedCall({ usage: { provider_error_code: "secret or transcript" } })),
    ).not.toContain("secret or transcript");
  });
});
