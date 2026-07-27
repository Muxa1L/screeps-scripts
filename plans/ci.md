# CI — Lint + Test on Push & PR

Status: **Planned**. v1 scope: a single GitHub Actions workflow that
runs `npm run lint` and `npm test` on every push and pull request.
No deploy step (deploy requires credentials).

## Goal

The repo has `npm run lint` and `npm test` but no automation. The
current `husky` pre-commit hook catches local issues, but a CI
run catches issues that pre-commit may have skipped (e.g. on a
branch that wasn't kept in sync) and provides a green check on PRs.

## A. Workflow

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [22.x]
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm test
```

## B. Versioning

The workflow pins Node 22 (current LTS as of 2026-07-28). The
project doesn't pin a version today; the `engines` field in
`package.json` is recommended:

```json
"engines": {
  "node": ">=20"
},
```

`>=20` is a wide net (Screeps itself runs Node 14+ on the runtime);
`>=22` is the LTS.

## C. Optional: status badge

Add a status badge to `README.md`:

```markdown
![CI](https://github.com/anomalyco/screeps-scripts/workflows/CI/badge.svg)
```

Path to the badge is wrong by default; update to match the repo's
GitHub org/name. For a local-only repo, omit.

## D. Optional: deploy-on-main

A second workflow on push to `main` that runs `npm run build` and
uploads `dist/main.js` as a workflow artifact (no auto-deploy to
Screeps). This catches build errors that lint and test don't.

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.x
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/main.js
```

## E. Files to add / change

| Path | Type |
|---|---|
| `.github/workflows/ci.yml` | new — lint + test |
| `.github/workflows/build.yml` | new — build on main |
| `package.json` | add `engines.node: ">=20"` |
| `README.md` | optional: badge |

## F. Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Workflow fails on lint | Lint not zero | Run `npm run lint:fix` locally first |
| Workflow fails on test | Test failure | Check the run log; the GitHub UI shows per-test output |
| Workflow is slow | `npm ci` is slow | The cache should help; check `actions/setup-node` cache config |
| Workflow runs on the wrong branch | `on.push.branches` misconfigured | Verify branch names match |

## G. Open questions (v2)

- **Coverage reports.** Add `c8` or `nyc` to `npm test` and upload
  to Codecov.
- **Sharded test runs.** For larger test suites, fan out across
  runners.
- **Scheduled nightly.** A nightly build that runs against a live
  Screeps private server to catch runtime issues.
- **Auto-deploy.** A `workflow_dispatch` workflow that takes
  credentials from GitHub Secrets and runs `npm run deploy`.
