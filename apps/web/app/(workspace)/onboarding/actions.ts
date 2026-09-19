"use server";

import { revalidatePath } from "next/cache";

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
