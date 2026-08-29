# Feature Specification: Jisr MCP Server — Complete Authorized Read Surface

**Feature Branch**: `001-jisr-mcp-server`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "Build a full, production-grade Jisr MCP server that exposes the complete documented Jisr HR Open API surface, and that is easy to adopt from any MCP client — Claude Code, Claude Desktop, ChatGPT/Codex, Cursor, custom agents, and CLI tooling. It will be open-sourced on GitHub, so it must follow current MCP best practices for a public server: dual transport (local stdio for single-tenant self-hosting via npx, remote Streamable HTTP with OAuth 2.1 for multi-tenant hosted use), sharing one core implementation. Use JISR_FULL_MCP_IMPLEMENTATION_PLAN.md as the initial baseline — Release 1 is the complete read-only surface across employees, employee basic and financial info, attendance, attendance logs, leave, accruals, monthly payables, payroll transactions, GL transaction types, paygroups, accounting journals, all six lookups, webhooks listing, audit events, plus connection/capability/catalog/sync status. No arbitrary HTTP or generic request tool; typed tool-specific wrappers only; dynamic tool exposure by scope, role and Jisr key capability; opaque tenant-bound cursors; stable result envelope and error model; accurate MCP safety annotations. Must be governed by the project constitution."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect my own Jisr in minutes (Priority: P1)

An HR-operations lead or developer at an organization that uses Jisr wants their AI assistant to answer questions about their own HR data. They find the project on GitHub, follow the README, provide their organization's Jisr API credentials, paste one configuration block into their MCP client, and restart it. Their assistant can immediately answer authorized questions about their people — "how many active employees do we have", "show me last month's attendance summary for the Riyadh office" — without the person writing any code or learning the Jisr API.

**Why this priority**: This is the adoption path. Without it, nothing else in the project reaches a user. It is also the smallest complete slice that delivers real value: one organization, one credential set, live read access. Everything later in this specification widens the surface or hardens the deployment, but this story alone is a working product.

**Independent Test**: Take a clean machine with no project knowledge, follow only the published README, connect to a Jisr test organization, and successfully retrieve employee and attendance data through an MCP client. Measured end to end with a stopwatch.

**Acceptance Scenarios**:

1. **Given** a machine with the supported runtime and a valid Jisr API key, slug, and secret, **When** the adopter follows the README quick-start and restarts their MCP client, **Then** the server appears as connected and its authorized tools are listed.
2. **Given** a connected server, **When** the adopter asks their assistant a question answerable from a documented Jisr read operation, **Then** the assistant returns data sourced from Jisr with an explicit freshness indication and no credential values anywhere in the exchange.
3. **Given** an incorrect or incomplete credential set, **When** the server starts, **Then** it fails with a message naming the specific missing or rejected setting and the action to take, and never prints a stack trace or the credential value.
4. **Given** a Jisr API key whose permissions exclude a domain, **When** the adopter's client lists tools, **Then** tools for that domain are absent, and asking about that domain produces an explanation that the connected key lacks the permission, naming who can change it.

---

### User Story 2 - Ask anything the organization's Jisr permissions allow (Priority: P2)

An HR operations user needs to answer questions that span several Jisr domains in a single conversation — headcount by department, this month's attendance exceptions, who has annual leave remaining, which paygroups exist — without knowing which Jisr endpoint each answer comes from, and without being silently given a partial answer.

**Why this priority**: This is the substance of the product: complete authorized coverage rather than a convenient subset. It depends on Story 1 being in place, but is independently testable and independently valuable — an organization with only Story 1 has a demo; with Story 2 it has a tool that replaces manual Jisr lookups.

**Independent Test**: With a connected organization, exercise every documented Jisr read operation through its corresponding tool and verify against an automated coverage gate that no documented read operation is unreachable and no undocumented operation is reachable.

**Acceptance Scenarios**:

1. **Given** a connected organization whose key permits all documented read domains, **When** the client lists tools, **Then** every documented Jisr read operation is reachable through exactly one purpose-built tool, and no generic request, arbitrary-path, or arbitrary-URL tool exists.
2. **Given** a collection larger than one page, **When** the assistant requests the next page, **Then** it continues using an opaque cursor supplied by the server, never by constructing an upstream address, and the sequence terminates without an unbounded response.
3. **Given** a request whose answer is empty, partial, stale, or unavailable, **When** the result is returned, **Then** each of those four states is distinguishable from the others and from a successful full answer.
4. **Given** an organization with employees whose names are recorded in Arabic, **When** records are returned, **Then** names render correctly and are usable for follow-up lookups without corruption or transliteration loss.

