import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NaNote Corp — AI Company Simulator",
  description: "5 AI agents working together in an isometric pixel office. Marketing, R&D, Operations, Finance — coordinated by NaNote CEO.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
