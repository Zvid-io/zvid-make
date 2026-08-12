# Zvid

Create videos and images from project JSON or reusable templates, run personalized bulk renders, and receive render-completion events in Make.

## Connect Zvid

1. Create an API key at [app.zvid.io/api-keys](https://app.zvid.io/api-keys).
2. Add a Zvid connection in Make and paste the key.
3. Run **Get the credit balance** to confirm the connection.

The API key is sent only to `https://api.zvid.io` and is removed from Make execution logs.

## What you can automate

- **Rendering:** validate a payload, create a single or bulk render, and retrieve job status and output URLs.
- **Templates:** create, retrieve, update, preview, duplicate, render from, list, and archive templates.
- **Creative authoring:** plan a creative video, inspect the project schema and supported elements, get examples, and repair project JSON.
- **Creative libraries:** search Zvid's creative assets and stock library, then retrieve reusable asset content.
- **Events:** start a scenario with **Watch render events** when a render completes or fails.
- **Advanced requests:** use **Make an API Call** for relative Zvid API routes that do not yet have a dedicated module.

## Recommended render flow

1. Run **Validate a render payload** while building the scenario.
2. Run **Create a render** or **Bulk create renders**.
3. Map the returned job or bulk ID into the corresponding status module.
4. Use the completed output URL in the next step of your automation.

Validation does not spend Zvid render credits. Creating a render may spend the credits shown by the validation result and your current plan.

## Resources

- [Zvid documentation](https://docs.zvid.io)
- [Zvid dashboard](https://app.zvid.io)
- [Zvid visual editor](https://editor.zvid.io)
- [Zvid website](https://zvid.io)
- Support: [help@zvid.io](mailto:help@zvid.io)
