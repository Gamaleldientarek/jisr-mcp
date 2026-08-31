# Tool naming, stability, and deprecation

Satisfies spec FR-009.

## Convention

```
jisr_<domain>_<action>
```

- **`jisr_`** — every tool, without exception. An MCP client may connect several
  servers at once; an unprefixed `employees_list` would collide.
- **`<domain>`** — the Jisr domain, matching the `domain` field in the endpoint
  manifest: `employees`, `attendance`, `leave`, `accruals`, `finance`,
  `accounting`, `lookups`, `webhooks`, `audit`, plus `connection`,
  `capabilities` and `data_catalog` for discovery.
- **`<action>`** — `list` for a collection, `get` for a single record. Write
  pairs (feature 002) use `<verb>_prepare` and `<verb>_commit`: prepare
  validates and previews without writing and returns a single-use confirmation
  reference; commit takes that reference and performs exactly the previewed
  write. The two are one consent flow and always ship together.

Singular and plural follow the shape of the result, not the domain:
`jisr_employees_list` returns many, `jisr_employee_basic_info_get` returns one.

## Stability

**A published tool name is a public contract.** Adopters write it into client
configuration, and agents learn it. Renaming one silently breaks both.

- A name that has appeared in a tagged release **MUST NOT** be renamed or
  repurposed within that major version.
- A name **MUST NOT** be reused for a different operation, ever. Reuse is worse
  than removal: a caller receives plausible data from the wrong source.
- Adding a tool is a MINOR release. Removing or renaming one is MAJOR.

## Deprecation

1. Announce in `CHANGELOG.md` at the release that supersedes the tool, naming
   its replacement.
2. Keep the old name working for **at least one MINOR release**, with the
   deprecation and the replacement stated in its description.
3. Remove it only in a MAJOR release, listed in the release notes.

A tool that becomes unreachable because a Jisr operation was withdrawn is not a
deprecation — it is upstream divergence. The coverage gate fails the build, and
the change is reviewed deliberately rather than absorbed.

## Checked automatically

The coverage gate (`npm run verify:coverage`) asserts that every bound tool name
is unique and that every tool maps to exactly one manifest operation. It cannot
detect a rename between releases; that is what review is for.
