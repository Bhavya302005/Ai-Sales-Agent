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
        <h1 className="auth-title">Enter the demo workspace</h1>
        <p className="lede">
          Local development uses a signed test identity. Every API request still verifies its active
          organization membership before returning data.
        </p>
        <form action={enterDemoWorkspace}>
          <button className="primary-button" type="submit">
            Continue as demo owner
          </button>
        </form>
        <p className="fine-print">Live identity providers are not enabled or implied.</p>
      </section>
    </main>
  );
}

