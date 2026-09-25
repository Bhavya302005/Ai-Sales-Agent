"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto", textAlign: "center", fontFamily: "sans-serif" }}>
      <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem" }}>
        Something went wrong!
      </h2>
      <p style={{ color: "red", marginBottom: "1.5rem", background: "#fee", padding: "1rem", borderRadius: "8px" }}>
        {error.message || "An unexpected error occurred. The backend service might be down."}
      </p>
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
        <button
          onClick={() => reset()}
          style={{ padding: "0.5rem 1rem", background: "#333", color: "#fff", borderRadius: "4px", border: "none", cursor: "pointer" }}
        >
          Try again
        </button>
        <Link 
          href="/login" 
          style={{ padding: "0.5rem 1rem", border: "1px solid #ccc", borderRadius: "4px", textDecoration: "none", color: "inherit" }}
        >
          Return to Login
        </Link>
      </div>
    </div>
  );
}
