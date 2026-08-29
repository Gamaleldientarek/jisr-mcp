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

## Versioning and commits

_Semantic versioning policy and commit convention are added at T112._

## Review

Every review verifies compliance with the constitution. Added complexity must be justified against
it.