---

### User Story 3 - Financial and sensitive data stays behind its own door (Priority: P3)

A payroll specialist needs salary, monthly payables, and payroll transaction data through the same assistant. An HR generalist in the same organization must not be able to reach any of it — not by asking differently, not by guessing an identifier, and not by discovering that the capability exists.

**Why this priority**: Financial and sensitive-identity exposure is the highest-consequence failure this product can have, and it is a constitutional non-negotiable. It is separated from Story 2 because it is independently testable as a matrix of role against tool, and because an organization may deliberately deploy without ever enabling the finance surface.

**Independent Test**: Run the full role-by-tool authorization matrix — every defined role against every tool — and verify that each cell resolves to the expected allow or deny, including that denied capabilities are undiscoverable rather than merely refused.

**Acceptance Scenarios**:

1. **Given** an identity without finance authorization, **When** it lists tools, **Then** no financial tool appears, and a direct call to one is refused without revealing whether the underlying data exists.
2. **Given** an identity with finance authorization, **When** it retrieves employee financial information, **Then** only fields on the approved schema allowlist are returned, an audit event is recorded, and no financial value appears in any log or trace.
3. **Given** any identity, **When** any tool returns a result, **Then** no Jisr API key, secret, access token, or webhook authentication secret appears in the result, the summary, an error, or a log line.
4. **Given** an employee-self identity, **When** it requests another employee's record by identifier, **Then** the request is refused, and repeated attempts across identifiers cannot be used to enumerate who exists.

---

### User Story 4 - Prove what happened and notice when Jisr changes (Priority: P4)

An auditor needs to review who accessed what. An operator needs to know when Jisr's API has changed underneath the server before that change reaches users as a wrong or unsafe answer.

**Why this priority**: These are the properties that keep the system trustworthy over time rather than on launch day. They are last because they are only meaningful once there is a surface to audit and a schema to drift from, but they must exist before any public release.

**Independent Test**: Replay a session of tool calls and verify a complete audit trail exists with no sensitive payloads; separately, inject an unknown field into a simulated upstream response and verify it is detected, recorded, and withheld rather than passed through.

**Acceptance Scenarios**:

1. **Given** any tool call, **When** it completes or is refused, **Then** an audit event records the identity, organization, tool, authorization decision, and outcome, without recording sensitive record contents.
2. **Given** an upstream response containing a field not in the approved schema, **When** it is processed, **Then** the field is not exposed to the client, a drift record is created, and the result is marked partial if safe handling cannot be guaranteed.
3. **Given** an operator reviewing the deployment, **When** they inspect capabilities, **Then** they can see for each domain whether it is supported by the specification, permitted by the Jisr key, allowed by the caller's authorization, and enabled by configuration — as four separate facts.

---

### Edge Cases

- **Jisr is unreachable or returns a server error.** The caller receives a distinct, retryable "temporarily unavailable" outcome rather than an empty result that reads as "no data".
- **The access token expires mid-pagination.** The server re-authenticates at most once, resumes, and never enters a refresh loop; the cursor sequence remains valid or fails cleanly.
- **Jisr rate-limits the organization.** The caller receives a distinct rate-limited outcome with a retry indication; the server does not retry aggressively enough to worsen it.
- **A bulk request exceeds a documented upstream limit** (for example, more employee codes than the leave summary endpoint accepts). The server splits within its own enforced total limits or refuses with a named limit — it never silently truncates.
- **A cursor is replayed after expiry, tampered with, or presented by a different organization or operation.** Each case is refused distinctly.
- **An employee record contains text that reads as instructions to an AI agent.** The content is returned as data and cannot alter the server's authorization or behavior.
- **Two employees share a display name.** Name-based lookup does not silently pick one; it returns the ambiguity for resolution against stable identifiers.
- **An attendance timestamp has no unambiguous time zone.** The request is refused rather than resolved by assumption.
- **The MCP client does not support tool lists that change after connection.** The adopter is told which tools their configuration exposes and how to refresh.
- **A very large organization is asked for a complete export.** The request is bounded and refused with a named limit rather than attempting an unbounded response.
- **Jisr's documentation and its live specification disagree.** The divergence is reported and blocks the affected tool rather than being resolved by guessing.

