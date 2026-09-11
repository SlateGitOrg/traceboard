import { DatabaseSync } from 'node:sqlite';
import {
  addRequirement, addTest, amendRequirement, createDatabase, link,
  setTestStatus,
} from './store.ts';

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;

/**
 * A clinical-software requirement set with PLANTED defects in the traceability
 * itself: orphan requirements, orphan tests, and stale coverage.
 *
 * These are the ground truth. Detecting them is the measurable claim.
 */
export const PLANTED = {
  uncovered: ['REQ-114', 'REQ-131'],
  staleCovered: ['REQ-102', 'REQ-127'],
  failing: ['REQ-140'],
  orphanedTests: ['T-900', 'T-901'],
};

export function buildFixture(): DatabaseSync {
  const db = createDatabase();

  const reqs: Array<[string, string, string]> = [
    ['REQ-101', 'Patient identity is verified at enrolment',
      'The system SHALL verify patient identity against two sources.'],
    ['REQ-102', 'Consent is captured before any procedure',
      'The system SHALL record consent prior to scheduling.'],
    ['REQ-114', 'Adverse events are reported within 24 hours',
      'The system SHALL notify the sponsor within 24 hours.'],
    ['REQ-120', 'Audit trail is immutable',
      'The system SHALL prevent modification of audit records.'],
    ['REQ-127', 'Visit windows are enforced',
      'The system SHALL reject visits outside the protocol window.'],
    ['REQ-131', 'Blinded users cannot see arm assignment',
      'The system SHALL withhold arm assignment from blinded roles.'],
    ['REQ-140', 'Data export respects consent scope',
      'The system SHALL exclude data outside the consented scope.'],
  ];
  for (const [ref, title, body] of reqs) addRequirement(db, ref, title, body, T0);

  const tests: Array<[string, string, string]> = [
    ['T-001', 'verifies identity against two sources', 'enrolment'],
    ['T-002', 'blocks scheduling without consent', 'consent'],
    ['T-010', 'audit records cannot be updated', 'audit'],
    ['T-011', 'audit records cannot be deleted', 'audit'],
    ['T-020', 'rejects a visit outside the window', 'scheduling'],
    ['T-030', 'export excludes unconsented fields', 'export'],
    ['T-900', 'legacy smoke test for the old importer', 'legacy'],
    ['T-901', 'checks the nightly batch runs', 'ops'],
  ];
  for (const [id, name, suite] of tests) addTest(db, id, name, suite);

  link(db, 'T-001', 'REQ-101', T0 + DAY);
  link(db, 'T-002', 'REQ-102', T0 + DAY);
  link(db, 'T-010', 'REQ-120', T0 + DAY);
  link(db, 'T-011', 'REQ-120', T0 + DAY);
  link(db, 'T-020', 'REQ-127', T0 + DAY);
  link(db, 'T-030', 'REQ-140', T0 + DAY);
  // REQ-114 and REQ-131 are deliberately unlinked.
  // T-900 and T-901 are deliberately orphaned.

  // Two requirements are amended AFTER their tests were written. Both tests
  // stay green. This is the state a spreadsheet reports as "covered".
  amendRequirement(
    db, 'REQ-102',
    'The system SHALL record consent prior to scheduling AND re-consent ' +
    'on any protocol amendment.',
    'CR-2026-014', T0 + 60 * DAY);
  amendRequirement(
    db, 'REQ-127',
    'The system SHALL reject visits outside the protocol window, with a ' +
    'documented deviation path for site-approved exceptions.',
    'CR-2026-022', T0 + 75 * DAY);

  setTestStatus(db, 'T-030', 'fail');

  db.prepare('INSERT INTO defect VALUES (?, ?, ?, ?)')
    .run('BUG-441', 'REQ-140', 'sev1', 'open');
  db.prepare('INSERT INTO change_request VALUES (?, ?, ?)')
    .run('CR-2026-014', 'Add re-consent on protocol amendment', T0 + 60 * DAY);
  db.prepare('INSERT INTO change_request VALUES (?, ?, ?)')
    .run('CR-2026-022', 'Allow documented visit-window deviations',
         T0 + 75 * DAY);

  return db;
}
