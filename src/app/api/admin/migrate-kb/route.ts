// src/app/api/admin/migrate-kb/route.ts — one-shot v1.13 backfill (delete in v1.13.1).
// CRON_SECRET-gated like /api/cron/*: Authorization: Bearer <CRON_SECRET>.
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';
import { getRedisClient } from '@/lib/redis';
import { migrateKb } from '@/lib/kbMigrate';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 503 });

  try {
    const { neon } = await import('@neondatabase/serverless');
    const sqlClient = neon(url);
    const sql = (text: string, params?: unknown[]) =>
      (sqlClient as unknown as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params ?? []);
    const schemaSql = readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
    const out = await migrateKb({ redis: getRedisClient(), sql, schemaSql });
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
