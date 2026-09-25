'use client';

import { useState, useEffect } from 'react';
import { X, Cookie } from 'lucide-react';

export default function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('cookie-consent', 'all');
    setShowBanner(false);
  };

  const handleDecline = () => {
    localStorage.setItem('cookie-consent', 'necessary-only');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 md:p-6 pointer-events-none flex justify-center">
      <div className="pointer-events-auto w-full max-w-4xl bg-surface-container border border-outline-variant/60 rounded-2xl shadow-xl p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transform transition-all animate-in slide-in-from-bottom-10 fade-in duration-500">
        
        <div className="flex gap-4 items-start">
          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Cookie className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-bold text-on-surface mb-1">We value your privacy</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed max-w-2xl">
              We use strictly necessary cookies to make our site work. We'd also like to set optional cookies to help us improve it. 
              By clicking "Accept All", you agree to the storing of cookies on your device to enhance site navigation and analyze site usage.
              Read our <a href="/cookies" className="text-primary hover:underline font-medium">Cookie Policy</a> for more details.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto self-end md:self-center shrink-0">
          <button 
            onClick={handleDecline}
            className="flex-1 md:flex-none px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface hover:bg-surface-container-highest border border-transparent hover:border-outline-variant transition-all"
          >
            Decline
          </button>
          <button 
            onClick={handleAcceptAll}
            className="flex-1 md:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold text-on-primary bg-primary hover:bg-primary/90 shadow-sm transition-all whitespace-nowrap"
          >
            Accept All
          </button>
          <button 
            onClick={() => setShowBanner(false)}
            className="p-2.5 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all hidden md:block"
            aria-label="Close banner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

      </div>
    </div>
  );
}
