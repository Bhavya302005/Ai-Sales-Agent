'use client';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, useRef, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  useSpring,
  useScroll,
  useInView,
  AnimatePresence,
  useMotionValueEvent,
} from 'framer-motion';
import {
  ShieldCheck,
  Activity,
  Lock,
  CheckCircle2,
  MousePointerClick,
  ArrowRight,
  Sparkles,
  Send,
  FileSearch,
  Target,
  ChevronDown,
  Star,
  Zap,
  Mail,
  Eye,
  Users,
  Shield,
  Menu,
  X,
  Edit2,
  Play,
  Rocket,
  TrendingUp,
  Clock,
  Briefcase,
  FileText,
  Building2,
  UserCheck,
  Inbox,
  Check,
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

/* ═══════════════════════════════════════════════
   3D TILT CARD COMPONENT (Enhanced)
═══════════════════════════════════════════════ */
function Tilt3DCard({ children, className = '', intensity = 8 }: { children: ReactNode; className?: string; intensity?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [intensity, -intensity]), { stiffness: 200, damping: 25 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-intensity, intensity]), { stiffness: 200, damping: 25 });
  const glowX = useTransform(x, [-0.5, 0.5], ['30%', '70%']);
  const glowY = useTransform(y, [-0.5, 0.5], ['30%', '70%']);

  const handleMouse = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  }, [x, y]);

  const handleLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <div className="lp-perspective" ref={ref} onMouseMove={handleMouse} onMouseLeave={handleLeave}>
      <motion.div style={{ rotateX, rotateY }} className={`lp-preserve-3d relative ${className}`}>
        {/* Dynamic glow that follows cursor */}
        <motion.div
          className="absolute inset-0 rounded-[inherit] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: useMotionValue(`radial-gradient(400px circle at ${glowX} ${glowY}, rgba(14, 165, 233, 0.06), transparent 60%)`),
          }}
        />
        {children}
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   WORD-BY-WORD TEXT REVEAL
═══════════════════════════════════════════════ */
function WordReveal({ text, className = '', delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(' ');
  return (
    <span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{
            duration: 0.5,
            delay: delay + i * 0.08,
            ease: [0.25, 0.46, 0.45, 0.94] as const,
          }}
          className="inline-block mr-[0.3em]"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

/* ═══════════════════════════════════════════════
   ANIMATED COUNTER (Enhanced with spring)
═══════════════════════════════════════════════ */
function AnimatedCounter({ target, suffix = '', duration = 2000 }: { target: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

/* ═══════════════════════════════════════════════
   FAQ ACCORDION WITH AnimatePresence
═══════════════════════════════════════════════ */
function FAQItem({ question, answer, isOpen, onClick }: { question: string; answer: string; isOpen: boolean; onClick: () => void }) {
  return (
    <div className="border-b border-[#0EA5E9]/[0.06]">
      <button onClick={onClick} className="w-full flex items-center justify-between py-6 text-left group cursor-pointer">
        <span className="text-base md:text-lg font-semibold text-[#0C4A6E] group-hover:text-[#0EA5E9] transition-colors pr-4">{question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }}
        >
          <ChevronDown className="w-5 h-5 text-[#94A3B8] shrink-0" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] as const }}
            className="overflow-hidden"
          >
            <p className="text-[#64748B] text-sm md:text-base leading-relaxed pb-6">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   GRADIENT ORBS BACKGROUND (Enhanced)
═══════════════════════════════════════════════ */
function GradientOrbs() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <div className="lp-orb-1 absolute -top-[300px] -right-[200px] w-[800px] h-[800px] rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.12)_0%,rgba(14,165,233,0.04)_40%,transparent_70%)]" />
      <div className="lp-orb-2 absolute top-[30%] -left-[250px] w-[700px] h-[700px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.1)_0%,rgba(99,102,241,0.03)_40%,transparent_70%)]" />
      <div className="lp-orb-3 absolute -bottom-[200px] right-[10%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.08)_0%,rgba(139,92,246,0.02)_40%,transparent_70%)]" />
      <div className="lp-orb-4 absolute top-[60%] left-[40%] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.06)_0%,transparent_60%)]" />
      <div className="absolute inset-0 lp-dot-grid opacity-30" />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SECTION WRAPPER WITH PARALLAX
═══════════════════════════════════════════════ */
function RevealSection({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <motion.section
      ref={ref}
      id={id}
      className={className}
      initial={{ opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 60 }}
      transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] as const }}
    >
      {children}
    </motion.section>
  );
}

