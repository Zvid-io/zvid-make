# Make app review QA status

Last verified: 2026-08-11 (Make EU1, Zvid production API)

## Current decision

**Published and submitted for Make review.** Make recorded `Approval requested` on 2026-08-11 after accepting the API documentation URL, evidence links for all 28 modules, and the controlled API-error scenario.

## Reviewer resources

- Make folder: `Zvid App Review` (`378543`)
- Clean Make connection: `Zvid review QA clean account` (`9700609`)
- Clean Zvid API key record: `Zvid Make reviewer QA clean`
- Clean render-event webhook: `Zvid review QA clean render events`
- App: `Zvid` v1.0.0, published, manifest v2
- Public invitation: https://www.make.com/en/hq/app-invitation/bd9800cae61ea1fd4fe53e82f83fdf0b
- Inventory: 28 visible modules, 1 connection component, 1 webhook component

The API key and webhook address are intentionally omitted. Make execution logs sanitize the `x-api-key` request header.

## Scenario evidence

| Scenario | Make ID | Result |
| --- | ---: | --- |
| Account searches | `6906212` | Passed on the clean account: credit balance, Search renders, and List templates |
| 1 - Authoring and public libraries | `6907275` | Passed all 13 modules with a synthetic brief and public Zvid library data only |
| 2 - Template lifecycle | `6906418` | Passed create, get, update, preview, duplicate, render, archive duplicate, and archive original; the clean account returned to zero active templates |
| 3 - Single render lifecycle | `6906480` | Passed validation -> create image render -> wait -> get completed render; also produced the final trigger event |
| 4 - Bulk render lifecycle | `6906757` | Passed with two synthetic image jobs; both children completed with output URLs and no errors |
| 5 - Error handling | `6906792` | Passed controlled HTTP 400 validation, nonexistent-template HTTP 404, and nonexistent-route HTTP 404; errors show `Origin: Zvid` and readable messages |
| 6 - Render-event trigger | `6906901` | Passed on the clean webhook as an instant execution; the retained output contains `Event: render.completed` and the matching render job ID |

Scenario 6 was explicitly changed to **Immediately as data arrives**. Its final evidence run completed successfully in less than one second with one operation and a 430 B payload.

## Privacy and cleanup

- All retained final evidence uses the clean reviewer account and synthetic QA content.
- The clean account currently has zero active templates.
- The first Scenario 1 and temporary inventory scenario, whose histories contained account data, were deleted earlier.
- No pre-existing customer templates, webhooks, API keys, scenarios, or connections were edited or deleted during the clean-account pass.
- No API key or webhook secret appears in this file or the reviewer blueprints.

## Defects fixed during live QA

- Create, Get, Update, and Duplicate template modules now expose explicit template outputs. The earlier generic `{{body.template}}` mapping produced empty downstream bundles in Make.
- **Make an API Call** replaces raw HTML 404 pages with `[404] The requested Zvid API route was not found.`
- Invalid render payloads produce a sanitized HTTP 400 with `Origin: Zvid`.
- The webhook trigger was verified against a real `render.completed` production event.

## Verified code and metadata

- Automated suite: 21/21 tests pass, including the template-output regression coverage.
- The SDK clone synchronizes 120 mapped code files, including the customer Readme.
- The four corrected template communications are deployed to the private Make app.
- The remote Make app contains the deployed Readme.
- App label, description, theme, global audience, manifest version, module count, and module visibility were checked in the Make app builder.
- Documentation: https://docs.zvid.io
- Service: https://zvid.io
- Support: help@zvid.io

## Publication note

The account-search scenario requests a result limit of 101 so the pagination path is configured. The clean account does not contain more than 100 records, so a real multi-page account-data result set was not manufactured solely for QA; pagination behavior remains covered by the module contract and automated tests.

The public invitation resolves to Make's Zvid installation page and exposes exactly the 28 intended modules. Publishing is irreversible in Make: the app cannot be made private again, and its app components cannot be deleted after publication.
