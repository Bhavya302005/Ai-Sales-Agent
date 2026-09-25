"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-surface text-on-surface font-sans py-20 px-6 md:px-12 lg:px-20 relative overflow-hidden">
      <div className="live-bg-pattern"></div>
      
      <div className="max-w-4xl mx-auto relative z-10">
        <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline transition-colors mb-12">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-8 text-on-surface">Cookie Policy</h1>
        <p className="text-on-surface-variant mb-12">Last Updated: May 23, 2026</p>

        <div className="space-y-12 text-on-surface-variant leading-relaxed">
          <section>
            <h2 className="text-2xl font-bold text-on-surface mb-4">What Are Cookies?</h2>
            <p>
              Cookies are small data files that are placed on your computer or mobile device when you visit a website. 
              They are widely used to make websites work, or work more efficiently, as well as to provide reporting information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-on-surface mb-4">How We Use Cookies</h2>
            <p className="mb-4">Job Mail Loop uses cookies for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-2 text-on-surface-variant">
              <li><strong>Strictly Necessary Cookies:</strong> Required to enable you to log in to your account, manage your secure session, and remember your basic settings (like dark mode and cookie preferences).</li>
              <li><strong>Analytics Cookies:</strong> Used to understand how visitors interact with our website. These cookies help provide information on metrics the number of visitors, bounce rate, traffic source, etc.</li>
              <li><strong>Tracking Pixels:</strong> We use microscopic, invisible image pixels embedded in the emails you send via our service to track open rates. This is a core functionality of the product.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-on-surface mb-4">Managing Your Cookies</h2>
            <p>
              You can set or amend your web browser controls to accept or refuse cookies. If you choose to reject cookies, you may still use our website though your access to some functionality and areas of our website may be restricted. 
              You can reset your choices at any time by clearing your browser cache and interacting with the cookie consent banner again.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
