import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Evidence-first Sales Agent",
  description: "A bounded, explainable AI sales qualification workflow.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

