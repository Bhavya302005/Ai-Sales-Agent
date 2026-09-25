"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailDraft {
  id: string;
  campaign_id: string;
  lead_id: string;
  recipient_email: string;
  subject: string;
  body_html: string;
  status: "draft" | "approved" | "sending" | "sent" | "failed" | "suppressed";
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  opens_count: number;
  created_at: string;
}

export interface DraftListResponse {
  items: EmailDraft[];
  total: number;
}

export interface EmailOutreachStatus {
  enabled: boolean;
  mode: string;
  from_address: string | null;
  from_name: string;
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

export async function getEmailDrafts(campaignId: string): Promise<DraftListResponse> {
  return apiFetch<DraftListResponse>(
    `/api/v1/email-outreach/drafts?campaign_id=${encodeURIComponent(campaignId)}`
  );
}

export async function getEmailOutreachStatus(): Promise<EmailOutreachStatus> {
  return apiFetch<EmailOutreachStatus>("/api/v1/email-outreach/status");
}

export async function generateEmailDraft(formData: FormData) {
  const leadId = String(formData.get("lead_id") ?? "");
  const campaignId = String(formData.get("campaign_id") ?? "");
  const recipientEmail = String(formData.get("recipient_email") ?? "");
  const consentAttested = formData.get("consent_attested") === "on";

  if (!consentAttested) {
    throw new Error("Consent must be attested before generating a draft");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    throw new Error("Invalid email address");
  }

  try {
    await apiFetch<EmailDraft>("/api/v1/email-outreach/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: leadId,
        campaign_id: campaignId,
        recipient_email: recipientEmail,
        consent_attested: consentAttested,
      }),
    });
  } catch (err) {
    console.error("Failed to generate draft:", err);
  }
  revalidatePath("/campaigns");
}

export async function approveDraft(formData: FormData) {
  const draftId = String(formData.get("draft_id") ?? "");
  await apiFetch<EmailDraft>(`/api/v1/email-outreach/drafts/${draftId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  revalidatePath("/campaigns");
}

export async function sendDraft(formData: FormData) {
  const draftId = String(formData.get("draft_id") ?? "");
  const consentAttested = formData.get("consent_attested") === "on";

  if (!consentAttested) {
    throw new Error("Consent must be attested before sending");
  }

  try {
    await apiFetch<EmailDraft>(`/api/v1/email-outreach/drafts/${draftId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent_attested: consentAttested }),
    });
  } catch (err) {
    console.error("Failed to send draft:", err);
  }
  revalidatePath("/campaigns");
}
