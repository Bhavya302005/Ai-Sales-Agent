type Health = {
  status: "ok" | "degraded";
  service: string;
  version: string;
};

async function loadHealth(): Promise<Health | null> {
  const baseUrl = process.env.API_BASE_URL ?? "http://localhost:8000";
  try {
    const response = await fetch(`${baseUrl}/health/live`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as Health;
  } catch {
    return null;
  }
}

export async function ApiHealth() {
  const health = await loadHealth();
  return (
    <article className="card">
      <h2>System health</h2>
      <div className="status" role="status">
        <span className={`dot ${health?.status === "ok" ? "ok" : ""}`} aria-hidden="true" />
        {health ? `API ${health.status} · v${health.version}` : "API unavailable"}
      </div>
    </article>
  );
}

