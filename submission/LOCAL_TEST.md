# Test the private Zvid Make app

This is the shortest route to executing the actual Make module. Use Make's web Custom Apps editor for the first test; the VS Code clone and repository sync can wait until the module works.

The two credentials are different:

- A **Make API token** is needed only if you later use the Make Apps Editor VS Code extension.
- A **Zvid API key** authenticates the private module with `https://api.zvid.io`. Create it at https://app.zvid.io/api-keys.

Do not paste either credential into this repository.

## 1. Create the private test app

1. Sign in to Make.
2. In the left navigation, select **More** if necessary, then **Custom Apps**.
3. Select **Create app**.
4. Enter:

   | Field | Value |
   | --- | --- |
   | Name | `zvid-local-test` (or another unique lowercase hyphenated name) |
   | Label | `Zvid Local` |
   | Description | `Private test app for rendering videos and images with Zvid.` |
   | Theme | `#7c3aed` |
   | Language | English |
   | Audience | Global |

5. Save the app. Keep it private; do not publish or request review.

Official reference: [Initial setup in Make](https://developers.make.com/custom-apps-documentation/basics/create-your-app).

## 2. Configure the Base

1. Open **Base** in the app editor.
2. Remove the generated Base code.
3. Copy the complete contents of [`src/zvid/general/base.iml.json`](../src/zvid/general/base.iml.json) into the Base editor.
4. Select **Save changes**.

The Base supplies `https://api.zvid.io`, the `x-api-key` header, shared errors, and credential log sanitization to every module.

## 3. Create the Zvid API-key connection

1. Open **Connections** and select **Create connection**.
2. Choose type **API Key**.
3. Use label **Zvid API key**. If Make displays an internal Name field, enter `zvidApiKey` exactly.
4. Save the connection shell.
5. Open its **Parameters** tab, remove the generated code, and paste all of [`src/zvid/connections/zvid-api-key/params.iml.json`](../src/zvid/connections/zvid-api-key/params.iml.json).
6. Open its **Communication** tab, remove the generated code, and paste all of [`src/zvid/connections/zvid-api-key/communication.iml.json`](../src/zvid/connections/zvid-api-key/communication.iml.json).
7. Select **Save changes**.

Make will not ask for the production Zvid key here. The connection component defines the form and validation request; the key is entered later when the module is added to a scenario.

Official reference: [Connections](https://developers.make.com/custom-apps-documentation/basics/connection).

## 4. Create the first read-only module

Open **Modules**, select **Create module**, and use:

| Field | Value |
| --- | --- |
| Template | Blank module |
| Type | Action |
| Action | Read |
| Connection | Zvid API key |
| Name | `getCreditBalance` |
| Label | `Get the credit balance` |
| Description | `Returns the account's total, subscription, and add-on credit balances.` |

After saving the module shell, replace each tab with the complete matching file:

| Make tab | Repository file |
| --- | --- |
| Communication | [`communication.iml.json`](../src/zvid/modules/get-credit-balance/communication.iml.json) |
| Mappable parameters | [`mappable-params.iml.json`](../src/zvid/modules/get-credit-balance/mappable-params.iml.json) |
| Interface | [`interface.iml.json`](../src/zvid/modules/get-credit-balance/interface.iml.json) |
| Samples | [`samples.iml.json`](../src/zvid/modules/get-credit-balance/samples.iml.json) |

Save every tab. If Make shows a visibility switch for the private module, enable it for testing.

## 5. Run the read-only module in Scenario Builder

1. Open Make's **Scenarios** area and create a new scenario.
2. Select the large **+** button and search for **Zvid Local**.
3. Select the app carrying the **Private** tag, then **Get the credit balance**.
4. In **Connection**, select **Add** or **Create a connection**.
5. Give the scenario connection a recognizable name such as `Zvid production test`.
6. Paste the production `zvid_...` API key from https://app.zvid.io/api-keys and save it.
7. Save the module and scenario. If Make asks to install the private app in the organization, select **Yes**.
8. Right-click the module and select **Run this module only**, or select **Run once** for the scenario.
9. Open the execution bubble above the module, then **Output > Bundle 1**.

Success means the bundle contains `balance`, `subscription_credits`, and `addon_credits`. This is already a real execution of the Make module, including the connection, Base inheritance, HTTP request, IML output, and Make logs. It does not spend render credits.

Official reference: [Test your app](https://developers.make.com/custom-apps-documentation/create-your-first-app/test-your-app).

## 6. Validate and submit one image render

Create two more blank Action modules with the same **Zvid API key** connection:

| Name | Label | Action | Source folder |
| --- | --- | --- | --- |
| `validateRender` | Validate a render payload | Read | [`validate-render`](../src/zvid/modules/validate-render) |
| `createRender` | Create a render | Create | [`create-render`](../src/zvid/modules/create-render) |

For each module, paste its folder's `communication.iml.json`, `mappable-params.iml.json`, `interface.iml.json`, and `samples.iml.json` into the identically named Make tabs, then save the changes.

Use [`submission/fixtures/still-image-project.json`](fixtures/still-image-project.json) as the test project.

### Free validation

1. Add **Validate a render payload** to the scenario.
2. Reuse the existing Zvid connection.
3. Set **Source** to **Project JSON**.
4. Copy the complete fixture JSON into **Project JSON**.
5. Leave Overrides and Webhook URL empty.
6. Run this module only.
7. Confirm `valid` is `true`; note `creditsRequired`. Validation does not enqueue work or spend credits.

### Paid production render

1. Add **Create a render** to the scenario.
2. Reuse the existing Zvid connection.
3. Set **Render type** to **Image**.
4. Set **Source** to **Project JSON**.
5. Paste the same fixture into **Project JSON**.
6. Leave Overrides and Webhook URL empty.
7. Save, right-click the module, and select **Run this module only**.
8. Confirm that the output includes `jobId`, `status`, and `creditsReserved`.

This request uses the production Zvid API and spends the displayed render credits. The queued render can be inspected in https://app.zvid.io.

## 7. Optional: inspect completion from Make

Create one more Action/Read module:

| Name | Label | Source folder |
| --- | --- | --- |
| `getRender` | Get a render | [`get-render`](../src/zvid/modules/get-render) |

Paste its four tab files as above. Add it to the scenario, paste the `jobId` returned by **Create a render**, and run it. When `state` is `completed`, `url` contains the production output.

## 8. Move to the complete app after the first test

Once the minimal modules work:

1. Install and configure the official Make Apps Editor extension. Its Make API token needs `sdk-apps:read` and `sdk-apps:write`; this is unrelated to the Zvid connection key.
2. In VS Code, open an empty local folder. In the Make Apps Editor sidebar, right-click **Zvid Local** and select **Clone to Local Folder (beta)**.
3. From this repository, preview and build the complete clone:

   ```powershell
   npm.cmd run scaffold:clone -- "C:\path\to\the\clone"
   npm.cmd run scaffold:clone -- "C:\path\to\the\clone" --write
   ```

   The first command is a dry run. The second creates or updates all 28 modules and the render-event webhook while preserving existing remote ID mappings and leaving `.secrets` untouched.
4. Run **Developer: Reload Window** in VS Code so the extension reloads the generated manifest and files.
5. Right-click the clone's `makecomapp.json`, choose **Deploy to Make**, select the private app origin, and confirm creation of unmapped local components when prompted.
6. Execute the complete [`TEST_PLAN.md`](TEST_PLAN.md) before requesting review.

Official references: [Make Apps Editor configuration](https://developers.make.com/custom-apps-documentation/get-started/make-apps-editor/apps-sdk/configuration-of-vs-code), [clone to a local workspace](https://developers.make.com/custom-apps-documentation/get-started/make-apps-editor/apps-sdk/local-development-for-apps/clone-make-app-to-local-workspace), and [deploy changes to Make](https://developers.make.com/custom-apps-documentation/get-started/make-apps-editor/apps-sdk/local-development-for-apps/deploy-changes-from-local-app-to-make-app).

## Troubleshooting

- **Zvid Local is absent from Scenario Builder:** enable the module's visibility switch, refresh Scenario Builder, and make sure the scenario belongs to the same Make organization as the private app.
- **The connection returns HTTP 401:** create or copy a current key from https://app.zvid.io/api-keys. Do not enter the Make API token in the Zvid connection.
- **Make rejects a tab when saving:** ensure only that file's complete JSON was pasted, including its outer `{}` or `[]`.
- **Validation returns `valid = false`:** inspect the `errors` collection. Do not run Create a render until it validates.
- **The render returns HTTP 402:** the production Zvid account does not have enough credits for that render.
- **Deploy asks how to map an unexpected remote component:** select the matching local component when its function and internal name are the same; otherwise pull it as a new local component and compare it before deploying again.
