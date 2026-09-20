import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Evidence-first Sales Agent",
  description: "A bounded, explainable AI sales qualification workflow.",
  applicationName: "SignalPath",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/signalpath-icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07100d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
