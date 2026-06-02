import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES, BRIEF_FILES } from './roles';
import { PERSONAS } from './personas';
import { DEPARTMENTS } from '@/lib/data/departments';

// These tests prove the running agents are driven by the `.agents/*.md` source
// briefs themselves — not a hand-copied duplicate that can silently drift.
describe('roles loaded from .agents briefs', () => {
  it('every department loads a non-trivial brief from disk', () => {
    for (const d of DEPARTMENTS) {
      const role = ROLES[d.id];
      expect(role, `${d.id} role`).toBeTruthy();
      expect(role.length, `${d.id} role length`).toBeGreaterThan(200);
    }
  });

  it('each ROLES entry is exactly the content of its .agents/*.md file', () => {
    for (const d of DEPARTMENTS) {
      const onDisk = readFileSync(join(process.cwd(), '.agents', BRIEF_FILES[d.id]), 'utf8').trim();
      expect(ROLES[d.id], `${d.id} must match its brief verbatim`).toBe(onDisk);
    }
  });

  it('each persona embeds its brief verbatim (the .md is what runs)', () => {
    for (const d of DEPARTMENTS) {
      expect(PERSONAS[d.id], `${d.id} persona`).toContain(ROLES[d.id]);
    }
  });
});
