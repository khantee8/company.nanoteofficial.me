import { neon } from '@neondatabase/serverless';

export interface PlanRow { id: string; title: string; brief: string; audience: string; createdAt: string; updatedAt: string }
export interface DeckVersionRow { id: string; planId: string; versionNo: number; deck: unknown; meta: unknown; createdAt: string }

export interface PlanStore {
  listPlans(): Promise<PlanRow[]>;
  getPlan(id: string): Promise<PlanRow | null>;
  createPlan(input: { title: string; brief: string; audience: string }): Promise<PlanRow>;
  listVersions(planId: string): Promise<DeckVersionRow[]>;
  getVersion(planId: string, versionNo: number): Promise<DeckVersionRow | null>;
  addVersion(planId: string, deck: unknown, meta: unknown): Promise<DeckVersionRow>;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const planRow = (r: Record<string, unknown>): PlanRow => ({
  id: r.id as string, title: r.title as string, brief: r.brief as string,
  audience: r.audience as string, createdAt: String(r.created_at), updatedAt: String(r.updated_at),
});
const verRow = (r: Record<string, unknown>): DeckVersionRow => ({
  id: r.id as string, planId: r.plan_id as string, versionNo: Number(r.version_no),
  deck: r.deck_json, meta: r.meta_json, createdAt: String(r.created_at),
});

export function makePlanDbStore(): PlanStore {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const sql = url ? neon(url) : null;
  const warn = (e: unknown) => console.warn('[planDb] read failed', e);

  return {
    async listPlans() {
      if (!sql) return [];
      try { return (await sql`SELECT * FROM plan ORDER BY created_at DESC`).map(planRow); }
      catch (e) { warn(e); return []; }
    },
    async getPlan(id) {
      if (!sql) return null;
      try { const r = await sql`SELECT * FROM plan WHERE id=${id}`; return r[0] ? planRow(r[0]) : null; }
      catch (e) { warn(e); return null; }
    },
    async createPlan(input) {
      if (!sql) throw new Error('DATABASE_URL not set');
      const id = newId('plan');
      const r = await sql`INSERT INTO plan (id,title,brief,audience) VALUES (${id},${input.title},${input.brief},${input.audience}) RETURNING *`;
      return planRow(r[0]);
    },
    async listVersions(planId) {
      if (!sql) return [];
      try { return (await sql`SELECT * FROM deck_version WHERE plan_id=${planId} ORDER BY version_no DESC`).map(verRow); }
      catch (e) { warn(e); return []; }
    },
    async getVersion(planId, versionNo) {
      if (!sql) return null;
      try { const r = await sql`SELECT * FROM deck_version WHERE plan_id=${planId} AND version_no=${versionNo}`; return r[0] ? verRow(r[0]) : null; }
      catch (e) { warn(e); return null; }
    },
    async addVersion(planId, deck, meta) {
      if (!sql) throw new Error('DATABASE_URL not set');
      const id = newId('deck');
      const r = await sql`
        INSERT INTO deck_version (id, plan_id, version_no, deck_json, meta_json)
        VALUES (${id}, ${planId},
          (SELECT COALESCE(MAX(version_no),0)+1 FROM deck_version WHERE plan_id=${planId}),
          ${JSON.stringify(deck)}::jsonb, ${JSON.stringify(meta)}::jsonb)
        RETURNING *`;
      await sql`UPDATE plan SET updated_at=now() WHERE id=${planId}`;
      return verRow(r[0]);
    },
  };
}

export function makeMemoryPlanStore(): PlanStore {
  const plans: PlanRow[] = [];
  const versions: DeckVersionRow[] = [];
  return {
    async listPlans() { return [...plans].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    async getPlan(id) { return plans.find((p) => p.id === id) ?? null; },
    async createPlan(input) {
      const now = new Date(Date.now() + plans.length).toISOString();
      const p: PlanRow = { id: newId('plan'), ...input, createdAt: now, updatedAt: now };
      plans.push(p); return p;
    },
    async listVersions(planId) {
      return versions.filter((v) => v.planId === planId).sort((a, b) => b.versionNo - a.versionNo);
    },
    async getVersion(planId, versionNo) {
      return versions.find((v) => v.planId === planId && v.versionNo === versionNo) ?? null;
    },
    async addVersion(planId, deck, meta) {
      const versionNo = versions.filter((v) => v.planId === planId).length + 1;
      const v: DeckVersionRow = { id: newId('deck'), planId, versionNo, deck, meta, createdAt: new Date().toISOString() };
      versions.push(v); return v;
    },
  };
}
