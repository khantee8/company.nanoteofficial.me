import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { NavBar } from '@/components/NavBar';
import { AdminLogin } from '@/components/AdminLogin';
import { PlanList } from '@/components/plan/PlanList';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Plans', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PlanPage() {
  const authed = verifySession((await cookies()).get(ADMIN_COOKIE)?.value);
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <NavBar />
      {authed ? <PlanList /> : <AdminLogin />}
    </div>
  );
}
