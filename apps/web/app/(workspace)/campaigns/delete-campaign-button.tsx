"use client";

import { useTransition } from "react";

type Props = {
  campaignId: string;
  campaignName: string;
  deleteAction: (formData: FormData) => Promise<void>;
};

export function DeleteCampaignButton({ campaignId, campaignName, deleteAction }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const confirmed = window.confirm(
      `Delete campaign "${campaignName}"? This will remove its scheduled runs and lead assignments.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("campaign_id", campaignId);
      await deleteAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="campaign_id" type="hidden" value={campaignId} />
      <button
        type="submit"
        disabled={isPending}
        className="campaign-delete-btn"
        title="Delete campaign"
        aria-label={`Delete campaign ${campaignName}`}
      >
        {isPending ? "Deleting…" : "Delete campaign"}
      </button>
    </form>
  );
}
