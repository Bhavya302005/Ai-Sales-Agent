import type { EmailDraft, EmailOutreachStatus } from "./actions";
import { approveDraft, generateEmailDraft, sendDraft } from "./actions";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusClass(status: EmailDraft["status"]): string {
  switch (status) {
    case "sent": return "callable";
    case "approved": return "callable";
    case "draft": return "blocked";
    case "sending": return "blocked";
    case "failed": return "blocked";
    case "suppressed": return "blocked";
    default: return "blocked";
  }
}

function statusLabel(status: EmailDraft["status"]): string {
  switch (status) {
    case "draft": return "Draft — awaiting review";
    case "approved": return "Approved — ready to send";
    case "sending": return "Sending…";
    case "sent": return "Sent";
    case "failed": return "Send failed";
    case "suppressed": return "Suppressed";
    default: return status;
  }
}

// ---------------------------------------------------------------------------
// Single draft card
// ---------------------------------------------------------------------------

function DraftCard({ draft }: { draft: EmailDraft }) {
  const isDraft = draft.status === "draft";
  const isApproved = draft.status === "approved" || draft.status === "failed";
  const isSent = draft.status === "sent";

  return (
    <article
      className="campaign-card email-draft-card"
      style={{
        marginTop: 16,
        padding: 0,
        overflow: "hidden",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface, #fff)",
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .email-html-content p { margin: 0 0 12px 0; line-height: 1.6; }
            .email-html-content p:last-child { margin-bottom: 0; }
          `,
        }}
      />
      {/* Header bar */}
      <div
        className="section-heading"
        style={{
          padding: "12px 16px",
          background: "var(--surface-low, rgba(0,0,0,0.02))",
          borderBottom: "1px solid var(--border)",
          alignItems: "flex-start",
          gap: 12,
          margin: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="kicker" style={{ marginBottom: 2 }}>Outreach Email Preview</p>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, wordBreak: "break-word" }}>
            {draft.subject}
          </h3>
          <p className="fine-print" style={{ marginTop: 4 }}>
            To: <strong>{draft.recipient_email}</strong>
            {isSent && draft.sent_at
              ? ` · Sent ${new Date(draft.sent_at).toLocaleString("en-IN")}`
              : null}
            {draft.opens_count > 0
              ? ` · ${draft.opens_count} open${draft.opens_count !== 1 ? "s" : ""}`
              : null}
          </p>
        </div>
        <span className={`knowledge-state ${statusClass(draft.status)}`} style={{ flexShrink: 0 }}>
          {statusLabel(draft.status)}
        </span>
      </div>

      {/* Realistic Email Letter Container */}
      <div style={{ padding: "16px" }}>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "16px 20px",
            color: "#1e293b",
            fontSize: 14,
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          {/* Header inside letter */}
          <div
            style={{
              paddingBottom: 10,
              marginBottom: 14,
              borderBottom: "1px solid rgba(0,0,0,0.08)",
              fontSize: 12,
              color: "#64748b",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div>
              <strong style={{ color: "#334155" }}>Subject: </strong>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>{draft.subject}</span>
            </div>
            <div>
              <strong style={{ color: "#334155" }}>To: </strong>
              <span>{draft.recipient_email}</span>
            </div>
          </div>

          {/* Full email body */}
          <div
            className="email-html-content"
            style={{
              maxHeight: 480,
              overflowY: "auto",
              paddingRight: 4,
            }}
            dangerouslySetInnerHTML={{ __html: draft.body_html }}
          />
        </div>

        {/* Action buttons */}
        {isDraft && (
          <form action={approveDraft} style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <input type="hidden" name="draft_id" value={draft.id} />
            <button className="primary-button" type="submit">
              Approve draft
            </button>
            <span className="fine-print" style={{ color: "var(--muted)" }}>
              Approve to unlock sending.
            </span>
          </form>
        )}

        {isApproved && (
          <form action={sendDraft} style={{ marginTop: 14 }}>
            <input type="hidden" name="draft_id" value={draft.id} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label className="consent-check" style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "flex-start" }}>
                <input name="consent_attested" type="checkbox" required />
                I confirm this contact consented to receive this outreach email
              </label>
              <button className="primary-button" type="submit" style={{ alignSelf: "flex-start" }}>
                Send email now →
              </button>
            </div>
          </form>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Generate draft form
// ---------------------------------------------------------------------------

function GenerateDraftForm({
  leadId,
  campaignId,
  recipientEmail,
}: {
  leadId: string;
  campaignId: string;
  recipientEmail: string | null | undefined;
}) {
  return (
    <form action={generateEmailDraft} style={{ marginTop: 8 }}>
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="campaign_id" value={campaignId} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!recipientEmail ? (
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
              Recipient email address
            </label>
            <input
              type="email"
              name="recipient_email"
              placeholder="e.g. contact@technova.com"
              required
              className="text-input"
              style={{
                width: "100%",
                maxWidth: 320,
                padding: "6px 10px",
                fontSize: 13,
                borderRadius: 6,
                border: "1px solid var(--border, #ccc)",
                background: "var(--input-bg, #fff)",
                color: "inherit",
              }}
            />
            <p className="fine-print" style={{ margin: "4px 0 0", color: "var(--muted)" }}>
              No email was on file for this lead. Enter an email address to generate an AI outreach draft.
            </p>
          </div>
        ) : (
          <>
            <input type="hidden" name="recipient_email" value={recipientEmail} />
            <p className="fine-print" style={{ margin: 0 }}>
              Generate a Gemini-drafted email grounded in this lead&apos;s evidence record.
              Sending to: <strong>{recipientEmail}</strong>
            </p>
          </>
        )}
        <label className="consent-check" style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "flex-start" }}>
          <input name="consent_attested" type="checkbox" required />
          I confirm this contact consented to receive outreach emails
        </label>
        <button className="secondary-button" type="submit" style={{ alignSelf: "flex-start" }}>
          Generate AI draft
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Email Outreach Panel — renders inside each campaign lead row
// ---------------------------------------------------------------------------

export function EmailOutreachPanel({
  campaignId,
  leadId,
  recipientEmail,
  drafts,
  status,
}: {
  campaignId: string;
  leadId: string;
  companyName: string;
  recipientEmail: string | null | undefined;
  drafts: EmailDraft[];
  status: EmailOutreachStatus;
}) {
  const activeDrafts = drafts.filter((d) => d.status !== "suppressed");
  const hasDraft = activeDrafts.length > 0;
  const latestDraft = activeDrafts[0];

  return (
    <details className="email-outreach-panel" style={{ marginTop: 12 }} open={hasDraft}>
      <summary
        style={{
          cursor: "pointer",
          fontSize: 13,
          color: "var(--muted)",
          userSelect: "none",
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
        Email outreach
        {latestDraft ? (
          <span
            className={`knowledge-state ${statusClass(latestDraft.status)}`}
            style={{ fontSize: 11, padding: "1px 6px" }}
          >
            {statusLabel(latestDraft.status)}
          </span>
        ) : null}
        {!status.enabled && (
          <span className="knowledge-state blocked" style={{ fontSize: 11, padding: "1px 6px" }}>
            Not configured
          </span>
        )}
      </summary>

      <div style={{ paddingTop: 4 }}>
        {!status.enabled && (
          <p className="fine-print" style={{ marginTop: 8, color: "var(--muted)" }}>
            Email outreach is not configured. Set <code>EMAIL_OUTREACH_MODE=sendgrid</code> and{" "}
            <code>SENDGRID_API_KEY</code> in your environment to enable it.
          </p>
        )}

        {status.enabled && !hasDraft && (
          <GenerateDraftForm
            leadId={leadId}
            campaignId={campaignId}
            recipientEmail={recipientEmail}
          />
        )}

        {status.enabled && activeDrafts.map((draft) => (
          <DraftCard key={draft.id} draft={draft} />
        ))}
      </div>
    </details>
  );
}
