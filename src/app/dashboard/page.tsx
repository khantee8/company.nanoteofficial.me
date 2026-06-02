// src/app/dashboard/page.tsx
import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';
import { ExecDashboard } from '@/components/ExecDashboard';

export const metadata: Metadata = {
  title: 'Executive Dashboard',
  description: 'A live, data-driven executive view of NaNote Corp — six AI agents (CEO, Finance, CyberX, Marketing & Social Media, AI R&D, Operations) producing real daily intelligence.',
};

export default function DashboardPage() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <NavBar />
      <ExecDashboard />
    </div>
  );
}
