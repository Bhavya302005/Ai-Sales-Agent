import { getOffering } from "@/lib/api";

import { approveOfferingVersion, createOfferingVersion } from "./actions";

export default async function OnboardingPage() {
  const offering = await getOffering();
  const active = offering.versions.find((version) => version.is_active);

  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">Approved knowledge</div>
          <h1 className="page-title">Offering and ICP</h1>
        </div>
        <span className={`knowledge-state ${active?.is_callable ? "callable" : "blocked"}`}>
          {active?.is_callable ? `Version ${active.version} callable` : "Calling blocked"}
        </span>
      </header>

      <section className="knowledge-summary">
        <div>
          <p className="kicker">Current product</p>
          <h2>{offering.product_name}</h2>
          <p>{active?.description ?? "No active approved version."}</p>
        </div>
        {active ? (
          <dl className="knowledge-facts">
            <div><dt>Geographies</dt><dd>{active.icp.geographies.join(", ")}</dd></div>
            <div><dt>Industries</dt><dd>{active.icp.industries.join(", ")}</dd></div>
            <div><dt>Needs</dt><dd>{active.icp.needs.join(", ")}</dd></div>
            <div><dt>Pricing guardrail</dt><dd>{active.pricing_policy}</dd></div>
          </dl>
        ) : null}
      </section>

      <div className="knowledge-layout">
        <section className="knowledge-form-panel">
          <div className="section-heading">
            <div>
              <p className="kicker">Create immutable draft</p>
              <h2>Next offering version</h2>
            </div>
          </div>
          <form action={createOfferingVersion} className="knowledge-form">
            <label className="wide-field">
              Company offering description
              <textarea name="description" required minLength={20} rows={4} defaultValue={active?.description} />
            </label>
            <label>
              ICP geographies — one per line
              <textarea name="geographies" required rows={4} defaultValue={active?.icp.geographies.join("\n")} />
            </label>
            <label>
              ICP industries — one per line
              <textarea name="industries" required rows={4} defaultValue={active?.icp.industries.join("\n")} />
            </label>
            <label className="wide-field">
              Customer needs — one per line
              <textarea name="needs" required rows={4} defaultValue={active?.icp.needs.join("\n")} />
            </label>
            <label>
              Exclusions / prohibited promises
              <textarea name="exclusions" required rows={5} defaultValue={active?.exclusions.join("\n")} />
            </label>
            <label>
              Approved facts — `label: factual answer`
              <textarea
                name="facts"
                required
                rows={5}
                defaultValue={active ? Object.entries(active.facts).map(([key, value]) => `${key}: ${value}`).join("\n") : ""}
              />
            </label>
            <label className="wide-field">
              Pricing policy
              <textarea name="pricing_policy" required minLength={10} rows={3} defaultValue={active?.pricing_policy} />
            </label>
            <label>
              Qualification questions
              <textarea name="qualification_questions" required rows={5} defaultValue={active?.qualification_questions.join("\n")} />
            </label>
            <label>
              Human-handoff conditions
              <textarea name="handoff_conditions" required rows={5} defaultValue={active?.handoff_conditions.join("\n")} />
            </label>
            <div className="wide-field form-submit-row">
              <p>Saving creates a new draft. It cannot be used for calls until an owner approves it.</p>
              <button className="primary-button" type="submit">Save new draft</button>
            </div>
          </form>
        </section>

        <aside className="version-panel">
          <p className="kicker">Approval history</p>
          <h2>Versions</h2>
          <div className="version-list">
            {offering.versions.map((version) => (
              <article className="version-card" key={version.id}>
                <div>
                  <strong>Version {version.version}</strong>
                  <span>{version.is_callable ? "Active · callable" : version.approved_at ? "Approved · inactive" : "Draft · blocked"}</span>
                </div>
                <p>{version.description}</p>
                {!version.approved_at ? (
                  <form action={approveOfferingVersion} className="approval-form">
                    <input name="version_id" type="hidden" value={version.id} />
                    <label>
                      Approval reason
                      <textarea name="reason" required minLength={10} rows={3} defaultValue="Reviewed against offering, claims, pricing, and handoff policy." />
                    </label>
                    <button className="secondary-button" type="submit">Approve and activate</button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