## Requirements *(mandatory)*

### Functional Requirements

#### Adoption and client compatibility

- **FR-001**: The server MUST be runnable by an adopter in a local, single-organization deployment using a single documented command, with no build step and no database requirement.
- **FR-002**: This release MUST deliver the self-hosted single-organization deployment only. The server MUST nonetheless obtain caller authorization, organization context, and credentials through a deployment boundary rather than assuming a single organization, so that a hosted multi-organization deployment can be added later without altering any tool contract, result envelope, error code, or safety annotation.
- **FR-002a**: Where more than one MCP protocol adapter is shipped, every tool MUST present identical inputs, outputs, result envelope, error codes, and safety annotations through each adapter. Any observable difference between adapters is a defect, not a variation.
- **FR-003**: The server MUST work with any specification-compliant MCP client without client-specific code paths, and MUST be verified against at least Claude Code, Claude Desktop, Cursor, a ChatGPT/Codex-family client, and the official MCP Inspector.
- **FR-004**: The project MUST publish a copy-pasteable configuration block for each verified client, and a documented invocation for use from a terminal or script.
- **FR-005**: The server MUST provide instructions at connection time covering, at minimum, these six subjects: the upstream domain and what the server is for; that `employeeId` is a UUID and `employeeCode` an integer and the two are never interchanged; that collections are traversed only by server-issued cursor; that an absent tool means an authorization or capability gate failed rather than a missing feature; that financial data is reachable only through its own tools; and that all data is live rather than stored. Completeness is assessed against this enumerated list.
- **FR-006**: The server MUST fail startup with a message naming the specific missing or invalid setting and the corrective action, and MUST NOT emit a stack trace or any credential value on a configuration failure.

#### Read surface coverage

- **FR-007**: Every read operation in the approved Jisr specification snapshot MUST be reachable through exactly one purpose-built tool. This release covers: employee list; employee basic information; employee financial information; attendance summary; attendance logs; annual leave summary; accrual transactions; employee monthly payables; payroll transactions; GL transaction types; paygroups; accounting journal retrieval; departments, employment types, business units, locations, nationalities, and outsourcing companies lookups; webhook subscription listing; and audit events.
- **FR-008**: The server MUST NOT expose a generic request tool, an arbitrary-path tool, an arbitrary-URL tool, or any other means for a caller to reach an operation not named in the endpoint manifest.
- **FR-009**: Tool names MUST follow one documented convention that identifies domain and action, and MUST remain stable across releases once published.
- **FR-010**: The project MUST maintain a machine-readable endpoint manifest, and an automated gate MUST fail when the implemented surface and the approved specification snapshot diverge.
- **FR-011**: The live Jisr specification MUST be verified against the manifest before any tool is implemented, and any divergence MUST be reported rather than resolved by assumption.
- **FR-012**: The server MUST expose no write, create, update, delete, or test operation in this release; the write surface MUST be absent rather than present-and-disabled.

#### Discovery and transparency

- **FR-013**: The server MUST report connection health without returning any credential, secret, token, or key identifier.
- **FR-014**: The server MUST report, for each domain, four independently observable facts: supported by the specification, permitted by the connected Jisr key, allowed by the caller's authorization, and enabled by configuration.
- **FR-015**: The server MUST describe available domains, their fields, sensitivity, freshness, and pagination behavior without returning record data.
- **FR-016**: When a capability is unavailable, the server MUST make the reason distinguishable — not configured, key lacks permission, caller lacks authorization, or disabled by configuration — and MUST state the action that would resolve it and who can take it.

#### Authorization

