"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiFetch, type DiscoveryImport } from "@/lib/api";

export async function refreshLeads() {
  let provider: "failed" | "live" | "empty" = "failed";
  try {
    const result = await apiFetch<DiscoveryImport>("/api/v1/discovery/refresh", {
      method: "POST",
    });
    provider = result.received > 0 ? "live" : "empty";
  } catch (error) {
    console.error("Refresh leads failed:", error);
  }
  revalidatePath("/leads");
  redirect(`/leads?provider=${provider}&_t=${Date.now()}`);
}
