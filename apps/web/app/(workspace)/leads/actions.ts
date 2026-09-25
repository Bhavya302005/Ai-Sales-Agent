"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiFetch, type DiscoveryImport } from "@/lib/api";

export async function refreshLeads() {
  let failed = false;
  try {
    await apiFetch<DiscoveryImport>("/api/v1/discovery/refresh", { method: "POST" });
  } catch (error) {
    console.error("Refresh leads failed:", error);
    failed = true;
  }
  revalidatePath("/leads");
  redirect(`/leads?provider=${failed ? "failed" : "live"}&_t=${Date.now()}`);
}
