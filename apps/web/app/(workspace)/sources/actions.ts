"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiFetch, type DiscoveryImport, type Job, type SourceDocument } from "@/lib/api";

export async function importDiscoveryDemo() {
  await apiFetch<DiscoveryImport>("/api/v1/discovery/import-demo", { method: "POST" });
  revalidatePath("/sources");
  redirect("/sources?provider=snapshot");
}

export async function refreshLiveDiscovery() {
  try {
    await apiFetch<DiscoveryImport>("/api/v1/discovery/refresh", { method: "POST" });
  } catch {
    redirect("/sources?provider=failed");
  }
  revalidatePath("/sources");
  redirect("/sources?provider=live");
}

export async function importPermittedFixture() {
  await apiFetch<SourceDocument>("/api/v1/sources/import-fixture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixture_id: "narmada-erp-cloud-migration-2026" }),
  });
  revalidatePath("/sources");
}

export async function extractEvidence(formData: FormData) {
  const sourceId = String(formData.get("source_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(sourceId)) throw new Error("Invalid source identifier");
  await apiFetch<Job>(`/api/v1/sources/${encodeURIComponent(sourceId)}/extract`, {
    method: "POST",
    headers: { "Idempotency-Key": `extract:${sourceId}` },
  });
  revalidatePath("/sources");
}
