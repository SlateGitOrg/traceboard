import { DatabaseSync } from 'node:sqlite';

/**
 * Requirements traceability with versioned requirements.
 *
 * A traceability matrix built as a spreadsheet reports full coverage on the
 * day it is built and drifts out of date as requirements are amended: the
 * linked test stays green but is now exercising the old wording.
 *
 * That state is called STALE-COVERED here. It is only representable because
 * a requirement is an immutable version rather than a mutable row. If a
 * requirement were a row updated in place, there would be nothing to compare
 * a test's linked version against, and stale coverage could not be detected.
 */

export function createDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
-- The stable identity of a requirement.
CREATE TABLE requirement (
  ref        TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- One immutable row per amendment. Nothing here is ever updated.
CREATE TABLE requirement_version (
  id           INTEGER PRIMARY KEY,
  ref          TEXT NOT NULL REFERENCES requirement(ref),
  version      INTEGER NOT NULL,
  body         TEXT NOT NULL,
  approved     INTEGER NOT NULL DEFAULT 0,
  change_ref   TEXT,
  created_at   INTEGER NOT NULL,
  UNIQUE (ref, version)
);
CREATE TRIGGER requirement_version_immutable
BEFORE UPDATE ON requirement_version
BEGIN
  SELECT RAISE(ABORT, 'requirement versions are immutable; add a new version');
END;

CREATE TABLE test_case (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  suite      TEXT NOT NULL,
  last_status TEXT NOT NULL DEFAULT 'unknown'   -- pass | fail | unknown
);

-- A link records WHICH VERSION the test was written against. Without this
-- column, stale coverage cannot be computed.
CREATE TABLE coverage_link (
  test_id             TEXT NOT NULL REFERENCES test_case(id),
  ref                 TEXT NOT NULL REFERENCES requirement(ref),
  covers_version      INTEGER NOT NULL,
  linked_at           INTEGER NOT NULL,
  PRIMARY KEY (test_id, ref)
);

CREATE TABLE defect (
  id       TEXT PRIMARY KEY,
  ref      TEXT REFERENCES requirement(ref),
  severity TEXT NOT NULL,
  status   TEXT NOT NULL
);

CREATE TABLE change_request (
  id      TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  raised_at INTEGER NOT NULL
);
`);
  return db;
}

export function addRequirement(
  db: DatabaseSync, ref: string, title: string, body: string, at: number,
): void {
  db.prepare('INSERT INTO requirement (ref, title, created_at) VALUES (?, ?, ?)')
    .run(ref, title, at);
  db.prepare(
    `INSERT INTO requirement_version (ref, version, body, approved, created_at)
     VALUES (?, 1, ?, 1, ?)`,
  ).run(ref, body, at);
}

/** Amend a requirement. Always a NEW version; never an update. */
export function amendRequirement(
  db: DatabaseSync, ref: string, body: string, changeRef: string, at: number,
): number {
  const row = db.prepare(
    'SELECT MAX(version) v FROM requirement_version WHERE ref = ?').get(ref) as
    { v: number };
  const next = (row.v ?? 0) + 1;
  db.prepare(
    `INSERT INTO requirement_version
       (ref, version, body, approved, change_ref, created_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ).run(ref, next, body, changeRef, at);
  return next;
}

export function currentVersion(db: DatabaseSync, ref: string): number {
  const row = db.prepare(
    'SELECT MAX(version) v FROM requirement_version WHERE ref = ?').get(ref) as
    { v: number | null };
  return row.v ?? 0;
}

export function addTest(
  db: DatabaseSync, id: string, name: string, suite: string,
  status: 'pass' | 'fail' | 'unknown' = 'pass',
): void {
  db.prepare(
    'INSERT INTO test_case (id, name, suite, last_status) VALUES (?, ?, ?, ?)')
    .run(id, name, suite, status);
}

export function link(
  db: DatabaseSync, testId: string, ref: string, at: number,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO coverage_link
       (test_id, ref, covers_version, linked_at)
     VALUES (?, ?, ?, ?)`,
  ).run(testId, ref, currentVersion(db, ref), at);
}

export function setTestStatus(
  db: DatabaseSync, testId: string, status: 'pass' | 'fail' | 'unknown',
): void {
  db.prepare('UPDATE test_case SET last_status = ? WHERE id = ?')
    .run(status, testId);
}
