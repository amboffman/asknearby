import type { Metadata } from "next";
import { Bitter, JetBrains_Mono, Public_Sans } from "next/font/google";

import "./globals.css";

// Self-hosted via next/font: zero CLS, no requests to Google at runtime.
const display = Bitter({ subsets: ["latin"], variable: "--font-bitter" });
const sans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Cedar & Main Outfitters: Store Finder",
  description:
    "Say what you need in plain language (departments, services, parking, hours) " +
    "and get matching Cedar & Main stores on a map. An AskNearby demo.",
  applicationName: "AskNearby",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-paper font-sans text-ink">{children}</body>
    </html>
  );
}
