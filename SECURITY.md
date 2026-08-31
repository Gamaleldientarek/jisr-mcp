# Security Policy

This server holds credentials for an HR system of record containing personal and
payroll data. Please treat findings accordingly.

## Reporting a vulnerability

**Do not open a public issue.**

Use [GitHub private vulnerability reporting](https://github.com/Gamaleldientarek/jisr-mcp/security/advisories/new).
It requires no email address and keeps the report private until a fix is out.

**What to expect:**

|                        |                                                     |
| ---------------------- | --------------------------------------------------- |
| Acknowledgement        | Within 3 working days                               |
| Initial assessment     | Within 10 working days                              |
| Fix or mitigation plan | Communicated with the assessment                    |
| Credit                 | Offered in the advisory unless you prefer otherwise |

This is a small project maintained alongside other work. If you have not heard
back within the acknowledgement window, please assume the report was missed and
follow up.

**Please do not include real employee, payroll, or credential data** in a
report. A redacted reproduction is always sufficient.

## Especially welcome

Reports in these areas, in rough order of severity:

1. **Any path by which a caller reaches data outside their authorized set** —
   through collection results, record counts, pagination metadata, or error
   messages that differ between "does not exist" and "not yours".
2. **Any appearance of a Jisr API key, secret, or access token** in output,
   logs, traces, errors, or test artifacts.
3. **Any way to reach a Jisr operation absent from the endpoint manifest**, or
   any caller-supplied path, URL, or HTTP method reaching the upstream client.
4. **Cursor forgery, replay, or reuse** across organizations or operations.
5. **Anything that causes financial or sensitive-identity fields to be returned**
   to a caller who has not been granted them.

## Design commitments

These are what the code is built to guarantee. A report showing any of them
broken is a valid vulnerability.

- **Two independent authorization gates** on every call: the caller's role
  profile, and the connected Jisr key's permissions. Neither is inferred from
  the other.
- **Every field is classified** before it can be returned or logged. An
  unclassified field is withheld, not passed through.
- **Financial tools require both** the finance role and an explicit operator
  opt-in. Key permission alone is deliberately insufficient.
- **Collections are scoped to the caller's reachable records before pagination**,
  and no count discloses what lies outside that set.
- **No write capability exists** in this release. Not disabled — absent.
- **Audit records go to stderr**, carry a record count and never record
  contents, and nothing is written to disk.

## Scope

In scope: this repository and the published package.

Out of scope: Jisr's own API and infrastructure. Report those to Jisr directly.
This project is unofficial and not affiliated with Jisr.

See [`.specify/memory/constitution.md`](.specify/memory/constitution.md) for the
principles these commitments derive from.
