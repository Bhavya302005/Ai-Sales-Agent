"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

export async function updateCallback(formData: FormData) {
  const callbackId = String(formData.get("callback_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const scheduled = String(formData.get("scheduled_for") ?? "");
  await apiFetch(`/api/v1/callbacks/${encodeURIComponent(callbackId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, scheduled_for: scheduled ? new Date(scheduled).toISOString() : null }),
  });
  revalidatePath("/callbacks");
}

export async function sendBookingLink(formData: FormData) {
  const callbackId = String(formData.get("callback_id") ?? "");
  await apiFetch(`/api/v1/callbacks/${encodeURIComponent(callbackId)}/send-booking-link`, {
    method: "POST",
  });
  revalidatePath("/callbacks");
}
