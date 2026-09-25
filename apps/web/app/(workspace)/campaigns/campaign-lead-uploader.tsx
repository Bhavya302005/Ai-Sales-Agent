"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type Props = {
  campaignId: string;
  leadCount: number;
  importAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
};

export function CampaignLeadUploader({
  campaignId,
  leadCount,
  importAction,
  removeAction,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(leadCount === 0);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isRemoving, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`campaign_file_${campaignId}`);
      if (stored) {
        window.setTimeout(() => setSavedFileName(stored), 0);
      }
    } catch {
      // localStorage may be disabled in certain environments
    }
  }, [campaignId]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFileName(file.name);
    }
  }

  function handleClearSelection() {
    setSelectedFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleSubmit() {
    if (selectedFileName) {
      try {
        window.localStorage.setItem(`campaign_file_${campaignId}`, selectedFileName);
        setSavedFileName(selectedFileName);
      } catch {
        // localStorage ignore
      }
    }
  }

  function handleRemoveCsv() {
    const confirmed = window.confirm(
      "Remove uploaded CSV leads from this campaign? This will remove all imported contacts from this campaign."
    );
    if (!confirmed) return;

    try {
      window.localStorage.removeItem(`campaign_file_${campaignId}`);
    } catch {
      // localStorage ignore
    }
    setSavedFileName(null);
    handleClearSelection();
    setIsExpanded(true);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("campaign_id", campaignId);
      await removeAction(formData);
    });
  }

  if (leadCount > 0 && !isExpanded) {
    return (
      <div className="lead-imported-badge-row">
        <div className="lead-imported-info">
          <span className="lead-imported-dot" />
          <div>
            <span className="lead-imported-title">
              {savedFileName ? `Imported from ${savedFileName}` : "Consenting leads imported"}
            </span>
            <span className="lead-imported-count">
              ({leadCount} lead{leadCount === 1 ? "" : "s"} ready)
            </span>
          </div>
        </div>
        <div className="lead-imported-actions">
          <button
            type="button"
            className="lead-upload-toggle-btn"
            onClick={() => setIsExpanded(true)}
          >
            + Upload updated or additional leads (CSV/XLSX)
          </button>
          <button
            type="button"
            className="lead-remove-csv-btn"
            onClick={handleRemoveCsv}
            disabled={isRemoving}
            title="Remove uploaded CSV and its leads"
          >
            {isRemoving ? "Removing…" : "Remove uploaded CSV"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      {leadCount > 0 ? (
        <div className="lead-imported-badge-row">
          <div className="lead-imported-info">
            <span className="lead-imported-dot" />
            <div>
              <span className="lead-imported-title">
                {savedFileName ? `Imported from ${savedFileName}` : "Consenting leads imported"}
              </span>
              <span className="lead-imported-count">
                ({leadCount} lead{leadCount === 1 ? "" : "s"} currently in campaign)
              </span>
            </div>
          </div>
          <div className="lead-imported-actions">
            <button
              type="button"
              className="lead-upload-toggle-btn"
              onClick={() => setIsExpanded(false)}
            >
              Hide upload form
            </button>
            <button
              type="button"
              className="lead-remove-csv-btn"
              onClick={handleRemoveCsv}
              disabled={isRemoving}
              title="Remove uploaded CSV and its leads"
            >
              {isRemoving ? "Removing…" : "Remove uploaded CSV"}
            </button>
          </div>
        </div>
      ) : null}

      <form action={importAction} onSubmit={handleSubmit} className="lead-upload-form">
        <input name="campaign_id" type="hidden" value={campaignId} />
        <label>
          <span>
            {leadCount > 0
              ? "Upload additional or updated leads (CSV/XLSX, max 100 rows)"
              : "Upload consenting leads (CSV/XLSX, max 100 rows)"}
          </span>
          <input
            ref={fileInputRef}
            accept=".csv,.xlsx"
            name="file"
            required
            type="file"
            onChange={handleFileChange}
          />
        </label>
        {selectedFileName ? (
          <button
            type="button"
            className="text-button"
            onClick={handleClearSelection}
            style={{ fontSize: "12px", color: "var(--muted)", alignSelf: "center", whiteSpace: "nowrap" }}
            title="Clear selected file"
          >
            Clear selection
          </button>
        ) : null}
        <button className="secondary-button" type="submit">
          Validate and import
        </button>
      </form>
    </div>
  );
}
