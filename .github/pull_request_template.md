## What changed

<!-- One or two sentences. -->

## Why

<!-- The problem, not the patch. -->

## Constitution check

- [ ] No tool reaches a Jisr operation absent from the endpoint manifest
- [ ] Nothing under `src/core/` imports an MCP SDK
- [ ] Every new field is classified before it can be returned or logged
- [ ] No real credential, employee, or payroll data added anywhere
- [ ] Completion is claimed only where tests actually pass

## Verification

<!-- Paste the output. "Should work" is not evidence. -->

```
npm run typecheck && npm run lint && npm test && npm run verify:coverage
```
