import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import CookieBanner from "../components/CookieBanner";
import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react';

export const metadata: Metadata = {
  title: "Job Mail Loop",
  description: "Scalable, auto email outreach agent.",
  verification: {
    google: "gaNFuNN0437GzohnbzLd_eLf88fYEUGRnHKN2GnXh2s",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get('theme')?.value || 'dark';
  const htmlClass = theme === 'light' ? '' : 'dark';

  return (
    <html lang="en" className={htmlClass} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <div className="live-bg-pattern"></div>
        {children}
        <CookieBanner />
        <Toaster 
          position="bottom-right" 
          toastOptions={{
            duration: 4000,
            style: {
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface)',
              border: '1px solid var(--outline-variant)',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 600,
            },
          }}
        />
        <Analytics />
      </body>
    </html>
  );
}