- **FR-017**: Every request MUST be authorized against two independent gates: the caller's role and granted scopes, and the connected Jisr key's permissions. Neither MUST be inferred from the other.
- **FR-018**: The listed tool surface MUST be filtered to what the caller is authorized to use, such that unauthorized capabilities are undiscoverable rather than merely refused on call.
- **FR-018a**: Every tool returning a collection MUST scope its result set to the records the caller's role profile can reach, and MUST apply that scope before pagination. A caller MUST NOT be able to observe the existence of a record outside their reachable set by any means, including total counts, page counts, or other pagination metadata. Reachable sets are: `employee_self` — its own records only; `manager` — its own records plus those of its direct reports per FR-019a; `hr_operations`, `finance`, `auditor`, and `integration_admin` — the organization, subject to each profile's domain authorization; `platform_operator` — none.
- **FR-019**: The server MUST define these distinct role profiles: employee self-service reader, manager reader, HR operations, payroll and finance, integration administrator, auditor, and platform operator. In this release the operator selects the active profile by configuration; the profile definitions MUST be the same ones a future identity provider would map onto.
- **FR-019a**: The manager profile reaches an employee if and only if that employee's `line_manager` resolves to the caller — direct reports only. The server MUST NOT derive, infer, or traverse an indirect reporting tree.
- **FR-019b**: For the `employee_self` and `manager` profiles, the deployment MUST supply the Jisr employee identity the caller corresponds to. The server MUST refuse to start when one of those profiles is configured without it, rather than running with an empty reachable set — a silently empty result is indistinguishable from "this person manages nobody", and would hide a misconfiguration behind plausible output.
- **FR-020**: Financial authorization MUST be separate from general HR authorization; holding one MUST NOT confer the other.
- **FR-021**: Integration administration MUST NOT confer access to employee financial data, and infrastructure or platform access MUST NOT confer access to any organization's HR or financial data.
- **FR-022**: Every request, stored record, and data-access operation MUST carry explicit organization context even though this release serves one organization, and any identifier or cursor bearing a different organization context MUST be refused. Organization context MUST NOT be ambient or implicit.
- **FR-023**: The connected Jisr key's permissions MUST be the outer boundary of what the server can reach, and the operator MUST be able to narrow the exposed surface further by configuration.
- **FR-023a**: Financial and sensitive-identity tools MUST remain hidden unless the operator enables them by an explicit, separate configuration setting, even when the connected Jisr key permits them. Permission from the key alone MUST NOT be sufficient to expose them.
- **FR-023b**: The documentation MUST recommend configuring a separate, finance-scoped Jisr credential when the finance surface is enabled, and the server MUST support a distinct credential for it.

#### Data protection

- **FR-024**: Every field the server returns or stores MUST carry a data classification assigned before first use.
- **FR-025**: Authentication secrets MUST never appear in a result, summary, error, log, trace, schema, fixture, or test artifact.
- **FR-026**: Financial data MUST be reachable only through its dedicated tools under its dedicated authorization, and MUST NOT appear as fields inside general HR results.
- **FR-027**: Fields appearing in upstream responses that are absent from the approved schema MUST NOT be exposed automatically; their appearance MUST be recorded as drift.
- **FR-028**: Every tool MUST declare, in the data catalog, the classified field groups it returns and the purpose each serves. A tool's response MUST NOT contain any field outside its declared groups. Field groups classified `EMPLOYEE_SENSITIVE` or `FINANCIAL_CONFIDENTIAL` MUST NOT be declared by a tool whose stated purpose does not require them.
- **FR-029**: The redaction mechanism enforcing FR-025 MUST fail closed: where a value cannot be classified or redacted with certainty, the log or trace entry MUST be suppressed rather than emitted. No full employee, financial, payroll, or journal record may be logged under any condition.

#### Result contract

- **FR-030**: Every read result MUST state the operation, the data source, the point in time the data reflects, whether it is stale, whether it is partial, and pagination state where applicable.
- **FR-031**: A caller MUST never be able to mistake stored data for live upstream data.
- **FR-032**: Every result MUST provide both machine-reusable structured data and a short human-readable summary.
- **FR-033**: Pagination MUST use opaque cursors bound to organization, operation, and the approved filter set, with an expiry; upstream addresses supplied by a caller MUST be rejected.
- **FR-034**: Per-call page size and per-invocation total record limits MUST be enforced, and exceeding them MUST produce a named limit error rather than truncation.
- **FR-035**: Errors MUST use a stable, documented code set with a retryability indication and a suggested action, and MUST NOT expose upstream stack traces, query text, tokens, or secrets.
- **FR-036**: Empty, partial, stale, and unavailable outcomes MUST be distinguishable from one another and from success.

#### Safety annotations

- **FR-037**: Every tool MUST carry safety annotations that match its actual behavior, and a tool annotated read-only MUST cause no upstream mutation of any kind, including configuration or subscription changes.

