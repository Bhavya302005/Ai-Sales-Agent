import Link from "next/link";

import { enterDemoWorkspace } from "./actions";

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link className="back-link" href="/">
          ← Overview
        </Link>
        <div className="eyebrow">Controlled access</div>
        <h1 className="auth-title">Sign in to your workspace</h1>
        <p className="lede">
          Access your lead discovery, qualification, calling, and follow-up workflow.
        </p>
        <form action={enterDemoWorkspace}>
          <button className="primary-button" type="submit">
            Continue to workspace
          </button>
        </form>
        <p className="fine-print">This local MVP uses a protected workspace session. Connect your identity provider before public deployment.</p>
      </section>
    </main>
  );
}
