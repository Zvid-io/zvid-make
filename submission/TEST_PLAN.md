# Zvid Make app test plan

Use this plan against the private custom-app version before publishing or requesting review. Run `npm.cmd test` first. You can also run `npm.cmd run test:production` for a free production-API smoke test from the local shell, but that does not replace the private Make scenarios because Make's IML runtime does not run locally. Execute every scenario immediately before review so Make's retained logs are current. Do not put API keys, personal data, private media URLs, or customer payloads in scenario names, notes, inputs, or shared logs.

## Test data

- Create a dedicated test API key at https://app.zvid.io/api-keys.
- Use a synthetic project and synthetic template variables.
- Use a one-second image or video project for credit-consuming tests.
- Keep the generated template IDs, job IDs, and webhook ID only in scenario bundles or temporary variables.
- Archive every template created by these tests when the run finishes.

## Scenario 1: read-only authoring and libraries

Build one scheduled scenario with a router. Keep each search module at the end of its route.

1. **Plan a creative video** — use a synthetic 15-second brief and confirm `plan` contains the schema version, direction, and storyboard data.
2. Route A: **Get the project schema** → **List supported elements** → **Get element documentation** → **Get an example project** → **Repair project JSON**. Confirm each output is mappable and the repaired result has `valid`, `remainingErrors`, and `warnings`.
3. Route B: **Search creative assets** with Limit `101`. Confirm each asset is emitted as a separate bundle and inspect the request log for correct offset pagination when more than 100 matches exist.
4. Route C: **Get a creative asset** → **Get creative asset content** using a slug returned by the search. Confirm metadata and JSON content are returned separately.
5. Route D: **Get stock library availability** → **Search stock media** with Limit `61`. Confirm availability is boolean by media type and search results are separate bundles with preview and render URLs. Inspect the request log for correct page pagination when more than 60 results exist.
6. Add an error route or separate execution with an invalid creative-asset slug. Confirm the error includes the HTTP status and API message.

## Scenario 2: template lifecycle

Use a valid example project containing safe defaults for every template variable.

1. **Create a template** and capture its ID.
2. **Get a template** using that ID.
3. **Preview a template** with synthetic variables. Confirm the resolved project and statistics are returned without a render job.
4. **Update a template** by changing only its description.
5. **Duplicate a template** and capture the copy's ID.
6. Put **List templates** at the end of a router route with Limit `101`. Confirm one bundle per template and inspect pagination behavior.
7. **Archive a template** for both the original and duplicate IDs as cleanup.
8. Run one separate error execution with a well-formed but nonexistent template ID and retain the formatted 404 log.

## Scenario 3: single render lifecycle (uses credits)

Use a minimal validated project.

1. **Validate a render payload**. Route only `valid = true` to the next module.
2. **Create a render** and capture `jobId`.
3. After the job has had time to complete, run **Get a render** with that ID and confirm the output URL is present.
4. Put **Search renders** at the end of a router route with Limit `101`. Confirm one bundle per render and inspect pagination behavior.
5. Run a separate validation with an intentionally invalid field. Confirm the module returns `valid = false` with field-level errors instead of failing the scenario.

## Scenario 4: bulk render (uses credits)

1. **Validate a render payload** for the common project or template first.
2. **Bulk create renders (advanced)** with two synthetic items and distinct names.
3. Confirm `totalJobs = 2`, both job IDs are returned, and rejected/failed counts are zero.
4. Pass the returned `bulkId` to **Get a bulk render**. Confirm its job counts and jobs array are mappable; repeat after completion and confirm `pending = 0`.
5. Run a second execution with one valid and one invalid item. Confirm the valid item is queued and the invalid item appears in `errors` with its original item index.

## Scenario 5: universal API call and connection errors

1. **Make an API Call** with `GET /api/credits/balance`. Confirm status, headers, and response body are mappable.
2. Try an invalid API key in a disposable test connection. Confirm connection creation fails with an `InvalidAccessTokenError` message and the key is absent from logs.
3. If a safe way to exercise rate limiting is available in the test environment, confirm HTTP 429 is classified as `RateLimitError`. Do not generate abusive traffic against production.

## Scenario 6: instant render event

1. Create a scenario beginning with **Watch render events** and turn scheduling on. Confirm activation registers exactly one Zvid webhook.
2. Trigger a safe test delivery from the Zvid webhook endpoint, or complete the minimal render from Scenario 3.
3. Confirm the scenario receives `render.completed` or `render.failed`, the timestamp is parsed as a date, and the data collection is mappable.
4. Send or replay a request with an invalid signature only in an isolated test webhook. Confirm it is rejected and does not start the scenario.
5. Turn scheduling off or remove the trigger. Confirm the registered Zvid webhook is deleted.

## Review evidence checklist

- Every visible module appears in at least one successful retained execution log.
- Search logs show correct bundle iteration, requested limits, and pagination stop conditions.
- One retained execution shows a formatted API error.
- No execution log or scenario contains a secret or personal/customer data.
- Template and webhook cleanup completed.
- Scenario share links are ready for Make's review form.
- The API documentation link is https://docs.zvid.io.
- The service URL is https://zvid.io and the support address is help@zvid.io.
