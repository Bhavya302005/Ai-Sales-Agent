"use client";
import Link from "next/link";
import { ArrowLeft, Book, Zap, Shield, Mail } from "lucide-react";

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-surface text-on-surface font-sans py-20 px-6 md:px-12 lg:px-20 relative overflow-hidden">
      <div className="live-bg-pattern"></div>
      
      <div className="max-w-5xl mx-auto relative z-10">
        <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline transition-colors mb-12">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-on-surface">Documentation</h1>
        <p className="text-on-surface-variant text-lg mb-16 max-w-2xl">Learn how to maximize your outreach with Job Mail Loop.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          <div className="bg-surface-container border border-outline-variant/60 p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-6">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-on-surface">Getting Started</h3>
            <p className="text-on-surface-variant leading-relaxed mb-4">Learn how to connect your Gmail account securely, upload your resume, and configure your first AI agent.</p>
            <a href="#" className="text-primary font-semibold hover:underline">Read the guide &rarr;</a>
          </div>

          <div className="bg-surface-container border border-outline-variant/60 p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 mb-6">
              <Mail className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-on-surface">Campaign Management</h3>
            <p className="text-on-surface-variant leading-relaxed mb-4">Master the Bulk BCC feature, learn how to import CSV lists, and understand daily sending limits.</p>
            <a href="#" className="text-emerald-500 font-semibold hover:underline">Read the guide &rarr;</a>
          </div>

          <div className="bg-surface-container border border-outline-variant/60 p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-6 font-semibold">
              <Book className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-on-surface">Templates & Personalization</h3>
            <p className="text-on-surface-variant leading-relaxed mb-4">Discover how the AI tailors each email to specific recruiters and how to inject your custom signature.</p>
            <a href="#" className="text-purple-400 font-semibold hover:underline">Read the guide &rarr;</a>
          </div>

          <div className="bg-surface-container border border-outline-variant/60 p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 mb-6">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-on-surface">Security & Privacy</h3>
            <p className="text-on-surface-variant leading-relaxed mb-4">Deep dive into our OAuth implementation, token management, and data handling protocols.</p>
            <a href="#" className="text-orange-500 font-semibold hover:underline">Read the guide &rarr;</a>
          </div>
        </div>
      </div>
    </div>
  );
}
