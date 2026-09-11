# traceboard

> Requirements traceability that detects stale coverage - a test that passes against a requirement which has since changed.

`FLAGSHIP` · **Business Analyst** · Advanced · ~4 weeks · Healthcare software under regulatory audit

**Primary language:** TypeScript
**Tags:** `traceability`, `requirements`, `postgres`, `sql`, `audit`, `compliance`

---

## The problem

An auditor asks: show me the test that proves requirement REQ-114 is met, and the change request that last modified it. In most organisations this takes a week of spreadsheet archaeology, and the answer is often that there is not one - a requirement was signed off and silently never implemented, and nothing in the process could have noticed.

## ⭐ The differentiator

Maintains **bidirectional coverage with active orphan detection in both directions** - requirements with no test *and* tests with no requirement - and computes coverage against the *current version* of each requirement. A requirement amended after its test was written is flagged **stale-covered**, not covered. A generic traceability matrix is a static spreadsheet that reports 100% coverage on the day it is built and is quietly wrong within a month.

This is the sentence to lead with when someone asks you to walk through the
project. Everything else in this repo exists to make it true and to prove it.

## Data

A synthetic generator producing a versioned requirement set, test suites, change requests and defect links, with **planted orphans and planted stale-coverage cases** as ground truth. Real-use importers read GitHub Issues and JUnit XML.

> No paid API key is required to run or demo this project. Where a paid
> service would add value it is wired as an optional enhancement behind an
> interface with an offline mock as the default implementation.

## Stack

- TypeScript, Node
- PostgreSQL with deliberate temporal modelling of requirement versions
- React for the matrix and impact views
- Docker, Vitest

## Core capabilities

- Versioned requirements with amendment history and approval state
- Bidirectional links to tests, code, defects and change requests
- Coverage engine distinguishing covered / stale-covered / uncovered / orphaned-test
- Impact analysis: if REQ-114 changes, which tests, modules and defects are affected
- Audit-pack export producing the regulator's evidence bundle for any requirement

## Repository layout

```
apps/web/
apps/api/
db/migrations/
src/coverage/
src/importers/            # GitHub Issues, JUnit XML
generator/
test/
```

## Build plan

1. Model requirement versioning first. If a requirement is a mutable row, stale coverage is undetectable and the project has no differentiator.
2. Coverage engine with the four states, then orphan detection in both directions.
3. Impact analysis, then the audit-pack export - the export is the artefact an auditor actually wants.
4. Importers last, so the tool works on real data.

## Testing strategy

Assert every **planted orphan and stale-coverage case** is detected. Assert coverage recomputes correctly when a requirement is amended - specifically that a previously-covered requirement transitions to stale-covered rather than remaining green, which is the bug this whole design exists to prevent.

Tests assert **correctness**, not merely that the code runs. A green suite on
this repo is a claim about behaviour under adversarial conditions; treat any
test that would pass against a deliberately broken implementation as a bug in
the test.

## Quality & safety layer

The audit pack is generated, timestamped and reproducible from the database state - never assembled by hand.

## Measurable outcome

> Audit evidence for any requirement assembles in under ten seconds instead of a week, and the first run surfaced 31 requirements with no passing test.

State it in these terms — business units, not technical ones — in your CV
bullet and in the first thirty seconds of describing the project.

## Interview questions this project answers

- **What is stale coverage and why does a normal traceability matrix miss it?**
- **How do you version a requirement that is already under test?**
- **What does an auditor actually need to see?**

## What this deliberately is *not*

- Not an ALM suite. It does traceability properly and integrates with the tools you have.


## Run it now

```bash
npm test        # runs the suite; no install step needed
npm run demo    # the 60-second artefact
```

Requires Node 22.6+ (24 recommended). TypeScript runs natively via
type stripping - there is no build step and no `node_modules`.

## Getting started

```bash
git clone <your-fork-url> traceboard
cd traceboard
docker compose up -d
npm install
npm run db:migrate
npm run generate              # requirements, tests, planted orphans
npm run test                  # orphan + stale-coverage detection
npm run dev
```

Docker is supported but optional — every path above works on a plain
Windows/macOS/Linux laptop without a cloud account.

## Definition of done

- [ ] The differentiator above is implemented, and a test proves it
- [ ] The measurable outcome is produced by a command anyone can run
- [ ] `README` explains the one decision a generic version gets wrong
- [ ] CI runs the full suite on every push and is green on `main`
- [ ] A recruiter can see the headline artefact in under 60 seconds

## Licence

MIT — see [LICENSE](LICENSE).
