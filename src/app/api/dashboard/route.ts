import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/redis';
import { getDashboardData, emptyDashboard } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getDashboardData(getRepo()));
  } catch {
    return NextResponse.json(emptyDashboard());
  }
}
