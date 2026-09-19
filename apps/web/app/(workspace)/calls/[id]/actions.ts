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