#### Auditability and observability

- **FR-038**: Every tool call MUST produce an audit record of identity, organization, tool, authorization decision, and outcome, without sensitive record contents.
- **FR-038a**: Audit records MUST be emitted as structured JSON on the standard error stream. The server MUST NOT write audit records to disk. Retention, forwarding, and protection of that stream are the operator's responsibility and MUST be documented as such.
- **FR-039**: A single correlation identifier MUST link a caller's request through authorization, upstream call, and audit record.
- **FR-040**: The server MUST expose operational signals covering call volume and outcome by tool, authorization denials, sensitive-tool usage, upstream failures and rate limiting, and detected drift.

#### Public distribution

- **FR-041**: The repository MUST be publishable publicly with a license, a README sufficient to reach first successful use, a security disclosure policy, contribution guidance, and a changelog.
- **FR-042**: No real credential, employee, or payroll data may exist anywhere in the repository or its test fixtures, and an automated secret scan MUST run on every change.
- **FR-043**: The full automated test suite MUST run on every proposed change before merge.
- **FR-044**: Releases MUST follow semantic versioning, and each release MUST document the MCP protocol version(s) it supports and the Jisr specification snapshot it was built against.
- **FR-044a**: Every release MUST originate from a version-control tag on the default branch, be published as a GitHub Release carrying generated notes, and reach the package registry through an automated workflow triggered by that tag — never from a maintainer's local machine. Published packages MUST carry build provenance.
- **FR-044b**: The default branch MUST be protected: no direct pushes, and the full automated test suite, the endpoint coverage gate, and the secret scan MUST pass before any change can merge.
- **FR-045**: This release MUST operate against live Jisr data only, requiring no database, queue, or background worker to run. The result envelope MUST nonetheless carry the source and freshness fields defined in FR-030 from the outset, so that a later synchronized store becomes an additive change rather than a breaking one.

### Key Entities

- **Organization Connection**: One organization's link to Jisr — its host type, slug, credential references, permitted domains, and enablement state. Owns every record the server holds for that organization.
- **Caller Identity**: The authenticated principal making a request, carrying role, granted scopes, and organization membership. Distinct from the organization connection, and gated independently of it.
- **Tool**: A single purpose-built capability mapping to exactly one documented upstream operation, carrying its input contract, output contract, sensitivity, required authorization, and safety annotations.
- **Endpoint Manifest Entry**: The recorded correspondence between a documented upstream operation and the tool implementing it, including sensitivity, required upstream permission, required caller scope, and release. The basis of the coverage gate.
- **Result Envelope**: The uniform wrapper around every read result carrying source, freshness, completeness, pagination, and warnings alongside the records.
- **Cursor**: An opaque, expiring, integrity-protected continuation token bound to one organization, one operation, and one approved filter set.
- **Capability Record**: The four-way statement of whether a domain is supported, permitted, allowed, and enabled — the basis of both dynamic tool exposure and unavailability explanations.
- **Data Classification**: The sensitivity label attached to every field, determining whether it may be stored, returned, logged, or must be withheld.
- **Audit Event**: The tamper-evident record of a tool call and its authorization decision, holding no sensitive record contents.
- **Drift Record**: Evidence that the upstream surface has changed relative to the approved snapshot, recorded without capturing the unknown value where it may be sensitive.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person who has never seen the project reaches their first successful authorized Jisr answer in under 10 minutes, using only the published README, without reading source code, and without installing a database or any other service.
- **SC-002**: 100% of documented Jisr read operations are reachable through a purpose-built tool, and 0% of undocumented operations are reachable, proven by an automated gate that fails the build on divergence.
- **SC-003**: Across the entire automated test suite, credential, secret, and token values appear 0 times in any result, summary, error, log, trace, or stored artifact.
- **SC-004**: Every cell of the role-profile-by-tool authorization matrix resolves to its expected allow or deny, with 0 cells where an unauthorized capability is discoverable.
- **SC-005**: In 100% of cases where a capability is unavailable, an agent can determine the reason and the corrective action from the server's own response, without human investigation.
- **SC-006**: The server is verified working against at least 5 independent MCP clients with 0 client-specific code paths.
- **SC-007**: 100% of read results state their source and the time the data reflects, and 0 results present stored data as live.
- **SC-008**: A complete authorized employee collection can be traversed to its end without any single response exceeding the published per-call limit, and 0 traversals require the caller to construct an upstream address.
- **SC-009**: 100% of injected unknown upstream fields are detected and withheld rather than passed through to a caller.
- **SC-010**: An HR operations user answers questions spanning at least 4 distinct Jisr domains within one uninterrupted assistant session, with 0 switches to the Jisr web application, verified as a scripted end-to-end scenario.
- **SC-011**: Every tool call in a replayed session has a corresponding audit record, with 0 records containing sensitive payloads.
- **SC-012**: 100% of the project's own Definition of Done items are satisfied before the first public release is tagged.
- **SC-013**: Financial tools are absent from the listed surface in 100% of deployments that have not explicitly enabled them, including deployments whose Jisr key permits financial access.
- **SC-014**: For identical inputs and authorization, every tool produces identical structured output, error codes, and annotations through every shipped protocol adapter, with 0 divergences.

