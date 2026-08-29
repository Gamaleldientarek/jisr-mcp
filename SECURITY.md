# Security Policy

## Reporting a vulnerability

_Disclosure contact and response expectation are added at T111._

Please do not open a public issue for a security problem.

## Scope

This server holds credentials for an HR system of record containing personal and payroll data.
Reports are especially welcome for:

- Any path by which a caller reaches data outside their authorized set, including through
  collection results, counts, or pagination metadata
- Any appearance of a Jisr API key, secret, or access token in output, logs, traces, or errors
- Any way to reach a Jisr operation not present in the endpoint manifest
- Cursor forgery, replay, or reuse across organizations or operations

## Design commitments

- Two independent authorization gates: the caller's role profile and the Jisr key's permissions
- Every field classified before it is returned or logged
- No write, create, update, or delete capability exists in this release
- Audit records to stderr, never to disk

See [`.specify/memory/constitution.md`](.specify/memory/constitution.md) for the governing principles.
