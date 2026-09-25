"use client";

import { useFormStatus } from "react-dom";

export function RefreshLeadsButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="leads-action-btn primary"
      type="submit"
      disabled={pending}
      style={{
        opacity: pending ? 0.8 : 1,
        cursor: pending ? "wait" : "pointer",
        transition: "all 0.2s ease",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      {pending ? (
        <>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              animation: "spin 1s linear infinite",
              flexShrink: 0,
            }}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span>Scanning Exa & enriching…</span>
        </>
      ) : (
        <>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          <span>Refresh leads</span>
        </>
      )}
    </button>
  );
}
