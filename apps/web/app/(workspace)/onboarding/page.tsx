import { getOffering } from "@/lib/api";

import { BusinessSetup } from "./business-setup";

export default async function OnboardingPage() {
  const offering = await getOffering();
  const active = offering.versions.find((version) => version.is_active);

  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">Start here</div>
          <h1 className="page-title">Set up your business</h1>
          <p className="lede">Help SignalPath understand what you sell and which opportunities matter.</p>
        </div>
        <span className={`knowledge-state ${active?.is_callable ? "callable" : "blocked"}`}>
          {active?.is_callable ? "Current profile active" : "Setup required"}
        </span>
      </header>
      {active ? (
        <section className="active-profile-strip">
          <div><span>Current business</span><strong>{offering.product_name}</strong></div>
          <div><span>Services</span><strong>{active.services.length || "Needs review"}</strong></div>
          <div><span>Profile version</span><strong>{active.version}</strong></div>
          <div><span>Evidence sources</span><strong>{active.profile_source_count}</strong></div>
        </section>
      ) : null}
      <BusinessSetup productName={offering.product_name} active={active} />
    </>
  );
}
