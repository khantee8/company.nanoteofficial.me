import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

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
  for (const s of stmts) await sql.query(s);
  return NextResponse.json({ applied: true, statements: stmts.length });
}
