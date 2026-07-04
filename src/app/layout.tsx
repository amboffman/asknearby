import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AskNearby",
  description:
    "AI-powered store locator: say what you're looking for in plain language and get a map of matching locations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
