import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/redis';
import { DEPARTMENTS } from '@/lib/data/departments';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const repo = getRepo();
    const data = await Promise.all(
      DEPARTMENTS.map(async (d) => ({
        dept: d.id,
        status: await repo.getStatus(d.id),
        output: await repo.getOutput(d.id),
      })),
    );
    return NextResponse.json({ agents: data });
  } catch {
    return NextResponse.json({ agents: [] });
  }
}
