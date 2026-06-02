// src/app/dashboard/page.tsx
import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';
import { DashboardClient } from '@/components/DashboardClient';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Live, data-driven output from every NaNote Corp AI agent — CEO, Finance, CyberX, Marketing & Social Media, AI R&D, Operations.',
};

export default function DashboardPage() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <NavBar />
      <DashboardClient />
    </div>
  );
}
