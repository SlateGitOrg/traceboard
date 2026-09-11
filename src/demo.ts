/**
 * The 60-second artefact: two coverage numbers, and the audit pack.
 * Run: `npm run demo`
 */
import { coverageReport, orphanedTests, summarise, auditPack } from './coverage.ts';
import { buildFixture } from './fixtures.ts';

const db = buildFixture();
const report = coverageReport(db);
const s = summarise(db);

console.log('\n  TRACEBOARD - the coverage number that is quietly wrong');
console.log('  ' + '='.repeat(72));
console.log(`  ${report.length} requirements, ` +
            `${report.reduce((n, r) => n + r.tests.length, 0)} coverage links.\n`);

console.log(`  What a traceability spreadsheet reports:  ${s.naiveCoveragePct}% covered`);
console.log(`  What is actually true:                    ${s.trueCoveragePct}% covered`);
console.log(`  The gap is ${s.staleCovered} requirement(s) whose tests are green and`);
console.log('  testing the previous wording.\n');

console.log('  requirement  ver  state          evidence');
console.log('  ' + '-'.repeat(72));
for (const r of report) {
  const marker = r.state === 'COVERED' ? '  ' : '!!';
  const tests = r.tests.length
    ? r.tests.map((t) => `${t.id}@v${t.coversVersion}(${t.status})`).join(' ')
    : '-';
  console.log(`  ${marker}${r.ref.padEnd(11)} v${r.currentVersion}   ` +
              `${r.state.padEnd(15)}${tests}`);
}

console.log('\n  Requirements with no test at all:');
for (const r of report.filter((x) => x.state === 'UNCOVERED')) {
  console.log(`    ${r.ref}  ${r.title}`);
}

console.log('\n  Tests linked to no requirement (the other direction):');
for (const t of orphanedTests(db)) {
  console.log(`    ${t.id}  ${t.name}  [${t.suite}]`);
}
console.log('    Either dead, or testing something nobody wrote down.');

console.log('\n  ' + '='.repeat(72));
console.log('  The auditor asks: "show me the evidence for REQ-102."\n');
console.log(auditPack(db, 'REQ-102').split('\n').map((l) => '    ' + l).join('\n'));
console.log('\n  Assembled in under a second, from the database, reproducibly.\n');
db.close();
