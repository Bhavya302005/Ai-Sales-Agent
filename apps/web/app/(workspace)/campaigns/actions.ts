"use server";

import { revalidatePath } from "next/cache";

import { apiFetch, type Call, type Campaign, type LeadImportResponse } from "@/lib/api";

function id(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error(`Invalid ${name}`);
  return value;
}

export async function createCampaign(formData: FormData) {
  const mode = String(formData.get("mode") ?? "");
  if (!(["leads_and_calling", "calling_only"] as const).includes(mode as never)) {
    throw new Error("Invalid campaign mode");
  }
  await apiFetch<Campaign>("/api/v1/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: String(formData.get("name") ?? ""),
      mode,
      timezone: String(formData.get("timezone") ?? "Asia/Kolkata"),
      recurrence: String(formData.get("recurrence") ?? "once"),
      max_attempts: Number(formData.get("max_attempts") ?? 1),
      retry_delay_minutes: Number(formData.get("retry_delay_minutes") ?? 60),
      daily_budget_inr: Number(formData.get("daily_budget_inr") ?? 500),
    }),
  });
  revalidatePath("/campaigns");
}

export async function processDueCampaigns() {
  await apiFetch("/api/v1/campaigns/process-due", { method: "POST" });
  revalidatePath("/campaigns");
  revalidatePath("/notifications");
}

export async function updateCampaignRun(formData: FormData) {
  const campaignId = id(formData, "campaign_id");
  const runId = id(formData, "run_id");
  const state = String(formData.get("state") ?? "");
  if (!["completed", "cancelled"].includes(state)) throw new Error("Invalid run state");
  await apiFetch(`/api/v1/campaigns/${campaignId}/runs/${runId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  revalidatePath("/campaigns");
}

export async function importLeadFile(formData: FormData) {
  id(formData, "campaign_id");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("Choose a CSV or XLSX file");
  await apiFetch<LeadImportResponse>("/api/v1/leads/import", {
    method: "POST",
    body: formData,
  });
  revalidatePath("/campaigns");
  revalidatePath("/leads");
}

export async function approveLead(formData: FormData) {
  const campaignId = id(formData, "campaign_id");
  const leadId = id(formData, "lead_id");
  await apiFetch(`/api/v1/campaigns/${campaignId}/leads/${leadId}/approve`, { method: "POST" });
  revalidatePath("/campaigns");
}

export async function addLeadToCampaign(formData: FormData) {
  const campaignId = id(formData, "campaign_id");
  const leadId = id(formData, "lead_id");
  await apiFetch(`/api/v1/campaigns/${campaignId}/leads/${leadId}`, { method: "POST" });
  revalidatePath("/campaigns");
}

export async function requestBrowserCall(formData: FormData) {
  const campaignId = id(formData, "campaign_id");
  const leadId = id(formData, "lead_id");
  const contactId = id(formData, "contact_id");
  const idempotencyKey = String(formData.get("idempotency_key") ?? "");
  await apiFetch<Call>("/api/v1/calls/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ campaign_id: campaignId, lead_id: leadId, contact_id: contactId, transport: "browser" }),
  });
  revalidatePath("/campaigns");
}

export async function requestPstnCall(formData: FormData) {
  const campaignId = id(formData, "campaign_id");
  const leadId = id(formData, "lead_id");
  const contactId = id(formData, "contact_id");
  const transport = String(formData.get("transport") ?? "");
  if (!["twilio", "omnidim"].includes(transport)) throw new Error("Invalid PSTN provider");
  if (formData.get("consent_attested") !== "on") {
    throw new Error("Confirm the contact's call consent first");
  }
  await apiFetch(`/api/v1/contacts/${contactId}/pstn-consent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attested: true }),
  });
  await apiFetch<Call>("/api/v1/calls/requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": String(formData.get("idempotency_key") ?? ""),
    },
    body: JSON.stringify({ campaign_id: campaignId, lead_id: leadId, contact_id: contactId, transport }),
  });
  revalidatePath("/campaigns");
}

export async function dispatchPstnCall(formData: FormData) {
  const callId = id(formData, "call_id");
  await apiFetch<Call>(`/api/v1/calls/${callId}/dispatch`, { method: "POST" });
  revalidatePath("/campaigns");
}
