<!--
SYNC IMPACT REPORT
==================
Version change: (unversioned template) → 1.0.0
Bump rationale: MAJOR — initial ratification. Establishes the full governance
                baseline for the Jisr MCP Server; no prior principles existed.

Principles defined (7, replacing 5 unnamed template slots):
  - [PRINCIPLE_1_NAME] → I. Documented Surface Only (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Least Privilege by Construction
  - [PRINCIPLE_3_NAME] → III. Classify Before You Expose
  - [PRINCIPLE_4_NAME] → IV. Tenant Isolation (NON-NEGOTIABLE)
  - [PRINCIPLE_5_NAME] → V. Truthful Tool Contracts
  - (added)            → VI. Read-First Release Order
  - (added)            → VII. Verified, Not Asserted (NON-NEGOTIABLE)

Sections defined:
  - [SECTION_2_NAME] → Security, Privacy, and Compliance Constraints
  - [SECTION_3_NAME] → Development Workflow and Quality Gates
  - Governance → amendment procedure, versioning policy, compliance review

Added sections: none beyond the resolved template structure.
Removed sections: none.

Source of derivation: JISR_FULL_MCP_IMPLEMENTATION_PLAN.md v2.0 (2026-08-29),
sections 2, 8, 9, 12, 15-19, 21-27.

Deferred / follow-up TODOs:
  - TODO(LEGAL_REVIEW): Qualified Saudi PDPL legal review is required before
    production use and is not yet obtained. Principle III and the Security,
    Privacy, and Compliance Constraints section assume it as a release gate.
  - TODO(JISR_OPEN_QUESTIONS): Plan section 28 lists unanswered questions for
    Jisr (rate limits, webhook delivery guarantees, aggregator route approval).
    Principle I forbids inventing answers; they must be verified with Jisr.
-->

# Jisr MCP Server Constitution

## Core Principles

### I. Documented Surface Only (NON-NEGOTIABLE)

Every tool, field, parameter, and error this server exposes MUST trace to a
verified operation in the official Jisr OpenAPI specification, recorded in the
endpoint manifest against a dated specification snapshot.

The server MUST NOT invent, infer, or approximate an endpoint, payload field,
webhook guarantee, permission, or rate limit. It MUST NOT scrape the Jisr web
application, call undocumented internal APIs, or circumvent an organization's
configured Jisr permissions. A feature visible in the Jisr UI is not evidence
that an Open API endpoint exists for it.

Where Jisr behavior is undocumented, the gap MUST be recorded under Open
Questions and resolved with Jisr — never filled by assumption.

**Rationale:** This server speaks for an HR system of record holding payroll and
identity data. A guessed endpoint or an assumed permission is not a bug that
surfaces in testing; it is a silent integrity or disclosure failure in
production.

### II. Least Privilege by Construction

Access MUST pass two independent gates on every call: the authenticated MCP
user's organization role and OAuth scopes, and the connected tenant's Jisr API
key permissions. Neither gate may be inferred from the other.

Tool exposure MUST be dynamic — a user is offered only the tools both gates
permit. Absence of a grant is denial; there is no implicit allow. Financial and
employee-sensitive tools MUST sit behind dedicated scopes, separate from
ordinary HR tools. Confirmation references for consequential actions MUST be
server-generated and server-bound; a confirmation string produced by a model
MUST never be accepted.

**Rationale:** The model is untrusted input, not a trusted caller. Authorization
that the model can influence, restate, or route around is not authorization.

### III. Classify Before You Expose

Every field MUST carry a data classification — public reference, internal
operational, employee personal, employee sensitive, financial confidential, or
authentication secret — assigned before it is persisted or returned.

Authentication secrets MUST never be exposed in any mode, log, error, schema,
fixture, or trace. Financial data requires its dedicated tool and scope.
Sensitive identity fields require a documented product purpose and legal basis.
Source-shaped responses MUST NOT override classification. Undocumented fields
appearing in future Jisr responses MUST NOT be exposed automatically. Responses
MUST return the narrowest data that answers the request.

**Rationale:** Under Saudi PDPL, purpose limitation and data minimization are
obligations, not preferences. Classification at the field level is the only
mechanism that makes minimization enforceable rather than aspirational.

### IV. Tenant Isolation (NON-NEGOTIABLE)

Every tenant-owned record MUST carry `organization_id`. Uniqueness MUST be
composite on that column. Every repository method MUST require explicit
organization context — there is no ambient tenant, and no query path may omit
it.

Finance and employee financial information MUST be stored separately from
ordinary employee records, with distinct key contexts, stricter repository
interfaces, separate retention configuration, and stronger audit logging.

Cross-tenant access MUST be covered by tests that assert rejection.

**Rationale:** A multi-tenant HR server leaking across organizations is an
unrecoverable trust failure. Isolation enforced at the repository boundary
cannot be bypassed by a careless call site.

### V. Truthful Tool Contracts

MCP tool annotations MUST match actual behavior. A tool marked `readOnlyHint:
true` MUST NOT trigger an upstream write, webhook creation, sync configuration
change, or any other mutation. Destructive operations MUST carry
`destructiveHint: true`.

High-impact writes MUST use a two-step prepare/commit pattern even when the
underlying Jisr API offers a single endpoint. Prepare MUST retrieve and
summarize the target, verify authorization, and issue a short-lived
server-bound reference; commit MUST re-validate both target and authorization
before acting.

All tools MUST return the stable result envelope and the stable error model.
Pagination MUST use opaque cursors.

**Rationale:** Clients and models act on annotations. An annotation that lies is
worse than no annotation, because it invites automated action under a false
guarantee of safety.

### VI. Read-First Release Order

Release 1 is the complete read-only surface and is the mandatory first
production release. Write tools (Release 2) and derived analytics (Release 3)
MUST NOT ship before it.

Write tools MUST be added individually, each with its own authorization review,
confirmation flow, audit trail, and test coverage. Destructive tools require
separate workflow approval on top of that. KPI and analytics work MUST NOT
influence the data model, tool structure, or authorization model — it is a layer
above the data, never a constraint on it.

**Rationale:** Reads are recoverable; writes to an HR system of record are not.
Shipping the read surface first also proves the authorization and classification
machinery under real traffic before anything can mutate upstream state.

### VII. Verified, Not Asserted (NON-NEGOTIABLE)

No phase, tool, or release may be declared complete while its required tests,
authorization checks, or MCP Inspector validation remain incomplete or failing.

Completion claims MUST cite evidence: passing test output, coverage-gate
results, Inspector validation. "Should work", "looks correct", and untested
refactors are not evidence. If something is blocked, the blocked item MUST be
named explicitly rather than reported as done.

**Rationale:** Every other principle here is enforced by tests. A culture that
declares completion ahead of verification disables all of them at once.

## Security, Privacy, and Compliance Constraints

**Stack and transport.** TypeScript. Remote MCP over Streamable HTTP. The MCP
endpoint MUST be authenticated. The installed MCP SDK's current official server
and transport APIs MUST be verified before use; older MCP examples MUST NOT be
relied on unverified.

**Secrets.** Per-tenant Jisr credentials (`jisr_api_key`, `jisr_api_secret`,
slug, base URL, aggregator identity) MUST live in encrypted managed storage,
never in code, `.env.example`, fixtures, tests, screenshots, MCP schemas, logs,
or documentation. Platform configuration is environment-supplied.

**Logging and observability.** Logs MUST contain no secrets, tokens, or full
sensitive records. Audit logging MUST cover every authorization decision, every
write, and every access to financial or employee-sensitive data.

**Webhooks.** SSRF and replay controls MUST pass before any webhook
administration tool is enabled.

**PDPL.** Purpose limitation, data minimization, retention, security, access
control, data-subject procedures, processor obligations, transfer assessment,
and privacy impact assessment MUST be implemented and documented as applicable.
Qualified legal review MUST be obtained before production use — this
constitution and the implementation plan are not legal advice.

## Development Workflow and Quality Gates

**Before changing the repository.** Read the repository instructions, the
implementation plan, and the existing codebase in full. Reuse what already
exists when technically sound. Preserve unrelated changes.

**Phased delivery.** Implement in the phases defined by the implementation plan
and verify each phase before starting the next.

**Required test suites.** Endpoint coverage, authentication, domain connector,
authorization, field policy, MCP contract, write and destructive behavior,
security, and load/resilience. The endpoint coverage gate MUST confirm that
every documented GET operation maps to a Release 1 read tool and that no tool
maps to an undocumented endpoint.

**Living documents.** `JISR_FULL_MCP_IMPLEMENTATION_PLAN.md` MUST be maintained
during implementation: completed checklist items marked, material decisions
added to the Decision Log, undocumented Jisr behavior recorded under Open
Questions.

**Release gate.** The plan's Definition of Done checklist MUST be fully
satisfied before a production release, including MCP Inspector validation of
Release 1.

## Governance

This constitution supersedes other practices and conventions in this repository.
Where the implementation plan and this constitution conflict, this constitution
governs, and the conflict MUST be resolved by amending one of them rather than
by exception in code.

**Amendment procedure.** Amendments MUST be proposed as a written change to this
file stating the principle affected, the rationale, and the migration impact on
existing code. They take effect only once merged. Principles marked
NON-NEGOTIABLE MUST NOT be weakened or removed without an explicit, recorded
decision by the project owner.

**Versioning policy.** Semantic versioning. MAJOR for backward-incompatible
governance changes — a principle removed, redefined, or materially narrowed.
MINOR for a new principle or section, or materially expanded guidance. PATCH for
clarifications, wording, and non-semantic refinements.

**Compliance review.** Every review MUST verify compliance with these
principles. Added complexity MUST be justified against them. A change that
cannot be reconciled with a principle is rejected or accompanied by an
amendment — never merged as a silent exception.

**Runtime guidance.** `JISR_FULL_MCP_IMPLEMENTATION_PLAN.md` is the operative
development guidance document and is subordinate to this constitution.

**Version**: 1.0.0 | **Ratified**: 2026-08-29 | **Last Amended**: 2026-08-29
