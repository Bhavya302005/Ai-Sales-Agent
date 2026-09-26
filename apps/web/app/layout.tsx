import type { Metadata, Viewport } from "next";
import { Albert_Sans, Fragment_Mono } from "next/font/google";

import "./globals.css";
import { PwaLifecycle } from "./pwa-lifecycle";

const albertSans = Albert_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-albert-sans",
  display: "swap",
});

const fragmentMono = Fragment_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-fragment-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Evidence-first Sales Agent",
  description: "A bounded, explainable AI sales qualification workflow.",
  applicationName: "SignalPath",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SignalPath",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/signalpath-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/signalpath-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f2ee",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={`${albertSans.variable} ${fragmentMono.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <PwaLifecycle />
        {children}
      </body>
    </html>
  );
}
