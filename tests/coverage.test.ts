import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  coverageFor, coverageReport, orphanedTests, summarise, impactOf, auditPack,
} from '../src/coverage.ts';
import { buildFixture, PLANTED } from '../src/fixtures.ts';
import { amendRequirement, link, setTestStatus, currentVersion } from '../src/store.ts';

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;

describe('detection against planted ground truth', () => {
  test('every planted UNCOVERED requirement is found', () => {
    const db = buildFixture();
    const uncovered = coverageReport(db)
      .filter((r) => r.state === 'UNCOVERED').map((r) => r.ref).sort();
    assert.deepEqual(uncovered, [...PLANTED.uncovered].sort());
    db.close();
  });

  test('THE DIFFERENTIATOR: every planted STALE_COVERED requirement is found', () => {
    const db = buildFixture();
    const stale = coverageReport(db)
      .filter((r) => r.state === 'STALE_COVERED').map((r) => r.ref).sort();
    assert.deepEqual(stale, [...PLANTED.staleCovered].sort());
    db.close();
  });

  test('every planted orphaned TEST is found - the other direction', () => {
    const db = buildFixture();
    assert.deepEqual(
      orphanedTests(db).map((t) => t.id).sort(),
      [...PLANTED.orphanedTests].sort());
    db.close();
  });

  test('a failing test is not reported as coverage', () => {
    const db = buildFixture();
    const failing = coverageReport(db)
      .filter((r) => r.state === 'FAILING').map((r) => r.ref);
    assert.deepEqual(failing, PLANTED.failing);
    db.close();
  });

  test('genuinely covered requirements are reported as covered', () => {
    // Without this, a checker that marks everything stale also passes.
    const db = buildFixture();
    const covered = coverageReport(db)
      .filter((r) => r.state === 'COVERED').map((r) => r.ref).sort();
    assert.deepEqual(covered, ['REQ-101', 'REQ-120']);
    db.close();
  });
});

describe('the number a spreadsheet would report', () => {
  test('naive coverage overstates the true figure', () => {
    const db = buildFixture();
    const s = summarise(db);
    assert.ok(s.naiveCoveragePct > s.trueCoveragePct,
      'stale coverage is exactly the gap between these two numbers');
    assert.equal(s.staleCovered, PLANTED.staleCovered.length);
    db.close();
  });

  test('the summary accounts for every requirement exactly once', () => {
    const db = buildFixture();
    const s = summarise(db);
    assert.equal(
      s.covered + s.staleCovered + s.failing + s.uncovered,
      coverageReport(db).length);
    db.close();
  });
});

describe('amendment behaviour', () => {
  test('amending a requirement flips its coverage to STALE_COVERED', () => {
    const db = buildFixture();
    assert.equal(coverageFor(db, 'REQ-101').state, 'COVERED');
    amendRequirement(db, 'REQ-101', 'Now requires three sources.',
      'CR-2026-050', T0 + 100 * DAY);
    assert.equal(coverageFor(db, 'REQ-101').state, 'STALE_COVERED',
      'the green test is now testing the previous wording');
    db.close();
  });

  test('re-linking the test against the new version restores COVERED', () => {
    const db = buildFixture();
    amendRequirement(db, 'REQ-101', 'Now requires three sources.',
      'CR-2026-050', T0 + 100 * DAY);
    link(db, 'T-001', 'REQ-101', T0 + 101 * DAY);
    assert.equal(coverageFor(db, 'REQ-101').state, 'COVERED');
    db.close();
  });

  test('the explanation names both versions', () => {
    const db = buildFixture();
    const cov = coverageFor(db, 'REQ-102');
    assert.match(cov.explanation, /v2/);
    assert.match(cov.explanation, /v1/);
    assert.match(cov.explanation, /old wording/);
    db.close();
  });

  test('requirement versions are IMMUTABLE, enforced by the database', () => {
    // This is what makes stale coverage representable at all. If a version
    // can be edited in place, there is no earlier version to compare against.
    const db = buildFixture();
    assert.throws(
      () => db.exec("UPDATE requirement_version SET body = 'edited'"),
      /immutable/);
    db.close();
  });

  test('amending increments the version rather than replacing it', () => {
    const db = buildFixture();
    assert.equal(currentVersion(db, 'REQ-102'), 2);
    const rows = db.prepare(
      'SELECT COUNT(*) n FROM requirement_version WHERE ref = ?')
      .get('REQ-102') as { n: number };
    assert.equal(rows.n, 2, 'the original version must still exist');
    db.close();
  });
});

describe('impact analysis', () => {
  test('names the tests, defects and change requests affected', () => {
    const db = buildFixture();
    const impact = impactOf(db, 'REQ-140');
    assert.deepEqual(impact.tests, ['T-030']);
    assert.deepEqual(impact.defects, ['BUG-441']);
    db.close();
  });

  test('a requirement with amendments lists its change requests', () => {
    const db = buildFixture();
    assert.deepEqual(impactOf(db, 'REQ-102').changeRequests, ['CR-2026-014']);
    db.close();
  });

  test('an unlinked requirement has an empty impact set', () => {
    const db = buildFixture();
    const impact = impactOf(db, 'REQ-114');
    assert.deepEqual(impact.tests, []);
    db.close();
  });
});

describe('the audit pack', () => {
  test('assembles the amendment history and the evidence', () => {
    const db = buildFixture();
    const pack = auditPack(db, 'REQ-102');
    assert.match(pack, /REQ-102/);
    assert.match(pack, /v1 \(/);
    assert.match(pack, /v2 \(/);
    assert.match(pack, /CR-2026-014/);
    assert.match(pack, /T-002/);
    assert.match(pack, /\*\*STALE\*\*/);
    db.close();
  });

  test('says plainly when there is no evidence at all', () => {
    const db = buildFixture();
    assert.match(auditPack(db, 'REQ-114'), /NO TEST IS LINKED/);
    db.close();
  });

  test('a healthy requirement produces a clean pack', () => {
    const db = buildFixture();
    const pack = auditPack(db, 'REQ-120');
    assert.match(pack, /COVERED/);
    assert.ok(!/\*\*STALE\*\*/.test(pack));
    db.close();
  });
});

describe('regression behaviour', () => {
  test('a test turning red flips COVERED to FAILING', () => {
    const db = buildFixture();
    assert.equal(coverageFor(db, 'REQ-101').state, 'COVERED');
    setTestStatus(db, 'T-001', 'fail');
    assert.equal(coverageFor(db, 'REQ-101').state, 'FAILING');
    db.close();
  });

  test('one passing test is enough when several are linked', () => {
    const db = buildFixture();
    setTestStatus(db, 'T-010', 'fail');
    assert.equal(coverageFor(db, 'REQ-120').state, 'COVERED',
      'T-011 still passes against the current version');
    db.close();
  });
});
