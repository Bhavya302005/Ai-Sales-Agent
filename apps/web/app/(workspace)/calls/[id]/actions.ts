"use server";

import { revalidatePath } from "next/cache";

import { apiFetch, type Job } from "@/lib/api";

export async function syncHandoffToCrm(formData: FormData) {
  const handoffId = String(formData.get("handoff_id") ?? "");
  const callId = String(formData.get("call_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(handoffId) || !/^[0-9a-f-]{36}$/i.test(callId)) {
    throw new Error("Invalid CRM sync request");
  }
  await apiFetch<Job>(`/api/v1/handoffs/${encodeURIComponent(handoffId)}/sync-crm`, {
    method: "POST",
    headers: { "Idempotency-Key": `crm-sync:${handoffId}` },
  });
  revalidatePath(`/calls/${callId}`);
}

export async function refreshProviderCall(formData: FormData) {
  const callId = String(formData.get("call_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(callId)) throw new Error("Invalid call refresh request");
  await apiFetch(`/api/v1/calls/${encodeURIComponent(callId)}/refresh`, { method: "POST" });
  revalidatePath(`/calls/${callId}`);
  revalidatePath("/campaigns");
}

export async function sendBookingFollowupAction(formData: FormData) {
  const callId = String(formData.get("call_id") ?? "");
  const recipientEmail = String(formData.get("recipient_email") ?? "").trim() || undefined;
  const recipientPhone = String(formData.get("recipient_phone") ?? "").trim() || undefined;
  if (!/^[0-9a-f-]{36}$/i.test(callId)) throw new Error("Invalid call ID");
  await apiFetch(`/api/v1/calls/${encodeURIComponent(callId)}/send-booking-followup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient_email: recipientEmail,
      recipient_phone: recipientPhone,
      sms_consent_confirmed: true,
      email_consent_confirmed: true,
    }),
  });
  revalidatePath(`/calls/${callId}`);
}

