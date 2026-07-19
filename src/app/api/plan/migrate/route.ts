import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return NextResponse.json({ error: 'no DATABASE_URL' }, { status: 500 });
  const sql = neon(url);
  const ddl = readFileSync(join(process.cwd(), 'db', 'plan-schema.sql'), 'utf8');
  // split on ';' at statement end; strip -- comments (mirrors migrate-kb handling)
  const stmts = ddl.replace(/^\s*--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
  try {
    let appliedCount = 0;
    for (const s of stmts) {
      try {
        await sql.query(s);
        appliedCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message, applied: appliedCount }, { status: 500 });
      }
    }
    return NextResponse.json({ applied: appliedCount, statements: stmts.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, applied: 0 }, { status: 500 });
  }
}