/* ═══════════════════════════════════════════════
   ERROR BOUNDARY
═══════════════════════════════════════════════ */
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { this.setState({ errorInfo }); console.error("Caught error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#0C4A6E', background: '#FEF2F2', minHeight: '100vh' }}>
          <h1>Something went wrong.</h1>
          <pre>{this.state.error?.toString()}</pre>
          <pre>{this.state.errorInfo?.componentStack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ═══════════════════════════════════════════════
   STAGGERED CHILDREN
═══════════════════════════════════════════════ */
const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
} as const;

const staggerItem = {
  hidden: { opacity: 0, y: 30, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
} as const;

/* ═══════════════════════════════════════════════
   FLOATING BADGE (Animated)
═══════════════════════════════════════════════ */
function FloatingBadge({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.1, type: 'spring', stiffness: 200 }}
      className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/80 backdrop-blur-xl border border-[#0EA5E9]/[0.1] mb-8 shadow-lg shadow-[#0EA5E9]/[0.04] lp-gradient-border-card"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
      </span>
      <span className="text-[#0C4A6E] text-xs font-bold tracking-wide">{text}</span>
      <Rocket className="w-3.5 h-3.5 text-[#F97316]" />
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   SECTION HEADING
═══════════════════════════════════════════════ */
function SectionHeading({ badge, title, titleAccent, subtitle }: { badge: string; title: string; titleAccent?: string; subtitle?: string }) {
  return (
    <div className="text-center mb-20">
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="inline-block text-xs font-bold tracking-[0.25em] uppercase text-[#0EA5E9] mb-5 px-4 py-1.5 rounded-full bg-[#0EA5E9]/[0.06] border border-[#0EA5E9]/[0.1]"
      >
        {badge}
      </motion.span>
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1 }}
        className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-[-0.03em] text-[#0C4A6E] leading-[1.1]"
      >
        {title}
        {titleAccent && (
          <>
            <br className="hidden md:block" />
            <span className="lp-shimmer-text">{titleAccent}</span>
          </>
        )}
      </motion.h2>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-[#64748B] text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mt-6"
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN PAGE COMPONENT
═══════════════════════════════════════════════ */
export default function Home() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFAQ, setOpenFAQ] = useState<number | null>(0);
  const [bfCacheKey, setBfCacheKey] = useState(0);
  const [navScrolled, setNavScrolled] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);

  // Scroll Progress
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  // Hero parallax
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroY = useTransform(heroScrollProgress, [0, 1], [0, 50]);
  const heroOpacity = useTransform(heroScrollProgress, [0, 0.8], [1, 0]);
  const dashboardY = useTransform(heroScrollProgress, [0, 1], [0, 25]);
  const dashboardScale = useTransform(heroScrollProgress, [0, 0.6], [1, 0.97]);
  const dashboardRotate = useTransform(heroScrollProgress, [0, 0.6], [0, 0.5]);

  // Simulator
  const [openSimData, setOpenSimData] = useState([
    { id: 1, company: 'Google', role: 'Staff Engineer', opens: 0, replied: false },
    { id: 2, company: 'Stripe', role: 'Backend Dev', opens: 3, replied: false },
    { id: 3, company: 'OpenAI', role: 'Research Eng', opens: 0, replied: true },
  ]);
  const [approvalGuardActive, setApprovalGuardActive] = useState(true);
  const [activeEmailTab, setActiveEmailTab] = useState(0);

  const emailSamples = [
    { id: 'cold-pitch', name: 'The Direct Pitch', subject: 'Frontend Lead role at Vercel', body: "Hi team,\n\nI've been following Vercel's recent v15 release closely. I led a similar transition to Server Components at my current company, reducing load times by 40%.\n\nI noticed you're hiring a Frontend Lead. I'd love to bring my experience to your team and help scale your architecture.\n\nBest,\nAlex" },
    { id: 'follow-up', name: 'The Gentle Bump', subject: 'Re: Frontend Lead role at Vercel', body: "Hi again,\n\nI know things get busy, so just bumping this to the top of your inbox.\n\nI'm still very interested in the Frontend Lead position. Let me know if you have any questions about my background or if you'd be open to a quick chat next week.\n\nThanks,\nAlex" },
    { id: 'networking', name: 'The Networking Ask', subject: 'Quick question about the engineering culture at Stripe', body: "Hi Sarah,\n\nI saw your recent post about Stripe's developer experience team. As an engineer who is passionate about DevEx, I found your insights really valuable.\n\nI'm currently exploring new opportunities and would love to hear your thoughts on what it's like building tools internally at Stripe. Would you be open to a brief 10-minute coffee chat?\n\nBest,\nAlex" },
    { id: 'referral', name: 'The Alumni Referral', subject: 'Fellow Stanford alumni reaching out', body: "Hi John,\n\nI saw we both graduated from Stanford (Class of '18 here!) and I noticed you're currently an Engineering Manager at OpenAI.\n\nI recently applied for the NLP Engineer position and was hoping to learn a bit more about the team's roadmap. If you're open to it, I'd love to ask a few quick questions or see if you might be willing to refer me.\n\nThanks,\nAlex" },
  ];

  const [isAuthCallback, setIsAuthCallback] = useState(false);

  // Scroll-aware nav
  useEffect(() => {
    const handleScroll = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      const search = window.location.search;
      if (hash.includes('access_token') || search.includes('code=') || search.includes('error=')) {
        setIsAuthCallback(true);
      }
    }

    // Middleware handles redirecting authenticated users to /dashboard server-side.
    // This client-side listener is a fallback for edge cases like:
    // - User signs in on another tab
    // - OAuth callback with hash fragments (implicit flow fallback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        router.push('/dashboard');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    let hasLeft = false;
    const handlePageShow = (event: PageTransitionEvent) => { if (event.persisted) setBfCacheKey(prev => prev + 1); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') hasLeft = true;
      else if (document.visibilityState === 'visible' && hasLeft) { hasLeft = false; setBfCacheKey(prev => prev + 1); }
    };
    const handleFocus = () => { if (hasLeft) { hasLeft = false; setBfCacheKey(prev => prev + 1); } };
    const handlePopState = () => setBfCacheKey(prev => prev + 1);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

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

  const triggerSimOpen = (id: number) => {
    setOpenSimData(prev => prev.map(item => item.id === id ? { ...item, opens: item.opens + 1 } : item));
  };

  const faqs = [
    { q: "How does Job Mail Loop send emails?", a: "We use your personal Gmail account via official Google OAuth APIs. Emails are sent directly from your real inbox, not from a third-party server. This ensures maximum deliverability and authenticity." },
    { q: "Will recruiters know it's automated?", a: "No. Every email is hyper-personalized using AI that deeply analyzes your resume and the recruiter's background. Each message reads like a hand-crafted, individual pitch." },
    { q: "Is my data safe?", a: "Absolutely. We use military-grade encryption. Your resume data is processed in real-time and never stored on our servers. OAuth tokens are fully revokable at any time from your Google settings." },
    { q: "What does 'Without your approval, we don't mail' mean?", a: "Our AI drafts emails and queues them for your review. No email is ever sent automatically. You must physically review and click 'Send' on every single draft before it leaves your inbox." },
    { q: "How does open tracking work?", a: "We embed a microscopic, invisible tracking pixel in each email. When a recruiter opens your email, the pixel fires and our dashboard updates in real-time, showing you exactly when and how many times they read it." },
    { q: "Is it free to use?", a: "Yes! We offer 50 free personalized drafts when you sign up. No credit card required. Connect your Gmail, upload your resume, and start sending in under 2 minutes." },
  ];

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'Templates', href: '#templates' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Security', href: '#security' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Pricing', href: '#pricing' },
  ];

  if (isAuthCallback) return <div className="min-h-screen bg-[#FAFCFF]" />;

  return (
    <ErrorBoundary>
      <div className="landing-page min-h-screen overflow-x-hidden">
        {/* ─── SCROLL PROGRESS BAR ─── */}
        <motion.div className="lp-scroll-progress" style={{ scaleX }} />

        {/* ─── GRADIENT ORBS ─── */}
        <GradientOrbs />

        {/* ─── NAVBAR ─── */}
        <motion.nav
          className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${navScrolled ? 'lp-nav-scrolled' : 'bg-[#FAFCFF]/70 backdrop-blur-xl border-b border-[#0EA5E9]/[0.03]'}`}
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] as const }}
        >
          <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20 h-[72px] flex items-center justify-between">
            <motion.div whileHover={{ scale: 1.02 }} className="flex items-center gap-2.5 cursor-pointer">
              <img src="/favicon.ico" alt="Job Mail Loop Logo" className="h-10 md:h-11 w-auto object-contain" />
              <span className="text-xl md:text-2xl font-bold tracking-tight lp-gradient-text" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Job Mail Loop</span>
            </motion.div>

            <div className="hidden md:flex items-center gap-8 text-sm text-[#64748B] font-medium">
              {navLinks.map(link => (
                <motion.a key={link.href} href={link.href} whileHover={{ y: -1, color: '#0EA5E9' }} className="transition-colors duration-200 cursor-pointer">{link.label}</motion.a>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleLogin} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-[#0C4A6E] bg-[#0EA5E9]/[0.06] border border-[#0EA5E9]/[0.1] hover:bg-[#0EA5E9]/[0.12] transition-all cursor-pointer">Log In</motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleLogin} className="lp-btn-cta px-5 py-2.5 text-sm cursor-pointer flex items-center gap-2">
                Get Started Free <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>

            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-[#0C4A6E] cursor-pointer">
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="md:hidden border-t border-[#0EA5E9]/[0.06] bg-white/90 backdrop-blur-2xl overflow-hidden"
              >
                <div className="px-6 py-6 flex flex-col gap-4">
                  {navLinks.map(link => (
                    <a key={link.href} href={link.href} onClick={() => setMobileMenuOpen(false)} className="text-[#64748B] hover:text-[#0EA5E9] text-base cursor-pointer">{link.label}</a>
                  ))}
                  <button onClick={handleLogin} className="mt-2 w-full py-3 rounded-xl text-sm font-semibold text-white lp-btn-cta cursor-pointer">Get Started Free</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.nav>

        {/* ═══════════════════════════════════════
           HERO SECTION (with Parallax)
        ═══════════════════════════════════════ */}
        <section ref={heroRef} className="relative z-10 pt-24 md:pt-36 pb-16 md:pb-24 lp-mesh-gradient overflow-hidden">
          {/* Floating Job-Related Icons (Clean visual cards with no text) */}
          <motion.div
            initial={{ opacity: 0, x: -40, y: 40 }}
            animate={{ 
              opacity: 1, 
              x: 0, 
              y: [0, -12, 0],
              rotate: [0, 5, 0]
            }}
            transition={{
              opacity: { duration: 0.6, delay: 1.2 },
              x: { duration: 0.6, delay: 1.2 },
              y: { duration: 6, repeat: Infinity, ease: "easeInOut" }
            }}
            className="absolute left-[5%] top-[22%] z-20 hidden xl:flex items-center justify-center w-14 h-14 bg-white/85 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-xl shadow-[#0C4A6E]/[0.04] text-emerald-600 select-none"
          >
            <FileText className="w-6 h-6" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40, y: 50 }}
            animate={{ 
              opacity: 1, 
              x: 0, 
              y: [0, 12, 0],
              rotate: [0, -5, 0]
            }}
            transition={{
              opacity: { duration: 0.6, delay: 1.4 },
              x: { duration: 0.6, delay: 1.4 },
              y: { duration: 7, repeat: Infinity, ease: "easeInOut" }
            }}
            className="absolute right-[5%] top-[26%] z-20 hidden xl:flex items-center justify-center w-14 h-14 bg-white/85 backdrop-blur-xl border border-[#8B5CF6]/20 rounded-2xl shadow-xl shadow-[#0C4A6E]/[0.04] text-[#8B5CF6] select-none"
          >
            <UserCheck className="w-6 h-6" />
          </motion.div>

          {/* Floating Briefcase Icon */}
          <motion.div
            animate={{ 
              y: [0, -12, 0],
              rotate: [0, 6, 0]
            }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            className="absolute left-[6%] bottom-[12%] z-25 hidden lg:flex items-center justify-center w-11 h-11 rounded-xl bg-white/80 border border-[#0EA5E9]/10 shadow-lg shadow-[#0C4A6E]/[0.03] text-[#0EA5E9] select-none"
          >
            <Briefcase className="w-4.5 h-4.5" />
          </motion.div>

          {/* Floating Inbox Icon */}
          <motion.div
            animate={{ 
              y: [0, 12, 0],
              rotate: [0, -6, 0]
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute right-[6%] bottom-[16%] z-25 hidden lg:flex items-center justify-center w-11 h-11 rounded-xl bg-white/80 border border-[#8B5CF6]/10 shadow-lg shadow-[#0C4A6E]/[0.03] text-[#8B5CF6] select-none"
          >
            <Inbox className="w-4.5 h-4.5" />
          </motion.div>

          <motion.div style={{ y: heroY, opacity: heroOpacity }} className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20">
            <div className="text-center max-w-5xl mx-auto">
              <FloatingBadge text="Now in Public Beta — 50 Free Drafts" />

              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[90px] font-bold leading-[0.92] tracking-[-0.04em] mb-5 text-[#0C4A6E]">
                <WordReveal text="Your job search," delay={0.1} />
                <br />
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const }}
                  className="lp-shimmer-text inline-block"
                >
                  fully automated.
                </motion.span>
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="text-[#64748B] text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-8"
              >
                AI crafts hyper-personalized emails from your resume, sends them from your real Gmail, and tracks every open in real-time.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8"
              >
                <motion.button
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleLogin}
                  className="group w-full sm:w-80 h-14 flex items-center justify-center gap-2.5 rounded-2xl font-bold text-white lp-btn-cta text-base cursor-pointer"
                >
                  Start with Google — It&apos;s Free
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                </motion.button>
                <motion.a
                  whileHover={{ scale: 1.03, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  href="#how-it-works"
                  className="lp-btn-secondary w-full sm:w-80 h-14 flex items-center justify-center gap-2 rounded-2xl text-base cursor-pointer"
                >
                  <Play className="w-4 h-4" /> See How It Works
                </motion.a>
              </motion.div>

              {/* Trust stats inline */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.6 }}
                className="flex items-center justify-center gap-8 text-sm text-[#94A3B8] mt-4"
              >
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> No credit card</span>
                <span className="hidden sm:flex items-center gap-1.5"><Clock className="w-4 h-4 text-[#0EA5E9]" /> 2 min setup</span>
                <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-[#8B5CF6]" /> Enterprise-grade security</span>
              </motion.div>
            </div>
          </motion.div>

          {/* ─── 3D Dashboard Mockup (Parallax) ─── */}
          <motion.div
            style={{ y: dashboardY, scale: dashboardScale, rotateZ: dashboardRotate }}
            className="mt-20 max-w-5xl mx-auto px-6 md:px-12 lg:px-20"
          >
            <motion.div
              initial={{ opacity: 0, y: 80, rotateX: 12 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ duration: 1.2, delay: 0.8, ease: [0.25, 0.46, 0.45, 0.94] as const }}
              className="lp-perspective"
            >
              <Tilt3DCard intensity={6} className="lp-dashboard-shadow rounded-2xl overflow-hidden">
                <div className="bg-white border border-[#E2E8F0]/60 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#E2E8F0] bg-gradient-to-r from-[#F8FAFC] to-[#F0F9FF]">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                      <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                      <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                    </div>
                    <div className="ml-4 text-xs font-medium text-[#94A3B8] hidden sm:block">Job Mail Loop — Dashboard</div>
                  </div>
                  <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { icon: Mail, label: 'Emails Sent', value: '247', color: '#0EA5E9', bg: 'from-[#0EA5E9]/5 to-[#0EA5E9]/0' },
                      { icon: Eye, label: 'Total Opens', value: '1,842', color: '#8B5CF6', bg: 'from-[#8B5CF6]/5 to-[#8B5CF6]/0' },
                      { icon: Users, label: 'Replies', value: '34', color: '#10B981', bg: 'from-[#10B981]/5 to-[#10B981]/0' },
                    ].map((stat, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1.4 + i * 0.15 }}
                        whileHover={{ y: -3, scale: 1.02 }}
                        className={`bg-gradient-to-br ${stat.bg} border border-[#E2E8F0] rounded-xl p-5 cursor-pointer transition-shadow hover:shadow-md lp-stat-glow`}
                        style={{ animationDelay: `${i * 0.5}s` }}
                      >
                        <div className="flex items-center gap-2 text-[#94A3B8] text-xs font-medium mb-3">
                          <stat.icon className="w-4 h-4" style={{ color: stat.color }} /> {stat.label}
                        </div>
                        <div className="text-3xl font-bold text-[#0C4A6E]">{stat.value}</div>
                        <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: stat.color }}>
                          <TrendingUp className="w-3 h-3" /> +12% this week
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </Tilt3DCard>
            </motion.div>
          </motion.div>
        </section>

        {/* ─── SECTION DIVIDER ─── */}
        <div className="lp-section-divider" />

        {/* ═══ TRUST BAR ═══ */}
        <RevealSection className="relative z-10 bg-white/60 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20 py-20">
            <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-14">
              <motion.div variants={staggerItem} className="inline-flex items-center gap-2 mb-3">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <span className="text-emerald-600 font-bold tracking-wider uppercase text-xs">Trusted by top talent</span>
              </motion.div>
              <motion.h3 variants={staggerItem} className="text-3xl md:text-4xl font-bold text-[#0C4A6E] tracking-tight">
                Stop applying into the void. <span className="text-[#94A3B8]">Start getting replies.</span>
              </motion.h3>
            </motion.div>
            <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { value: 12000, suffix: '+', label: 'Emails Delivered', icon: Mail, color: '#0EA5E9' },
                { value: 68, suffix: '%', label: 'Avg Open Rate', icon: Eye, color: '#8B5CF6' },
                { value: 500, suffix: '+', label: 'Active Users', icon: Users, color: '#10B981' },
                { value: 2, suffix: ' min', label: 'Setup Time', icon: Clock, color: '#F97316' },
              ].map((stat, i) => (
                <motion.div key={i} variants={staggerItem} className="flex flex-col items-center p-6 rounded-2xl bg-white/60 border border-[#E2E8F0] hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer group">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 lp-icon-float" style={{ background: `${stat.color}10`, animationDelay: `${i * 0.3}s` }}>
                    <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                  </div>
                  <div className="text-3xl md:text-4xl font-bold text-[#0C4A6E] mb-1">
                    <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                  </div>
                  <div className="text-xs md:text-sm text-[#94A3B8] font-medium">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </RevealSection>

        <div className="lp-section-divider" />

        {/* ═══ HOW IT WORKS ═══ */}
        <RevealSection id="how-it-works" className="relative z-10 py-28 md:py-36">
          <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20">
            <SectionHeading badge="How It Works" title="From resume to recruiter inbox" titleAccent=" in 4 simple steps." />

            <div className="hidden md:block relative mb-8">
              <div className="absolute top-1/2 left-[12.5%] right-[12.5%] h-[3px] lp-timeline-line rounded-full -translate-y-1/2" />
            </div>

            <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {[
                { 
                  icon: Lock, 
                  num: '01', 
                  title: 'Connect Gmail', 
                  desc: 'Securely link your Gmail via OAuth. One click, zero passwords shared.', 
                  color: '#0EA5E9',
                  extra: (
                    <div className="mt-4 flex items-center justify-center gap-1.5 text-[#0EA5E9] select-none">
                      <Mail className="w-4 h-4" />
                      <div className="w-5 h-0.5 border-t border-dashed border-[#0EA5E9]/30" />
                      <Lock className="w-4 h-4" />
                    </div>
                  )
                },
                { 
                  icon: FileSearch, 
                  num: '02', 
                  title: 'Upload Resume', 
                  desc: 'Drop your PDF. AI extracts skills, experience & talking points.', 
                  color: '#6366F1',
                  extra: (
                    <div className="mt-4 flex items-center justify-center gap-1.5 text-[#6366F1] select-none">
                      <FileText className="w-4 h-4" />
                      <div className="w-5 h-0.5 border-t border-dashed border-[#6366F1]/30" />
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>
                  )
                },
                { 
                  icon: Target, 
                  num: '03', 
                  title: 'Import & Draft', 
                  desc: 'Add recruiter emails. AI writes unique pitches for each.', 
                  color: '#8B5CF6',
                  extra: (
                    <div className="mt-4 flex items-center justify-center gap-1.5 text-[#8B5CF6] select-none">
                      <Mail className="w-4 h-4" />
                      <div className="w-5 h-0.5 border-t border-dashed border-[#8B5CF6]/30" />
                      <Sparkles className="w-4 h-4 text-[#8B5CF6]" />
                    </div>
                  )
                },
                { 
                  icon: Send, 
                  num: '04', 
                  title: 'Approve & Send', 
                  desc: 'Review every draft. Nothing sends without your click.', 
                  color: '#10B981',
                  extra: (
                    <div className="mt-4 flex items-center justify-center gap-1.5 text-[#10B981] select-none">
                      <Send className="w-4 h-4" />
                      <div className="w-5 h-0.5 border-t border-dashed border-[#10B981]/30" />
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )
                },
              ].map((step, i) => (
                <motion.div key={i} variants={staggerItem} className="flex flex-col items-center text-center relative group">
                  <motion.div
                    whileHover={{ scale: 1.1, y: -6, rotate: 3 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    className="w-20 h-20 rounded-2xl bg-white border border-[#E2E8F0] flex items-center justify-center mb-6 shadow-xl shadow-[#0C4A6E]/[0.04] cursor-pointer relative z-10 group-hover:border-transparent group-hover:shadow-2xl transition-all duration-300"
                    style={{ boxShadow: `0 12px 40px ${step.color}12` }}
                  >
                    <step.icon className="w-8 h-8" style={{ color: step.color }} />
                  </motion.div>
                  <div className="text-[10px] font-bold tracking-[0.2em] uppercase mb-2" style={{ color: step.color }}>{step.num}</div>
                  <h3 className="text-lg font-bold mb-2 text-[#0C4A6E]">{step.title}</h3>
                  <p className="text-sm text-[#64748B] leading-relaxed max-w-[220px] mb-1">{step.desc}</p>
                  {step.extra}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </RevealSection>

        <div className="lp-section-divider" />

        {/* ═══ BENTO FEATURES ═══ */}
        <RevealSection id="features" className="relative z-10 py-28 bg-white/40 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20">
            <SectionHeading badge="Features" title="Everything you need to" titleAccent=" land interviews." />

            <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Simulator — Full Width */}
              <motion.div variants={staggerItem} className="md:col-span-12">
                <div className="lp-gradient-border-card p-8 md:p-10">
                  <div className="flex flex-col md:flex-row gap-8 items-center relative z-10">
                    <div className="flex-1">
                      <div className="w-12 h-12 rounded-xl bg-[#8B5CF6]/[0.08] border border-[#8B5CF6]/[0.15] flex items-center justify-center mb-6 lp-icon-float">
                        <Activity className="w-6 h-6 text-[#8B5CF6]" />
                      </div>
                      <h3 className="text-2xl font-bold mb-3 text-[#0C4A6E]">Live Outreach Simulator</h3>
                      <p className="text-[#64748B] text-base leading-relaxed mb-4">Click the button to simulate a recruiter opening your email. Watch tracking update instantly.</p>
                      <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Real-time tracking
                      </div>
                    </div>
                    <div className="flex-1 w-full max-w-md">
                      <div className="space-y-3">
                        {openSimData.map((item) => (
                          <motion.div
                            key={item.id}
                            layout
                            whileHover={{ scale: 1.01 }}
                            className="bg-white/90 border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                          >
                            <div>
                              <div className="font-bold text-sm text-[#0C4A6E]">{item.company}</div>
                              <div className="text-xs text-[#94A3B8]">{item.role}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <motion.span
                                key={`${item.id}-${item.opens}-${item.replied}`}
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                                className={`text-[11px] font-bold font-mono px-2.5 py-1 rounded-lg ${item.replied
                                  ? 'bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/15'
                                  : item.opens > 0
                                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/15'
                                    : 'bg-[#F1F5F9] text-[#94A3B8] border border-[#E2E8F0]'
                                  }`}
                              >
                                {item.replied ? 'replied' : item.opens > 0 ? `${item.opens}x opened` : 'unread'}
                              </motion.span>
                              <motion.button
                                whileHover={{ scale: 1.15 }}
                                whileTap={{ scale: 0.85 }}
                                onClick={() => triggerSimOpen(item.id)}
                                className="w-8 h-8 rounded-lg bg-white border border-[#E2E8F0] flex items-center justify-center text-[#94A3B8] hover:bg-[#0EA5E9] hover:text-white hover:border-[#0EA5E9] transition-all cursor-pointer shadow-sm"
                                title="Simulate recruiter opening"
                              >
                                <MousePointerClick className="w-4 h-4" />
                              </motion.button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Feature Cards */}
              {[
                { 
                  span: 'md:col-span-5', 
                  icon: Mail, 
                  color: '#6366F1', 
                  title: 'Authentic Gmail Delivery', 
                  desc: <>Everything ships from <strong className="text-[#0C4A6E]">your real Gmail address</strong>. No third-party mailer, no spam folder. Recruiters see a genuine person reaching out.</>,
                  extra: (
                    <div className="mt-4 bg-[#FAFCFF] border border-[#E2E8F0] rounded-xl p-4 group-hover:border-[#6366F1]/30 transition-all select-none flex flex-col gap-2 shadow-sm group-hover:shadow-md duration-300">
                      <div className="flex items-center justify-between text-[11px] text-[#94A3B8] font-bold">
                        <span className="text-[#6366F1] flex items-center gap-1.5"><Inbox className="w-3.5 h-3.5" /> Gmail Sent Items</span>
                        <span className="font-mono">Just now</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <div className="text-xs font-bold text-[#0C4A6E]">To: stripe_hiring@stripe.com</div>
                      </div>
                      <div className="text-[11px] text-[#64748B] italic pl-4">&quot;Direct outreach sent successfully&quot;</div>
                    </div>
                  )
                },
                { 
                  span: 'md:col-span-7', 
                  icon: Sparkles, 
                  color: '#0EA5E9', 
                  title: 'Hyper-Personalized Pitches', 
                  desc: 'Every email is uniquely crafted for each recruiter. Our AI analyzes the job description, the company, and your background.', 
                  extra: (
                    <div className="mt-4 bg-[#FAFCFF] border border-[#E2E8F0] rounded-xl p-4 group-hover:border-[#0EA5E9]/30 transition-all select-none flex flex-col gap-2 shadow-sm group-hover:shadow-md duration-300 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-[#0EA5E9]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="relative z-10 flex flex-col gap-1.5">
                        <div className="text-[10px] text-[#0EA5E9] font-bold uppercase tracking-wider flex items-center gap-1"><Sparkles className="w-3 h-3 animate-pulse" /> AI Personalization Segment</div>
                        <p className="text-xs text-[#64748B] leading-relaxed italic bg-gradient-to-r from-white via-[#F0F9FF] to-white border-l-2 border-[#0EA5E9] pl-3 py-1.5">
                          &quot;Hi Sarah, I saw Google&apos;s infra team is scaling Kubernetes... I led a similar migration at my last role, cutting deploys by 40%.&quot;
                        </p>
                      </div>
                    </div>
                  )
                },
                { 
                  span: 'md:col-span-6', 
                  icon: Zap, 
                  color: '#8B5CF6', 
                  title: 'One-Click to Direct Gmail', 
                  desc: 'Skip the complex inbox setups. Jump straight to your Gmail drafts or sent items with a single click.',
                  extra: (
                    <div className="mt-4 flex gap-2.5 select-none">
                      <motion.div whileHover={{ scale: 1.03, y: -1 }} className="bg-[#FAFCFF] border border-[#E2E8F0] rounded-xl px-4 py-2 text-xs font-bold text-[#64748B] flex items-center gap-2 shadow-sm hover:shadow-md hover:border-[#8B5CF6]/20 transition-all cursor-pointer">
                        <span className="w-2 h-2 rounded-full bg-amber-400" /> Drafts Folder
                      </motion.div>
                      <motion.div whileHover={{ scale: 1.03, y: -1 }} className="bg-[#FAFCFF] border border-[#E2E8F0] rounded-xl px-4 py-2 text-xs font-bold text-[#64748B] flex items-center gap-2 shadow-sm hover:shadow-md hover:border-[#8B5CF6]/20 transition-all cursor-pointer">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Sent Mail
                      </motion.div>
                    </div>
                  )
                },
                { 
                  span: 'md:col-span-6', 
                  icon: FileSearch, 
                  color: '#10B981', 
                  title: 'Intelligent Reply Scanner', 
                  desc: <>Only scan the messages <strong className="text-[#0C4A6E]">you sent from our app</strong>. We respect your privacy — our reply scanner isolates tracking to outreach emails.</> ,
                  extra: (
                    <div className="mt-4 bg-emerald-50/20 border border-emerald-500/10 rounded-xl p-4 flex items-center gap-3.5 select-none group-hover:bg-emerald-50/40 group-hover:border-emerald-500/20 transition-all duration-300 shadow-sm relative overflow-hidden">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0 shadow-inner">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div className="text-xs font-extrabold text-[#0C4A6E] flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                          Reply Scanned
                        </div>
                        <div className="text-[11px] text-[#64748B] italic">&quot;Hey Alex, let&apos;s chat next Tuesday!&quot;</div>
                      </div>
                    </div>
                  )
                },
              ].map((feat, i) => (
                <motion.div key={i} variants={staggerItem} className={feat.span}>
                  <Tilt3DCard intensity={6} className="lp-glass-card rounded-2xl p-8 md:p-10 h-full group">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 lp-icon-float" style={{ background: `${feat.color}10`, border: `1px solid ${feat.color}20`, animationDelay: `${i * 0.4}s` }}>
                      <feat.icon className="w-6 h-6" style={{ color: feat.color }} />
                    </div>
                    <h3 className="text-2xl font-bold mb-3 text-[#0C4A6E]">{feat.title}</h3>
                    <p className="text-[#64748B] text-base leading-relaxed">{feat.desc}</p>
                    {feat.extra}
                  </Tilt3DCard>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </RevealSection>

        <div className="lp-section-divider" />

        {/* ═══ EMAIL TEMPLATES ═══ */}
        <RevealSection id="templates" className="relative z-10 py-28 md:py-36">
          <div className="max-w-6xl mx-auto px-6 md:px-12 lg:px-20">
            <SectionHeading badge="Templates" title="Pitches that actually" titleAccent=" get replies." subtitle="From aggressive cold outreach to subtle networking, our AI nails the perfect tone for every scenario." />

            <div className="flex flex-col lg:flex-row gap-8">
              <div className="lg:w-1/3 flex flex-col gap-3">
                {emailSamples.map((sample, index) => (
                  <motion.button
                    key={sample.id}
                    onClick={() => setActiveEmailTab(index)}
                    whileHover={{ x: 6 }}
                    whileTap={{ scale: 0.98 }}
                    className={`text-left p-5 rounded-2xl transition-all duration-300 border cursor-pointer ${activeEmailTab === index
                      ? 'bg-[#0EA5E9]/[0.06] border-[#0EA5E9]/20 shadow-md shadow-[#0EA5E9]/5'
                      : 'bg-white/60 border-[#E2E8F0] hover:bg-white/80 hover:shadow-sm'
                      }`}
                  >
                    <div className={`font-bold text-lg mb-1 ${activeEmailTab === index ? 'text-[#0EA5E9]' : 'text-[#0C4A6E]'}`}>{sample.name}</div>
                    <div className="text-sm text-[#94A3B8] truncate">{sample.subject}</div>
                  </motion.button>
                ))}
              </div>

              <div className="lg:w-2/3 bg-white rounded-2xl overflow-hidden flex flex-col shadow-2xl shadow-[#0C4A6E]/[0.06] border border-[#E2E8F0]">
                <div className="bg-gradient-to-r from-[#F8FAFC] to-[#F0F9FF] border-b border-[#E2E8F0] px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                      <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                      <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                    </div>
                    <div className="ml-4 text-xs font-mono text-[#94A3B8] font-medium hidden sm:block">New Message</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 rounded-lg text-[11px] md:text-xs font-semibold text-[#64748B] bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors flex items-center gap-1.5 cursor-pointer"><Edit2 className="w-3 h-3" /> Edit</button>
                    <button className="px-3 py-1.5 rounded-lg text-[11px] md:text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors flex items-center gap-1.5 shadow-sm shadow-emerald-500/20 cursor-pointer"><CheckCircle2 className="w-3 h-3" /> Approve & Send</button>
                  </div>
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeEmailTab}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }}
                    className="p-8 flex-1"
                  >
                    <div className="mb-6 pb-6 border-b border-[#E2E8F0]">
                      <div className="text-sm text-[#64748B] mb-2"><span className="w-16 inline-block font-medium">To:</span> <span className="text-[#0f172a] bg-[#F1F5F9] px-2 py-0.5 rounded-md text-xs font-medium border border-[#E2E8F0]">recruiter@company.com</span></div>
                      <div className="text-sm text-[#64748B] mb-2"><span className="w-16 inline-block font-medium">From:</span> <span className="text-[#0f172a] bg-[#F1F5F9] px-2 py-0.5 rounded-md text-xs font-medium border border-[#E2E8F0]">you@gmail.com</span></div>
                      <div className="text-sm text-[#64748B] mt-4"><span className="w-16 inline-block font-medium">Subject:</span> <span className="text-[#0C4A6E] font-bold text-base">{emailSamples[activeEmailTab].subject}</span></div>
                    </div>
                    <div className="text-[#334155] text-[15px] leading-relaxed whitespace-pre-wrap select-text">{emailSamples[activeEmailTab].body}</div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </RevealSection>

        <div className="lp-section-divider" />

        {/* ═══ SECURITY ═══ */}
        <RevealSection id="security" className="relative z-10 py-28 md:py-36 bg-white/40 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-6 md:px-12 lg:px-20">
            <div className="flex flex-col items-center text-center">
              <motion.div
                whileHover={{ scale: 1.08, rotate: 5 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                className="w-24 h-24 rounded-3xl bg-emerald-500/[0.06] border border-emerald-500/[0.1] flex items-center justify-center mb-8 shadow-xl shadow-emerald-500/[0.06] cursor-pointer"
              >
                <Shield className="w-12 h-12 text-emerald-500" />
              </motion.div>

              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-[-0.03em] mb-6 text-[#0C4A6E] leading-[1.1]">
                Without your approval,<br />
                <span className="text-emerald-500">we don&apos;t mail.</span>
              </h2>

              <p className="text-[#64748B] text-lg max-w-2xl mb-14 leading-relaxed">
                Our AI queues drafts for your review. <strong className="text-[#0C4A6E]">No email is ever sent automatically.</strong> You must physically approve every message.
              </p>

              <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full mb-14">
                {[
                  { icon: Lock, title: 'Zero Auto-Send', desc: 'Human approval required for every single draft.', color: '#10B981' },
                  { icon: ShieldCheck, title: 'OAuth Security', desc: 'Official Google tokens. Fully revokable anytime.', color: '#10B981' },
                  { icon: Eye, title: 'Full Transparency', desc: 'See every draft, every edit, every status update.', color: '#10B981' },
                ].map((item, i) => (
                  <motion.div key={i} variants={staggerItem}>
                    <Tilt3DCard intensity={5} className="lp-glass-card rounded-xl p-6 text-left h-full">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ background: `${item.color}10` }}>
                        <item.icon className="w-5 h-5" style={{ color: item.color }} />
                      </div>
                      <h4 className="text-base font-bold mb-2 text-[#0C4A6E]">{item.title}</h4>
                      <p className="text-sm text-[#64748B]">{item.desc}</p>
                    </Tilt3DCard>
                  </motion.div>
                ))}
              </motion.div>

              {/* Safety Lock Widget */}
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-6 md:p-8 max-w-sm w-full text-left relative overflow-hidden shadow-xl shadow-[#0C4A6E]/[0.03]"
              >
                <div className={`absolute inset-0 transition-colors duration-500 ${approvalGuardActive ? 'bg-emerald-500/[0.02]' : 'bg-red-500/[0.02]'}`} />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <div className="text-sm font-bold mb-0.5 text-[#0C4A6E]">Safety Lock</div>
                      <div className="text-xs text-[#94A3B8]">Toggle to see how it works</div>
                    </div>
                    <button onClick={() => setApprovalGuardActive(!approvalGuardActive)} className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 cursor-pointer ${approvalGuardActive ? 'bg-emerald-500' : 'bg-[#CBD5E1]'}`}>
                      <motion.div className="w-6 h-6 bg-white rounded-full shadow-md" animate={{ x: approvalGuardActive ? 24 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
                    </button>
                  </div>
                  <motion.div
                    layout
                    className={`rounded-lg p-3.5 text-center text-xs font-bold font-mono border transition-colors ${approvalGuardActive ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}
                  >
                    {approvalGuardActive
                      ? <span className="flex items-center justify-center gap-2"><Lock className="w-3.5 h-3.5" /> LOCKED — EMAILS HELD FOR REVIEW</span>
                      : <span className="flex items-center justify-center gap-2 animate-pulse">⚠ UNLOCKED — AUTO-SEND ACTIVE</span>
                    }
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </div>
        </RevealSection>

        <div className="lp-section-divider" />

        {/* ═══ TESTIMONIALS ═══ */}
        <RevealSection className="relative z-10 py-28 md:py-36">
          <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20">
            <SectionHeading badge="Testimonials" title="Loved by job seekers" titleAccent=" everywhere." />

            <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { name: 'Arjun M.', role: 'Software Engineer', quote: 'I landed 3 interviews in my first week. The personalized pitches genuinely sounded like me. Recruiters even complimented my emails.', stars: 5, gradient: 'from-[#0EA5E9] to-[#6366F1]' },
                { name: 'Priya K.', role: 'Product Manager', quote: 'The open tracking is a game changer. I knew exactly when to follow up and it helped me close an offer at a top-tier startup.', stars: 5, gradient: 'from-[#6366F1] to-[#8B5CF6]' },
                { name: 'Rahul S.', role: 'Data Scientist', quote: 'Love that nothing sends without my approval. I reviewed every draft, made tiny tweaks, and sent with confidence. Got a 40% response rate.', stars: 5, gradient: 'from-[#8B5CF6] to-[#EC4899]' },
              ].map((t, i) => (
                <motion.div key={i} variants={staggerItem}>
                  <Tilt3DCard intensity={5} className="lp-glass-card rounded-2xl p-8 h-full group">
                    <div className="flex gap-0.5 mb-5">
                      {Array.from({ length: t.stars }).map((_, j) => (
                        <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                    <p className="text-[#334155] text-sm leading-relaxed mb-6 select-text">&quot;{t.quote}&quot;</p>
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white text-sm font-bold shadow-lg`}>
                        {t.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#0C4A6E]">{t.name}</div>
                        <div className="text-xs text-[#94A3B8]">{t.role}</div>
                      </div>
                    </div>
                  </Tilt3DCard>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </RevealSection>

        <div className="lp-section-divider" />

        {/* ═══ PRICING ═══ */}
        <RevealSection id="pricing" className="relative z-10 py-28 md:py-36 bg-white/40 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-6 md:px-12">
            <SectionHeading
              badge="Pricing Plans"
              title="Simple, transparent pricing"
              titleAccent="built for conversion."
              subtitle="Choose the plan that matches your job search speed. No hidden fees."
            />

            {/* Pricing Section Content Wrapper with Blur & Coming Soon Overlay */}
            <div className="relative">
              {/* Blurred Pricing Content */}
              <div className="blur-[6px] pointer-events-none select-none">
                {/* Billing Toggle */}
                <div className="flex items-center justify-center gap-4 mb-16">
                  <span className={`text-sm font-semibold transition-colors duration-300 ${!isAnnual ? 'text-[#0C4A6E]' : 'text-[#64748B]'}`}>
                    Monthly
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
                      Annual
                    </span>
                    <span className="text-[10px] font-bold tracking-wider uppercase bg-[#EC4899]/10 text-[#EC4899] px-2 py-0.5 rounded-full border border-[#EC4899]/20">
                      Save 20%
                    </span>
                  </div>
                </div>

                {/* Pricing Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch max-w-5xl mx-auto">
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
              </div>

              {/* Centered Overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
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
          </div>
        </RevealSection>

        <div className="lp-section-divider" />

        {/* ═══ FAQ ═══ */}
        <RevealSection id="faq" className="relative z-10 py-28 md:py-36 bg-white/40 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-6 md:px-12">
            <SectionHeading badge="FAQ" title="Common questions," titleAccent=" straight answers." />
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-[#E2E8F0] p-6 md:p-8 shadow-lg shadow-[#0C4A6E]/[0.02]">
              {faqs.map((faq, i) => (
                <FAQItem key={i} question={faq.q} answer={faq.a} isOpen={openFAQ === i} onClick={() => setOpenFAQ(openFAQ === i ? null : i)} />
              ))}
            </div>
          </div>
        </RevealSection>

        {/* ═══ FOOTER ═══ */}
        <footer className="relative z-10 border-t border-[#0EA5E9]/[0.06] bg-white/70 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20 py-16">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
              <div className="md:col-span-1">
                <div className="flex items-center gap-2.5 mb-5">
                  <img src="/favicon.ico" alt="Job Mail Loop Logo" className="h-8 md:h-10 w-auto object-contain" />
                  <span className="text-lg md:text-xl font-bold tracking-tight lp-gradient-text" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Job Mail Loop</span>
                </div>
                <p className="text-sm text-[#94A3B8] leading-relaxed">Your job search, fully automated. Safe, tracked, and approved by you.</p>
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-[#94A3B8] mb-4">Product</h4>
                <ul className="space-y-3 text-sm text-[#64748B]">
                  <li><a href="#features" className="hover:text-[#0EA5E9] transition-colors cursor-pointer">Features</a></li>
                  <li><a href="#how-it-works" className="hover:text-[#0EA5E9] transition-colors cursor-pointer">How It Works</a></li>
                  <li><a href="#security" className="hover:text-[#0EA5E9] transition-colors cursor-pointer">Security</a></li>
                  <li><a href="#faq" className="hover:text-[#0EA5E9] transition-colors cursor-pointer">FAQ</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-[#94A3B8] mb-4">Resources</h4>
                <ul className="space-y-3 text-sm text-[#64748B]">
                  <li><Link href="/docs" className="hover:text-[#0EA5E9] transition-colors cursor-pointer">Documentation</Link></li>
                  <li><a href="#" className="hover:text-[#0EA5E9] transition-colors cursor-pointer">Blog</a></li>
                  <li><a href="https://github.com/Deathkiller18" target="_blank" rel="noopener noreferrer" className="hover:text-[#0EA5E9] transition-colors cursor-pointer">GitHub</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-[#94A3B8] mb-4">Legal</h4>
                <ul className="space-y-3 text-sm text-[#64748B]">
                  <li><Link href="/privacy" className="hover:text-[#0EA5E9] transition-colors cursor-pointer">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="hover:text-[#0EA5E9] transition-colors cursor-pointer">Terms of Service</Link></li>
                  <li><Link href="/cookies" className="hover:text-[#0EA5E9] transition-colors cursor-pointer">Cookie Policy</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-[#0EA5E9]/[0.06] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
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
    </ErrorBoundary>
  );
}
