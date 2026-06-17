// src/app/admin/page.tsx
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { NavBar } from '@/components/NavBar';
import { AdminConsole } from '@/components/admin/AdminConsole';
import { AdminLogin } from '@/components/AdminLogin';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const authed = verifySession(token);

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <NavBar />
      {authed ? <AdminConsole /> : <AdminLogin />}
    </div>
  );
}
