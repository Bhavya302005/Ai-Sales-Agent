import { getAnalytics, getSubscription, getViewer } from "@/lib/api";

import { SubscriptionClientShell } from "./subscription-client";

export const metadata = {
  title: "Subscription — SignalPath",
  description: "Manage your SignalPath plan, review live usage, and handle billing.",
};

export default async function SubscriptionPage() {
  const [{ me }, subscription, { usage }] = await Promise.all([
    getViewer(),
    getSubscription(),
    getAnalytics(),
  ]);

  return (
    <SubscriptionClientShell
      me={me}
      subscription={subscription}
      usage={usage}
    />
  );
}
