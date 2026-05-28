import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const events = await getRepo().getFeed(30);
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ events: [] });
  }
}
