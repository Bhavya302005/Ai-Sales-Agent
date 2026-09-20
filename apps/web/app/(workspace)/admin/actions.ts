"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

export async function updateMember(formData: FormData) {
  const membershipId = String(formData.get("membership_id") ?? "");
  await apiFetch(`/api/v1/admin/members/${encodeURIComponent(membershipId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: formData.get("role"), status: formData.get("status") }),
  });
  revalidatePath("/admin");
}

export async function updateRuntimeControls(formData: FormData) {
  await apiFetch("/api/v1/admin/runtime-controls", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ calls_paused: formData.get("calls_paused") === "true" }),
  });
  revalidatePath("/admin");
}
