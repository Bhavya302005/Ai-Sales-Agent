"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiFetch, type OfferingVersion } from "@/lib/api";

function lines(formData: FormData, name: string): string[] {
  return String(formData.get(name) ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function facts(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    lines(formData, "facts")
      .map((line) => {
        const separator = line.indexOf(":");
        return separator > 0
          ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
          : ["", ""];
      })
      .filter(([key, value]) => key && value),
  );
}

export async function createOfferingVersion(formData: FormData) {
  await apiFetch<OfferingVersion>("/api/v1/knowledge/offering/versions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description: String(formData.get("description") ?? ""),
      icp: {
        geographies: lines(formData, "geographies"),
        industries: lines(formData, "industries"),
        needs: lines(formData, "needs"),
      },
      exclusions: lines(formData, "exclusions"),
      facts: facts(formData),
      pricing_policy: String(formData.get("pricing_policy") ?? ""),
      qualification_questions: lines(formData, "qualification_questions"),
      handoff_conditions: lines(formData, "handoff_conditions"),
    }),
  });
  revalidatePath("/onboarding");
}

export async function approveOfferingVersion(formData: FormData) {
  const versionId = String(formData.get("version_id") ?? "");
  await apiFetch<OfferingVersion>(
    `/api/v1/knowledge/offering/versions/${encodeURIComponent(versionId)}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: String(formData.get("reason") ?? "") }),
    },
  );
  revalidatePath("/onboarding");
}

export async function confirmBusinessProfile(formData: FormData) {
  const workflowMode = String(formData.get("workflow_mode") ?? "leads_and_calling");
  await apiFetch<OfferingVersion>("/api/v1/knowledge/business-profile/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_name: String(formData.get("company_name") ?? ""),
      description: String(formData.get("description") ?? ""),
      services: lines(formData, "services"),
      icp: {
        geographies: lines(formData, "geographies"),
        industries: lines(formData, "industries"),
        needs: lines(formData, "needs"),
      },
      target_customers: lines(formData, "target_customers"),
      facts: facts(formData),
      exclusions: lines(formData, "exclusions"),
      pricing_policy: String(formData.get("pricing_policy") ?? ""),
      qualification_questions: lines(formData, "qualification_questions"),
      handoff_conditions: lines(formData, "handoff_conditions"),
      analysis_token: String(formData.get("analysis_token") ?? ""),
      workflow_mode: workflowMode,
      confirmed: true,
    }),
  });

  revalidatePath("/onboarding");
  revalidatePath("/leads");
  revalidatePath("/campaigns");
  redirect(workflowMode === "calling_only" ? "/campaigns?start=upload" : "/leads?profile=saved");
}
