# Contributing

## Before you start

Read [`.specify/memory/constitution.md`](.specify/memory/constitution.md). Seven principles govern
this repository and three are non-negotiable. A change that cannot be reconciled with a principle is
rejected or accompanied by an amendment — never merged as a silent exception.

## Rules that will fail your build

- **`src/core/` must never import an MCP SDK.** Tool logic stays transport-agnostic; SDK use belongs
  in `src/adapters/`. Enforced by lint and by `tests/unit/core-boundary.test.ts`.
- **No tool may reach an operation absent from the endpoint manifest.** The coverage gate fails the
  build on divergence.
- **No real credential, employee, or payroll data** in code, fixtures, tests, or documentation. The
  secret scan runs over history, not just the working tree.
- **No completion claim without evidence.** Passing tests, a green coverage gate, and MCP Inspector
  validation — not "should work".

## Development

```bash
npm ci
npm run typecheck && npm run lint && npm test
npm run verify:coverage
```

## Versioning

[Semantic versioning](https://semver.org/). For a server whose surface is a set
of tools, that means:

| Change                                                                | Bump      |
| --------------------------------------------------------------------- | --------- |
| Removing or renaming a tool, or changing what an existing input means | **MAJOR** |
| Removing a returned field, or narrowing what a tool returns           | **MAJOR** |
| Adding a tool, an optional input, or a returned field                 | **MINOR** |
| Dropping support for an MCP protocol revision                         | **MAJOR** |
| Bug fix with no contract change                                       | **PATCH** |

A published tool name is a public contract. See
[`docs/tool-naming.md`](docs/tool-naming.md) for the stability and deprecation
policy.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): summary in the imperative
fix(scope): summary in the imperative
docs(scope): ...
```

`CHANGELOG.md` is generated from these, so the summary is what an adopter reads.
Write it for them, not for the diff.

Anything touching authorization, field policy, credential handling, or the audit
trail must say so in the commit body. Those entries are lifted into the release
notes' security section.

## Releases

Releases are cut from a version tag on the default branch and published by
`.github/workflows/release.yml` — never from a maintainer's machine. The
pipeline runs the full suite, the coverage gate, and `npm run verify:release`,
which asserts that the tag, the package version, the changelog entry, and the
documented protocol and snapshot versions all agree.

## Review

Every review verifies compliance with the constitution. Added complexity must be justified against
it.
