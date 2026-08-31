#!/bin/bash
# Makes the repository public and applies branch protection and security
# features IN THE SAME STEP, so it is never public-and-unprotected.
#
# Run this only after a final skim of HANDOFF.md, the specs, and research.md
# for client references you are comfortable publishing. Making a repo public
# is effectively irreversible: mirrors and archives cache within minutes.
set -euo pipefail

REPO="Gamaleldientarek/jisr-mcp"

echo "==> Making $REPO public"
gh repo edit "$REPO" --visibility public --accept-visibility-change-consequences

echo "==> Branch protection ruleset on the default branch"
gh api "repos/$REPO/rulesets" -X POST --input - <<'JSON'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "verify" },
          { "context": "secret-scan" } ] } }
  ]
}
JSON

echo "==> Security features"
gh api "repos/$REPO" -X PATCH --input - <<'JSON'
{"security_and_analysis":{
  "secret_scanning":{"status":"enabled"},
  "secret_scanning_push_protection":{"status":"enabled"}}}
JSON
gh api "repos/$REPO/private-vulnerability-reporting" -X PUT
gh api "repos/$REPO/vulnerability-alerts" -X PUT

echo
echo "Public, protected, and scanning. Done."
