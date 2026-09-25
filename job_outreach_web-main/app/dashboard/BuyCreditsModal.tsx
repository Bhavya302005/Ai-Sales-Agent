'use client';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useDashboard } from './DashboardContext';

declare global {
  interface Window {
    Razorpay: any;
  }
}

const CREDIT_PACKS = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 100,
    price: 99,
    originalPrice: 200,
    badge: 'BETA DEAL',
    badgeColor: 'from-emerald-500 to-teal-500',
    popular: true,
    perCredit: '₹0.99',
    savings: '50% OFF',
  },
  {
    id: 'pro',
    name: 'Pro',
    credits: 500,
    price: 399,
    originalPrice: 1000,
    badge: 'BEST VALUE',
    badgeColor: 'from-violet-500 to-purple-500',
    popular: false,
    perCredit: '₹0.80',
    savings: '60% OFF',
  },
  {
    id: 'mega',
    name: 'Mega',
    credits: 1500,
    price: 899,
    originalPrice: 3000,
    badge: 'MAX SAVINGS',
    badgeColor: 'from-amber-500 to-orange-500',
    popular: false,
    perCredit: '₹0.60',
    savings: '70% OFF',
  },
];

export default function BuyCreditsModal() {
  const { showBuyCreditsModal, setShowBuyCreditsModal, credits, setCredits, user } = useDashboard();
  const [selectedPack, setSelectedPack] = useState('starter');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [addedCredits, setAddedCredits] = useState(0);

  if (!showBuyCreditsModal) return null;

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePurchase = async () => {
    setIsProcessing(true);

    try {
      // Load Razorpay script
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error('Failed to load payment gateway. Please try again.');
        setIsProcessing(false);
        return;
      }

      // Create order on backend
      const orderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: selectedPack }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        toast.error(orderData.error || 'Failed to create order');
        setIsProcessing(false);
        return;
      }

      // Open Razorpay checkout
      const options = {
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Job Mail Loop',
        description: `${orderData.credits} AI Credits`,
        order_id: orderData.order_id,
        prefill: {
          email: user?.email || '',
        },
        theme: {
          color: '#6366f1',
          backdrop_color: 'rgba(0,0,0,0.7)',
        },
        handler: async (response: any) => {
          // Verify payment on backend
          try {
            const verifyRes = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              setCredits(verifyData.new_balance);
              setAddedCredits(verifyData.credits_added);
              setShowSuccess(true);
              toast.success(`🎉 ${verifyData.credits_added} credits added!`);
            } else {
              toast.error(verifyData.error || 'Payment verification failed');
            }
          } catch (err) {
            toast.error('Payment verification error. Contact support if charged.');
          }
          setIsProcessing(false);
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
          },
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();

    } catch (err: any) {
      console.error('Payment error:', err);
      toast.error('Payment failed. Please try again.');
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setShowBuyCreditsModal(false);
    setShowSuccess(false);
    setSelectedPack('starter');
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md transition-all duration-300 animate-in fade-in"
      onClick={handleClose}
    >
      <div
        className="border border-outline-variant rounded-3xl w-full max-w-lg shadow-2xl relative transition-all duration-300 animate-in zoom-in-95 overflow-hidden"
        style={{
          backgroundColor: 'var(--surface-container)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 30px 70px -10px rgba(0, 0, 0, 0.85), 0 0 60px rgba(var(--primary-rgb), 0.12)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-primary via-secondary to-tertiary z-20 rounded-t-3xl" />

        {showSuccess ? (
          /* ═══ Success State ═══ */
          <div className="p-8 flex flex-col items-center gap-5 text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center animate-bounce-gentle">
              <span className="material-symbols-outlined text-[42px] text-emerald-500">check_circle</span>
            </div>
            <h3 className="text-xl font-bold text-on-surface">Payment Successful! 🎉</h3>
            <p className="text-sm text-on-surface-variant">
              <span className="font-bold text-emerald-500">{addedCredits} credits</span> have been added to your account.
            </p>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20">
              <span className="material-symbols-outlined text-primary text-[18px]">bolt</span>
              <span className="text-sm font-bold text-primary">New Balance: {credits} Credits</span>
            </div>
            <button
              onClick={handleClose}
              className="mt-2 px-8 py-3 bg-gradient-to-r from-primary via-primary/95 to-secondary text-on-primary rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all"
            >
              Continue Working
            </button>
          </div>
        ) : (
          /* ═══ Purchase State ═══ */
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                  <span className="material-symbols-outlined text-[24px]">bolt</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-on-surface">Buy AI Credits</h3>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">Power your outreach with credits</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Current Balance */}
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/50 mb-5">
              <span className="material-symbols-outlined text-amber-500 text-[18px]">account_balance_wallet</span>
              <span className="text-xs text-on-surface-variant">Current Balance:</span>
              <span className="text-sm font-bold text-on-surface">{credits} Credits</span>
            </div>

            {/* Credit Packs */}
            <div className="space-y-3 mb-5">
              {CREDIT_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  onClick={() => setSelectedPack(pack.id)}
                  className={`w-full p-4 rounded-2xl border-2 transition-all duration-200 text-left relative overflow-hidden group ${
                    selectedPack === pack.id
                      ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                      : 'border-outline-variant/50 bg-surface-container-low hover:border-primary/30 hover:bg-surface-container-high'
                  }`}
                >
                  {/* Badge */}
                  <div className={`absolute top-3 right-3 px-2 py-0.5 rounded-full bg-gradient-to-r ${pack.badgeColor} text-white text-[8px] font-bold tracking-wider uppercase`}>
                    {pack.badge}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Radio */}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      selectedPack === pack.id ? 'border-primary bg-primary' : 'border-outline-variant'
                    }`}>
                      {selectedPack === pack.id && (
                        <span className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-on-surface">{pack.credits} Credits</span>
                        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">{pack.savings}</span>
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-lg font-extrabold text-on-surface">₹{pack.price}</span>
                        <span className="text-xs text-on-surface-variant line-through">₹{pack.originalPrice}</span>
                        <span className="text-[10px] text-on-surface-variant ml-1">({pack.perCredit}/credit)</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/15 mb-5">
              <span className="material-symbols-outlined text-amber-500 text-[16px] mt-0.5 shrink-0">info</span>
              <p className="text-[10px] text-on-surface-variant leading-relaxed">
                Credits are valid for <span className="font-bold text-on-surface">1 year</span> from purchase date.
                Each AI generation or regeneration costs <span className="font-bold text-on-surface">1 credit</span>.
                Secure payments powered by Razorpay.
              </p>
            </div>

            {/* Purchase Button */}
            <button
              onClick={handlePurchase}
              disabled={isProcessing}
              className="w-full py-3.5 bg-gradient-to-r from-primary via-primary/95 to-secondary text-on-primary rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                  Pay ₹{CREDIT_PACKS.find(p => p.id === selectedPack)?.price} — Get {CREDIT_PACKS.find(p => p.id === selectedPack)?.credits} Credits
                </>
              )}
            </button>

            {/* Trust indicators */}
            <div className="flex items-center justify-center gap-4 mt-4 text-[9px] text-on-surface-variant">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-emerald-500 text-[12px]">shield</span>
                256-bit SSL
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-emerald-500 text-[12px]">verified</span>
                Razorpay Secure
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-emerald-500 text-[12px]">receipt_long</span>
                Instant Credits
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
