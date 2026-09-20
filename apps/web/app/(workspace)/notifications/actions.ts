"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

export async function markNotificationRead(formData: FormData) {
  const id = String(formData.get("notification_id") ?? "");
  await apiFetch(`/api/v1/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  await apiFetch("/api/v1/notifications/read-all", { method: "POST" });
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}
