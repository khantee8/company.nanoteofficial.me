// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://company.nanoteofficial.me";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "NaNote Corp — AI Company Simulator",
    template: "%s · NaNote Corp",
  },
  description: "Live isometric pixel-art office showing 5 AI agents — CEO, Marketing, R&D, Operations, Finance — working together 24/7.",
  keywords: ["AI agents", "Claude", "pixel art", "office simulator", "NaNote"],
  authors: [{ name: "NaNote" }],
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: "NaNote Corp — AI Company Simulator",
    description: "5 AI pixel agents working together in a live isometric office.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#060610",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
