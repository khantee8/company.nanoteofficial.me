import type { Metadata } from 'next';
import './doc.css';
import { NavBar } from '@/components/NavBar';
import { DocSidebar } from '@/components/doc/DocSidebar';

export const metadata: Metadata = {
  title: 'User Guide',
  description: 'How to operate and read the NaNote Corp AI company — agents, dashboard, knowledge base, and Telegram bot.',
};

export default function DocLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <div className="doc-shell">
        <DocSidebar />
        <main className="doc-main">{children}</main>
      </div>
    </>
  );
}
