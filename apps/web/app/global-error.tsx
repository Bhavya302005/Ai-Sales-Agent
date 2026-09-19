"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="auth-shell">
          <section className="auth-panel">
            <div className="eyebrow">Something went wrong</div>
            <h1 className="auth-title">The workspace could not be loaded.</h1>
            <button className="primary-button" onClick={reset} type="button">
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}