## Out of Scope (Deferred)

These are deliberately excluded from this release. Each is deferred rather than rejected,
and the design must not preclude any of them.

- **Hosted multi-organization deployment.** Identity-provider authentication, per-tenant
  credential management, and the cross-tenant test matrix belong to a later feature. The
  deployment boundary required by FR-002 is what keeps that feature additive.
- **Write, create, update, delete, and test operations.** The write surface is absent from
  this release, not present and disabled (FR-012).
- **Synchronized local store and webhook ingestion.** Deferred with the envelope fields
  already in place so it arrives without a breaking change (FR-045).
- **Derived analytics and KPI tooling.** Sits above this data layer and must not influence
  the tool structure or authorization model defined here.
- **Asynchronous bulk export.** Bounded pagination only; complete exports require their own
  security, retention, and delivery review.

## Assumptions

- **Access exists.** The target organization's Jisr subscription has Open API access enabled and an administrator can issue API credentials with the required permissions. Without this the product cannot function and cannot be tested.
- **Specification-driven, not documentation-driven.** The live Jisr OpenAPI specification is authoritative; the endpoint inventory in the baseline plan is a starting point to be verified, not a source of truth.
- **Unanswered upstream questions are dependencies, not blockers to specify.** Rate limits, token lifetime, webhook guarantees, complete schemas for several domains, and the external-aggregator onboarding process are currently unknown and recorded as open questions. Where a behavior is unknown, the server presents a safe bounded abstraction rather than an assumed one.
- **Live-only in this release.** Correct behavior is defined against live upstream data, and this release stores no Jisr records. A later synchronized store would be an optimization that must announce itself through the result envelope, never a silent substitute.
- **Separate credentials per permission set.** Organizations are expected to be able to issue distinct Jisr keys for HR read and finance read; the product does not require this but is designed to benefit from it.
- **Roles come from operator configuration** in this release, and would come from an identity provider in a future hosted deployment. The product does not implement its own user directory in either case.
- **Bilingual data is normal.** Employee and lookup records may contain Arabic text; correct handling of Arabic names and localized lookup values is a functional expectation, not an enhancement.
- **Permissive open-source license.** A permissive license is assumed for public release, allowing commercial use by adopters. The specific license is a publication-time decision, not a design constraint.
- **Legal review is a release gate, not a design input.** Saudi PDPL obligations are designed for; qualified legal review is required before production use and is tracked as an external dependency.
- **Parts of Constitution Principle IV are dormant, not satisfied.** The principle requires `organization_id` on every stored record, composite uniqueness constraints, organization context on every repository method, and finance data stored under separate encryption keys with separate retention. This release stores nothing, so those clauses are vacuously true rather than met. They activate the moment any persistence is introduced — including a cache. FR-022's requirement that organization context be explicit on every operation is the live portion of the principle and is met in full.
- **Analytics and KPI capability is out of scope** for this specification. It sits above this data layer in a later release and must not influence the tool structure or authorization model defined here.

## Dependencies

- A Jisr organization with Open API access, and preferably a test or sandbox organization, for development and verification.
- Answers from Jisr to the recorded open questions, particularly rate limits, token lifetime, and the complete schemas for accrual transactions, monthly payables, and payroll transactions.
- Qualified legal review of the privacy, retention, and data-transfer position before production use.
- A published license decision before the repository is made public.
