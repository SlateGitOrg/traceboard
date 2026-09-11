import { DatabaseSync } from 'node:sqlite';
import { currentVersion } from './store.ts';

/**
 * The coverage engine. Four states, not two.
 *
 *   COVERED        a passing test is linked to the CURRENT version
 *   STALE_COVERED  a passing test is linked to an EARLIER version
 *   FAILING        a test is linked and it is red
 *   UNCOVERED      no test is linked at all
 *
 * plus, in the other direction, ORPHANED tests: tests linked to nothing, which
 * are either dead or - far more often - testing something nobody wrote down.
 */

export type CoverageState =
  | 'COVERED' | 'STALE_COVERED' | 'FAILING' | 'UNCOVERED';

export interface RequirementCoverage {
  readonly ref: string;
  readonly title: string;
  readonly currentVersion: number;
  readonly state: CoverageState;
  readonly tests: ReadonlyArray<{
    id: string; coversVersion: number; status: string;
  }>;
  readonly explanation: string;
}

export function coverageFor(db: DatabaseSync, ref: string): RequirementCoverage {
  const req = db.prepare('SELECT ref, title FROM requirement WHERE ref = ?')
    .get(ref) as { ref: string; title: string };
  const version = currentVersion(db, ref);

  const tests = db.prepare(`
    SELECT cl.test_id AS id, cl.covers_version AS coversVersion,
           tc.last_status AS status
      FROM coverage_link cl
      JOIN test_case tc ON tc.id = cl.test_id
     WHERE cl.ref = ?
     ORDER BY cl.test_id
  `).all(ref) as Array<{ id: string; coversVersion: number; status: string }>;

  if (tests.length === 0) {
    return {
      ref, title: req.title, currentVersion: version, state: 'UNCOVERED', tests,
      explanation: 'no test is linked to this requirement',
    };
  }

  const passing = tests.filter((t) => t.status === 'pass');
  if (passing.length === 0) {
    return {
      ref, title: req.title, currentVersion: version, state: 'FAILING', tests,
      explanation: `${tests.length} linked test(s), none passing`,
    };
  }

  const current = passing.filter((t) => t.coversVersion === version);
  if (current.length === 0) {
    const best = Math.max(...passing.map((t) => t.coversVersion));
    return {
      ref, title: req.title, currentVersion: version, state: 'STALE_COVERED',
      tests,
      explanation:
        `the requirement is at v${version} but the passing test was written ` +
        `against v${best} - it is green, and it is testing the old wording`,
    };
  }

  return {
    ref, title: req.title, currentVersion: version, state: 'COVERED', tests,
    explanation: `${current.length} passing test(s) against v${version}`,
  };
}

export function coverageReport(db: DatabaseSync): RequirementCoverage[] {
  const refs = db.prepare('SELECT ref FROM requirement ORDER BY ref').all() as
    Array<{ ref: string }>;
  return refs.map((r) => coverageFor(db, r.ref));
}

/** Tests linked to no requirement. The other direction nobody checks. */
export function orphanedTests(db: DatabaseSync): Array<{
  id: string; name: string; suite: string;
}> {
  return db.prepare(`
    SELECT tc.id, tc.name, tc.suite
      FROM test_case tc
     WHERE NOT EXISTS (SELECT 1 FROM coverage_link cl WHERE cl.test_id = tc.id)
     ORDER BY tc.id
  `).all() as Array<{ id: string; name: string; suite: string }>;
}

export interface Summary {
  readonly covered: number;
  readonly staleCovered: number;
  readonly failing: number;
  readonly uncovered: number;
  readonly orphanedTests: number;
  /** What a spreadsheet would report: anything with a green test. */
  readonly naiveCoveragePct: number;
  /** What is actually true. */
  readonly trueCoveragePct: number;
}

export function summarise(db: DatabaseSync): Summary {
  const report = coverageReport(db);
  const count = (s: CoverageState) => report.filter((r) => r.state === s).length;
  const covered = count('COVERED');
  const stale = count('STALE_COVERED');
  const total = report.length || 1;

  return {
    covered,
    staleCovered: stale,
    failing: count('FAILING'),
    uncovered: count('UNCOVERED'),
    orphanedTests: orphanedTests(db).length,
    naiveCoveragePct: Math.round(((covered + stale) / total) * 100),
    trueCoveragePct: Math.round((covered / total) * 100),
  };
}

/** If this requirement changes, what else is affected? */
export function impactOf(db: DatabaseSync, ref: string): {
  tests: string[]; defects: string[]; changeRequests: string[];
} {
  const tests = (db.prepare(
    'SELECT test_id FROM coverage_link WHERE ref = ? ORDER BY test_id')
    .all(ref) as Array<{ test_id: string }>).map((r) => r.test_id);
  const defects = (db.prepare(
    'SELECT id FROM defect WHERE ref = ? ORDER BY id').all(ref) as
    Array<{ id: string }>).map((r) => r.id);
  const changeRequests = (db.prepare(
    `SELECT DISTINCT change_ref FROM requirement_version
      WHERE ref = ? AND change_ref IS NOT NULL ORDER BY change_ref`)
    .all(ref) as Array<{ change_ref: string }>).map((r) => r.change_ref);
  return { tests, defects, changeRequests };
}

/** The bundle an auditor actually asks for. */
export function auditPack(db: DatabaseSync, ref: string): string {
  const cov = coverageFor(db, ref);
  const versions = db.prepare(
    `SELECT version, body, change_ref, created_at
       FROM requirement_version WHERE ref = ? ORDER BY version`)
    .all(ref) as Array<{
      version: number; body: string; change_ref: string | null;
      created_at: number;
    }>;
  const impact = impactOf(db, ref);

  const lines = [
    `# Audit pack: ${ref} - ${cov.title}`,
    '',
    `Coverage state: **${cov.state}**`,
    cov.explanation,
    '',
    '## Amendment history',
    '',
  ];
  for (const v of versions) {
    lines.push(`- v${v.version} (${new Date(v.created_at).toISOString()})` +
               `${v.change_ref ? ` under ${v.change_ref}` : ' - original'}`);
    lines.push(`  > ${v.body}`);
  }
  lines.push('', '## Evidence', '');
  if (cov.tests.length === 0) {
    lines.push('- NO TEST IS LINKED TO THIS REQUIREMENT');
  }
  for (const t of cov.tests) {
    const flag = t.coversVersion === cov.currentVersion ? '' : ' **STALE**';
    lines.push(`- ${t.id} (${t.status}) written against v${t.coversVersion}${flag}`);
  }
  lines.push('', '## Related', '',
             `- defects: ${impact.defects.join(', ') || 'none'}`,
             `- change requests: ${impact.changeRequests.join(', ') || 'none'}`);
  return lines.join('\n');
}
