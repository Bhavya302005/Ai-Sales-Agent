"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface text-on-surface font-sans py-20 px-6 md:px-12 lg:px-20 relative overflow-hidden">
      <div className="live-bg-pattern"></div>
      
      <div className="max-w-4xl mx-auto relative z-10">
        <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline transition-colors mb-12">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-8 text-on-surface">Terms of Service</h1>
        <p className="text-on-surface-variant mb-12">Last Updated: May 23, 2026</p>

        <div className="space-y-12 text-on-surface-variant leading-relaxed">
          <section>
            <h2 className="text-2xl font-bold text-on-surface mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing and using Job Mail Loop ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. 
              If you do not agree to abide by these terms, please do not use our Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-on-surface mb-4">2. Description of Service</h2>
            <p>
              Job Mail Loop provides an AI-powered email outreach tool designed to help users automate and personalize their job search emails. 
              The Service integrates with your personal Google account via OAuth to draft and send emails on your behalf.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-on-surface mb-4">3. User Responsibilities & Conduct</h2>
            <p className="mb-4">You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to use the Service:</p>
            <ul className="list-disc pl-6 space-y-2 text-on-surface-variant">
              <li>In any way that violates any applicable federal, state, local, or international law or regulation (including CAN-SPAM Act).</li>
              <li>To send unsolicited, spam, or harassing communications.</li>
              <li>To impersonate or attempt to impersonate the Company, a Company employee, another user, or any other person or entity.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-on-surface mb-4">4. Google OAuth and Data Access</h2>
            <p>
              The Service uses Google OAuth APIs to access your Gmail account for the sole purpose of drafting, sending, and tracking emails you explicitly approve. 
              You retain full control over your account and may revoke our access at any time through your Google Security Settings. 
              We do not read your personal emails outside of the outreach threads initiated by the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-on-surface mb-4">5. Disclaimer of Warranties</h2>
            <p>
              The Service is provided "as is" and "as available" without any warranties of any kind, either express or implied. 
              We do not guarantee that the Service will secure you a job or interview, nor do we guarantee the delivery rates of your emails.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
