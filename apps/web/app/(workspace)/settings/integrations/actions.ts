"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

export async function importHubSpotContact(formData: FormData) {
  const contactId = String(formData.get("external_contact_id") ?? "");
  const campaignId = String(formData.get("campaign_id") ?? "");
  await apiFetch("/api/v1/integrations/hubspot/import", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      external_contact_id: contactId,
      campaign_id: campaignId,
      requirement: String(formData.get("requirement") ?? ""),
      consent_basis: String(formData.get("consent_basis") ?? ""),
      consent_attested: formData.get("consent_attested") === "on",
    }),
  });
  revalidatePath("/settings/integrations");
  revalidatePath("/campaigns");
  revalidatePath("/notifications");
}
