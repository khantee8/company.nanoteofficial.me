import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { NavBar } from '@/components/NavBar';
import { AdminLogin } from '@/components/AdminLogin';
import { PlanDetail } from '@/components/plan/PlanDetail';
import { ADMIN_COOKIE, verifySession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Plan', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const authed = verifySession((await cookies()).get(ADMIN_COOKIE)?.value);
  const { id } = await params;
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <NavBar />
      {authed ? <PlanDetail id={id} /> : <AdminLogin />}
    </div>
  );
}
