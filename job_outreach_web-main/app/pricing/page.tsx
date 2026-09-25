'use client';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase/client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Check,
  X,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Lock,
  Mail,
  Sparkles,
} from 'lucide-react';

/* ═══════════════════════════════════════════════
   SOCIAL ICON SVGs
═══════════════════════════════════════════════ */
const Linkedin = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const Twitter = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
  </svg>
);

const Instagram = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    });
    if (error) toast.error("Error logging in: " + error.message);
  };

  const comparisonData = [
    {
      category: 'Core Limits & Sending',
      features: [
        { name: 'Monthly outreach drafts', free: '50 drafts', pro: 'Unlimited', scale: 'Unlimited' },
        { name: 'Connected Gmail accounts', free: '1 account', pro: '1 account', scale: 'Up to 5 accounts' },
        { name: 'AI generation speed', free: 'Standard', pro: 'Priority', scale: 'Priority + custom models' },
        { name: 'Bulk drafting mode', free: '✗', pro: '✓', scale: '✓' },
      ],
    },
    {
      category: 'AI & Personalization',
      features: [
        { name: 'Hyper-personalized pitches', free: '✓', pro: '✓', scale: '✓' },
        { name: 'Recruiter reply detection', free: '✗', pro: '✓', scale: '✓' },
        { name: 'Resume & ATS keyword optimizer', free: '✗', pro: '✓', scale: '✓' },
        { name: 'Custom outreach template editor', free: '✗', pro: '✗', scale: '✓' },
      ],
    },
    {
      category: 'Tracking & Deliverability',
      features: [
        { name: 'Invisible email open pixel', free: 'Basic tracking', pro: 'Real-time notifications', scale: 'Real-time notifications' },
        { name: 'Custom tracking subdomains', free: '✗', pro: '✗', scale: '✓' },
        { name: 'Outreach deliverability advisor', free: '✗', pro: '✓', scale: '✓' },
      ],
    },
    {
      category: 'Support & Developer Tools',
      features: [
        { name: 'Customer support', free: 'Community', pro: '24/7 Email & Chat', scale: 'Dedicated Manager' },
        { name: 'Developer API access', free: '✗', pro: '✗', scale: '✓' },
        { name: '1-on-1 setup session', free: '✗', pro: '✗', scale: '✓' },
      ],
    },
  ];

  return (
    <div className="landing-page min-h-screen bg-[#FAFCFF] relative overflow-hidden select-none">
      {/* Background patterns */}
      <div className="absolute inset-0 lp-dot-grid opacity-70 pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-[600px] bg-gradient-to-b from-[#0EA5E9]/[0.03] to-transparent pointer-events-none" />
      
      {/* Decorative Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#0EA5E9]/5 blur-[120px] pointer-events-none lp-orb-1" />
      <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#6366F1]/5 blur-[150px] pointer-events-none lp-orb-2" />

      {/* Header Navigation */}
      <header className="relative z-20 max-w-7xl mx-auto px-6 py-6 md:py-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <img src="/favicon.ico" alt="Job Mail Loop Logo" className="h-8 w-auto object-contain" />
          <span className="text-lg md:text-xl font-bold tracking-tight lp-gradient-text" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Job Mail Loop
          </span>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-[#0C4A6E] bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#0EA5E9]/20 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </header>

      {/* Hero Header */}
      <section className="relative z-10 pt-12 pb-16 text-center max-w-3xl mx-auto px-6">
        <span className="inline-block text-xs font-bold tracking-[0.25em] uppercase text-[#0EA5E9] mb-5 px-4 py-1.5 rounded-full bg-[#0EA5E9]/[0.06] border border-[#0EA5E9]/[0.1]">
          Pricing
        </span>
        <h1 className="text-4xl md:text-6xl font-bold tracking-[-0.03em] text-[#0C4A6E] mb-6 leading-tight">
          SaaS Outreach plans<br />
          <span className="lp-shimmer-text">built for scale.</span>
        </h1>
        <p className="text-[#64748B] text-lg md:text-xl max-w-xl mx-auto leading-relaxed">
          Select the pricing tier that matches your career search velocity. Upgrade, downgrade, or cancel at any time.
        </p>
      </section>

      {/* Toggle & Pricing Content Wrapper with Blur & Coming Soon Overlay */}
      <div className="relative max-w-6xl mx-auto px-6 mb-28">
        {/* Blurred Content */}
        <div className="blur-[6px] pointer-events-none select-none">
          {/* Toggle */}
          <div className="flex items-center justify-center gap-4 mb-16">
            <span className={`text-sm font-semibold transition-colors duration-300 ${!isAnnual ? 'text-[#0C4A6E]' : 'text-[#64748B]'}`}>
              Monthly billing
            </span>
            <button
              disabled
              className="relative w-14 h-8 rounded-full bg-[#0EA5E9]/10 border border-[#0EA5E9]/20 p-1 flex items-center"
              aria-label="Toggle annual billing"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-[#0EA5E9] to-[#6366F1]" />
            </button>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold transition-colors duration-300 ${isAnnual ? 'text-[#0C4A6E]' : 'text-[#64748B]'}`}>
                Annual billing
              </span>
              <span className="text-[10px] font-bold tracking-wider uppercase bg-[#EC4899]/10 text-[#EC4899] px-2 py-0.5 rounded-full border border-[#EC4899]/20">
                Save 20%
              </span>
            </div>
          </div>

          {/* Pricing Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch max-w-5xl mx-auto mb-28">
            {/* Free Plan */}
            <div className="lp-glass-card p-8 rounded-3xl flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#0C4A6E] mb-2">Free</h3>
                <p className="text-sm text-[#64748B] mb-6">Perfect for testing the waters</p>
                <div className="flex items-baseline gap-1 mb-8">
                  <span className="text-4xl md:text-5xl font-extrabold text-[#0C4A6E]">$0</span>
                  <span className="text-sm text-[#64748B]">/ forever</span>
                </div>
                <ul className="space-y-4 mb-8">
                  {[
                    '50 personalized drafts',
                    'Standard AI response generation',
                    '1 connected Gmail account',
                    'Basic email open tracking',
                    'Community forum support',
                  ].map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-[#64748B]">
                      <Check className="w-5 h-5 text-[#0EA5E9] shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button className="w-full py-4 rounded-2xl font-bold text-[#0C4A6E] bg-[#0EA5E9]/[0.06] border border-[#0EA5E9]/0.1 flex items-center justify-center gap-2 text-sm">
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Pro Plan (Most Popular) */}
            <div className="lp-gradient-border-card p-8 flex flex-col justify-between relative shadow-xl">
              <div className="absolute top-4 right-4 bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] text-white text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-full z-10">
                Most Popular
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#0C4A6E] mb-2">Pro</h3>
                <p className="text-sm text-[#64748B] mb-6">Everything you need to accelerate your search</p>
                <div className="flex items-baseline gap-1 mb-8">
                  <span className="text-4xl md:text-5xl font-extrabold text-[#0C4A6E]">
                    {isAnnual ? '$15' : '$19'}
                  </span>
                  <span className="text-sm text-[#64748B]">/ month</span>
                </div>
                <ul className="space-y-4 mb-8">
                  {[
                    'Unlimited AI personalized drafts',
                    'Priority AI generation speed',
                    'Access to premium GPT-4/Claude models',
                    'Advanced recruiter reply detection',
                    'Resume & ATS keyword optimizer',
                    '24/7 dedicated support',
                  ].map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-[#64748B]">
                      <Check className="w-5 h-5 text-[#6366F1] shrink-0 mt-0.5" />
                      <span className={idx === 0 ? "font-semibold text-[#0C4A6E]" : ""}>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button className="w-full py-4 rounded-2xl font-bold text-white lp-btn-cta flex items-center justify-center gap-2 text-sm shadow-md">
                Upgrade to Pro
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Scale Plan */}
            <div className="lp-glass-card p-8 rounded-3xl flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#0C4A6E] mb-2">Scale</h3>
                <p className="text-sm text-[#64748B] mb-6">For power users and agency outreach</p>
                <div className="flex items-baseline gap-1 mb-8">
                  <span className="text-4xl md:text-5xl font-extrabold text-[#0C4A6E]">
                    {isAnnual ? '$39' : '$49'}
                  </span>
                  <span className="text-sm text-[#64748B]">/ month</span>
                </div>
                <ul className="space-y-4 mb-8">
                  {[
                    'Up to 5 connected Gmail accounts',
                    'Custom outreach template editor',
                    'Full Developer API access',
                    'Multi-inbox tracking dashboard',
                    'Custom tracking subdomains',
                    'Dedicated integration engineer',
                  ].map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-[#64748B]">
                      <Check className="w-5 h-5 text-[#0EA5E9] shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button className="w-full py-4 rounded-2xl font-bold text-[#0C4A6E] bg-[#0EA5E9]/[0.06] border border-[#0EA5E9]/0.1 flex items-center justify-center gap-2 text-sm">
                Scale Outreach
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Feature Comparison Table */}
          <div className="max-w-5xl mx-auto mb-28">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-[#0C4A6E] mb-4">
                Compare plans in detail
              </h2>
              <p className="text-[#64748B] text-base max-w-lg mx-auto">
                Take a closer look at what is included in each of our outreach plans.
              </p>
            </div>

            <div className="overflow-x-auto lp-glass-card rounded-3xl border border-[#E2E8F0] shadow-xl">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-white/40">
                    <th className="p-6 text-sm font-bold text-[#0C4A6E] w-2/5">Feature</th>
                    <th className="p-6 text-sm font-bold text-[#0C4A6E] w-1/5 text-center">Free</th>
                    <th className="p-6 text-sm font-bold text-[#0C4A6E] w-1/5 text-center bg-[#0EA5E9]/[0.02]">Pro</th>
                    <th className="p-6 text-sm font-bold text-[#0C4A6E] w-1/5 text-center">Scale</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.map((cat, catIdx) => (
                    <tr key={catIdx} className="contents">
                      {/* Category Header Row */}
                      <tr className="bg-[#0EA5E9]/[0.02] border-b border-[#E2E8F0]/80">
                        <td colSpan={4} className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[#0EA5E9]">
                          {cat.category}
                        </td>
                      </tr>
                      {/* Feature Rows */}
                      {cat.features.map((feat, featIdx) => (
                        <tr key={featIdx} className="border-b border-[#E2E8F0] last:border-b-0 hover:bg-white/20 transition-all">
                          <td className="p-6 text-sm font-semibold text-[#0C4A6E]">{feat.name}</td>
                          <td className="p-6 text-sm text-[#64748B] text-center">{feat.free}</td>
                          <td className="p-6 text-sm text-[#0C4A6E] text-center font-medium bg-[#0EA5E9]/[0.02]">{feat.pro}</td>
                          <td className="p-6 text-sm text-[#64748B] text-center">{feat.scale}</td>
                        </tr>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Centered Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-start pt-24 md:pt-36 z-20 pointer-events-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            className="mx-6 p-8 md:p-10 rounded-3xl bg-white/90 border border-[#0EA5E9]/15 shadow-2xl backdrop-blur-md max-w-md text-center flex flex-col items-center gap-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] flex items-center justify-center text-white shadow-lg animate-float">
              <Sparkles className="w-8 h-8" />
            </div>
            <span className="inline-block text-xs font-bold tracking-[0.2em] uppercase text-[#EC4899] px-3.5 py-1.5 rounded-full bg-[#EC4899]/10 border border-[#EC4899]/20">
              Coming Soon
            </span>
            <h3 className="text-2xl font-bold text-[#0C4A6E]">Plans are being finalized!</h3>
            <p className="text-sm text-[#64748B] leading-relaxed">
              We're tailoring the perfect outreach plans for you. Standard features remain free to explore while we get things ready.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Security Banner CTA */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 mb-28 text-center">
        <div className="lp-glass-card rounded-3xl p-10 md:p-12 bg-white/70 border border-[#E2E8F0] shadow-lg flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-left">
            <h3 className="text-xl font-bold text-[#0C4A6E] mb-2">Have custom requirements?</h3>
            <p className="text-sm text-[#64748B]">We offer enterprise scale contracts, dedicated servers, and custom AI templates.</p>
          </div>
          <a
            href="mailto:pateldhruv.99799@gmail.com"
            className="px-6 py-3.5 rounded-xl font-bold text-white lp-btn-cta cursor-pointer text-sm shrink-0 shadow-md inline-flex items-center gap-2"
          >
            Contact Sales
            <Mail className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* Standalone Footer */}
      <footer className="relative z-10 border-t border-[#0EA5E9]/[0.06] bg-white/70 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="text-xs text-[#94A3B8]">&copy; {new Date().getFullYear()} Job Mail Loop. All rights reserved.</div>
              <div className="flex items-center gap-1.5 ml-0 md:ml-4">
                {[
                  { href: 'mailto:pateldhruv.99799@gmail.com', icon: Mail, label: 'Email' },
                  { href: 'https://www.linkedin.com/in/dhruvkumar-patel-728575222/', icon: Linkedin, label: 'LinkedIn', ext: true },
                  { href: 'https://x.com/DhruvPa69359757', icon: Twitter, label: 'Twitter', ext: true },
                  { href: 'https://www.instagram.com/alba.laysan/', icon: Instagram, label: 'Instagram', ext: true },
                ].map((item, i) => (
                  <a
                    key={i}
                    href={item.href}
                    target={item.ext ? '_blank' : undefined}
                    rel={item.ext ? 'noopener noreferrer' : undefined}
                    className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#0EA5E9] hover:bg-[#0EA5E9]/[0.06] transition-all cursor-pointer"
                    title={item.label}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                  </a>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#94A3B8]">
              <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> SOC 2 Compliant</span>
              <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-emerald-500" /> End-to-End Encrypted</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
