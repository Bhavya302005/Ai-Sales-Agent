import { getAnalytics } from "@/lib/api";

const labels: Record<string, string> = {
  llm_tokens: "LLM tokens",
  stt_seconds: "STT seconds",
  tts_characters: "TTS characters",
  call_seconds: "Call seconds",
  enrichment_units: "Discovery units",
};

export default async function AnalyticsPage() {
  const { funnel, usage, discovery } = await getAnalytics();
  const stages = Object.entries(funnel);
  return (
    <>
      <header className="page-header">
        <div><div className="eyebrow">Measured outcomes</div><h1 className="page-title">Funnel and usage</h1></div>
        <span className="mode-badge">Stored events only</span>
      </header>
      <section className="analytics-panel">
        <div className="section-heading"><div><p className="kicker">Business funnel</p><h2>Traceable progression</h2></div></div>
        <div className="funnel-row">
          {stages.map(([stage, count]) => (
            <div key={stage}><strong>{count}</strong><span>{stage.replace("_", " ")}</span></div>
          ))}
        </div>
      </section>
      <div className="analytics-grid">
        <section className="analytics-panel">
          <p className="kicker">Discovery coverage</p><h2>Results by source and type</h2>
          <div className="breakdown-grid">
            <div>
              <h3>Source</h3>
              {discovery.by_source.map((item) => (
                <p key={item.label}><span>{item.label.replaceAll("_", " ")}</span><strong>{item.count}</strong></p>
              ))}
            </div>
            <div>
              <h3>Opportunity type</h3>
              {discovery.by_type.map((item) => (
                <p key={item.label}><span>{item.label.replaceAll("_", " ")}</span><strong>{item.count}</strong></p>
              ))}
            </div>
          </div>
        </section>
        <section className="analytics-panel">
          <p className="kicker">Provider usage</p><h2>Measured quantities</h2>
          <div className="usage-list">
            {usage.totals.map((item) => (
              <div key={item.unit}><span>{labels[item.unit] ?? item.unit}</span><strong>{Number(item.quantity).toLocaleString("en-IN")}</strong></div>
            ))}
          </div>
          <p className="fine-print">{usage.cost_label}</p>
        </section>
        <section className="analytics-panel">
          <p className="kicker">Operational signals</p><h2>Cost and reliability</h2>
          <div className="signal-grid">
            <div><span>Actionable leads</span><strong>{discovery.actionable}</strong></div>
            <div><span>Calls attempted</span><strong>{discovery.calls_attempted}</strong></div>
            <div><span>Calls completed</span><strong>{discovery.calls_completed}</strong></div>
            <div><span>Interested prospects</span><strong>{discovery.interested}</strong></div>
            <div><span>Estimated cost</span><strong>₹{Number(usage.total_estimated_cost_inr).toFixed(2)}</strong></div>
            <div><span>Actual cost</span><strong>{usage.total_actual_cost_inr === null ? "Unavailable" : `₹${Number(usage.total_actual_cost_inr).toFixed(2)}`}</strong></div>
            <div><span>Voice latency</span><strong>{usage.average_voice_latency_ms === null ? "Not measured" : `${usage.average_voice_latency_ms} ms`}</strong></div>
            <div><span>CRM retrying</span><strong>{usage.crm_retrying}</strong></div>
            <div><span>CRM action needed</span><strong>{usage.crm_action_required}</strong></div>
          </div>
        </section>
      </div>
    </>
  );
}
