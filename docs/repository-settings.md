# Repository settings

Spec FR-044b. These are applied in the GitHub UI rather than in code, so they
are recorded here to be reviewable — an unrecorded setting is one nobody
notices when it changes.

**Status: repo exists, PRIVATE, at `Gamaleldientarek/jisr-mcp`.** Dependabot
alerts are on. Branch protection and the remaining security features require the
repo to be public (or GitHub Pro) and are applied automatically by
`scripts/go-public.sh` -- run that, not a manual flip, so the repository is never
public-and-unprotected.

## Default branch protection

Settings → Branches → Add branch ruleset, targeting the default branch:

- [ ] Require a pull request before merging
- [ ] Require approvals: 1
- [ ] Dismiss stale approvals when new commits are pushed
- [ ] Require review from Code Owners (see `.github/CODEOWNERS`)
- [ ] Require status checks to pass, and require branches to be up to date:
  - [ ] `verify` (typecheck, lint, format, tests, coverage gate, build)
  - [ ] `secret-scan`
- [ ] Require conversation resolution before merging
- [ ] Block force pushes
- [ ] Restrict deletions
- [ ] Do not allow bypassing the above settings

The last one matters. A protection an administrator can bypass silently is a
protection that will be bypassed silently.

## Security features

Settings → Code security:

- [ ] Private vulnerability reporting (SECURITY.md depends on this)
- [ ] Dependabot alerts and security updates
- [ ] Secret scanning, with push protection

## Actions

Settings → Actions → General:

- [ ] Workflow permissions: read repository contents by default
- [ ] Require approval for first-time contributors' workflow runs

## Secrets

Settings → Secrets and variables → Actions:

- [ ] `NPM_TOKEN` — publish-scoped, used only by `release.yml`

No Jisr credential belongs in repository secrets. This project never connects to
Jisr from CI.

## Before making the repository public

- [ ] `LICENSE` present and `package.json` license field set
- [ ] `private: true` removed from `package.json`
- [ ] Publisher of record recorded in the README
- [ ] `@OWNER` placeholders replaced in `.github/CODEOWNERS`, `SECURITY.md` and `.github/ISSUE_TEMPLATE/config.yml`
- [ ] History scanned for credentials, not just the working tree
