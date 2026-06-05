// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { LangProvider } from "@/lib/i18n/LangProvider";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

const SITE_URL = "https://company.nanoteofficial.me";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "NaNote Corp — AI Company Simulator",
    template: "%s · NaNote Corp",
  },
  description: "Live isometric pixel-art office showing 6 AI agents — CEO, Finance, CyberX, Marketing & Social Media, AI R&D, Operations — working together 24/7.",
  keywords: ["AI agents", "Claude", "pixel art", "office simulator", "NaNote"],
  authors: [{ name: "NaNote" }],
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: "NaNote Corp — AI Company Simulator",
    description: "6 AI pixel agents working together in a live two-floor isometric office.",
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
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
