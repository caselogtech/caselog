#!/usr/bin/env bash
set -euo pipefail
: "${CASELOG_CLI:?Path to the built Caselog cli.js is required}"
: "${CASELOG_TOKEN:?Provide a scoped token through the CI secret store}"
: "${CASELOG_API_URL:?Provide the API URL}"
: "${PROJECT_SLUG:?Provide the project slug}"
: "${RELEASE_ID:?Provide the release UUID}"
: "${POLICY_ID:?Provide the published policy UUID}"
: "${RUN_ID:?Provide a distinct test run UUID for this build}"
: "${COMMIT_SHA:?Provide the exact commit}"
: "${BUILD_ID:?Provide the unique build identity}"
: "${JUNIT_PATH:?Provide the JUnit file or directory}"
output=$(mktemp -d)
trap 'rm -rf -- "$output"' EXIT
node "$CASELOG_CLI" candidate create --project "$PROJECT_SLUG" --release "$RELEASE_ID" \
  --commit "$COMMIT_SHA" --build "$BUILD_ID" --json > "$output/candidate.json"
candidate=$(jq -er '.data.id' "$output/candidate.json")
node "$CASELOG_CLI" readiness assign --project "$PROJECT_SLUG" \
  --candidate "$candidate" --policy "$POLICY_ID"
node "$CASELOG_CLI" upload --project "$PROJECT_SLUG" --run "$RUN_ID" \
  --candidate "$candidate" --fail-on-unmatched "$JUNIT_PATH"
node "$CASELOG_CLI" readiness evaluate --project "$PROJECT_SLUG" \
  --candidate "$candidate" --wait --timeout 180 --json
