"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface text-on-surface font-sans py-20 px-6 md:px-12 lg:px-20 relative overflow-hidden">
      <div className="live-bg-pattern"></div>
      
      <div className="max-w-4xl mx-auto relative z-10">
        <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline transition-colors mb-12">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-8 text-on-surface">Privacy Policy</h1>
        <p className="text-on-surface-variant mb-12">Last Updated: May 23, 2026</p>

        <div className="space-y-12 text-on-surface-variant leading-relaxed">
          <section>
            <h2 className="text-2xl font-bold text-on-surface mb-4">1. Information We Collect</h2>
            <p className="mb-4">We collect information that you provide directly to us when you use Job Mail Loop:</p>
            <ul className="list-disc pl-6 space-y-2 text-on-surface-variant">
              <li><strong>Google Account Information:</strong> Your email address and basic profile information via Google OAuth.</li>
              <li><strong>Resume Data:</strong> The text and contents of the resumes you upload for analysis.</li>
              <li><strong>Outreach Data:</strong> Target job titles, company names, and recruiter emails you input.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-on-surface mb-4">2. How We Use Your Information</h2>
            <p>
              We use your information exclusively to provide, maintain, and improve the Service. 
              Your resume data is processed in real-time by our AI to draft personalized emails. 
              <strong> We do not sell your personal data to third parties.</strong>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-on-surface mb-4">3. OAuth and Third-Party Access</h2>
            <p>
              Job Mail Loop's use of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.
              We only use your OAuth token to draft and send emails you explicitly approve, and to read tracking replies for the emails you sent via the platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-on-surface mb-4">4. Data Security</h2>
            <p>
              We have implemented measures designed to secure your personal information from accidental loss and from unauthorized access, use, alteration, and disclosure.
              All data transfers are encrypted via SSL/TLS. Your OAuth tokens are stored securely and encrypted at rest.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
