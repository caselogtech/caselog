# Enforce readiness in a pipeline

Build the CLI from a pinned Caselog checkout with the Node/pnpm versions in that
checkout and `pnpm --filter @caselog/cli build`. Set `CASELOG_CLI` to its absolute
`apps/cli/dist/cli.js` path. No published npm package is assumed. Copy
`check-readiness.sh` into your pipeline repository and install `jq`.

Provide the script's required variables through CI configuration; store
`CASELOG_TOKEN` only in the secret store. Its scopes are `candidates:write`,
`results:write`, `readiness:read`, and `readiness:write`, created by a lead or higher.
Provision a distinct test run for each candidate/build, with cases whose automation
IDs match the JUnit report. Publish a policy requiring that run's pass/completion
metrics. Reusing a run across builds mixes source results and is unsuitable for CI.

The script fails before evaluation if ingestion fails or results are unmatched.
Readiness returns 0 to permit promotion, 1 to block it, and 2 for an inconclusive or
failed request. Its JSON includes the immutable decision ID and gate explanations.
To open the UI explanation, use the deployment's web origin followed by
`/<workspace>/<project>/releases/<releaseId>/candidates/<candidateId>`.
Do not print tokens or enable shell tracing.

## GitHub Actions step fragment

Run this after building the CLI and generating the JUnit artifact. Configure the
release, policy, run and API URL variables for the intended project.

```yaml
- name: Enforce Caselog readiness
  env:
    CASELOG_TOKEN: ${{ secrets.CASELOG_TOKEN }}
    CASELOG_API_URL: ${{ vars.CASELOG_API_URL }}
    CASELOG_CLI: ${{ github.workspace }}/caselog/apps/cli/dist/cli.js
    PROJECT_SLUG: ${{ vars.CASELOG_PROJECT }}
    RELEASE_ID: ${{ vars.CASELOG_RELEASE }}
    POLICY_ID: ${{ vars.CASELOG_POLICY }}
    RUN_ID: ${{ steps.create_run.outputs.id }}
    COMMIT_SHA: ${{ github.sha }}
    BUILD_ID: ${{ github.run_id }}-${{ github.run_attempt }}
    JUNIT_PATH: test-results
  run: bash examples/ci/check-readiness.sh
```

Put the promotion step after this step using the default success condition; do not
use `continue-on-error` or an unconditional promotion job.

## GitLab CI job fragment

Install/build the CLI in an earlier job and retain its complete `dist` directory
as an artifact. Set `RUN_ID` from the run-provisioning job's dotenv artifact and
configure the remaining variables, including the CLI path, in project settings.
Mark the token masked and protected when appropriate for your branch policy.

```yaml
readiness:
  stage: verify
  variables:
    COMMIT_SHA: $CI_COMMIT_SHA
    BUILD_ID: $CI_PIPELINE_ID-$CI_JOB_ID
    JUNIT_PATH: test-results
  script:
    - bash examples/ci/check-readiness.sh
  allow_failure: false

promote:
  stage: deploy
  needs: [readiness]
  script:
    - ./promote.sh
```

These are integration fragments, not published workflows or evidence that a remote
provider has run them. API/CLI contracts are exercised locally in
`ci-readiness.e2e.spec.ts`. Real asynchronous queue execution requires a running
instance and is separate from the controlled queue used by API tests.
