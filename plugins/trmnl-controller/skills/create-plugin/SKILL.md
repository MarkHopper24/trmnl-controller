---
name: create-plugin
description: Create or improve a TRMNL display plugin from natural language, including API data, Liquid markup, responsive Framework layouts, previews and deployment.
---

Use the current harness model to author the plugin; no separate inference API is needed. Start with the user's purpose, available data and intended devices. Infer routine choices, asking only for missing facts that change the result. Discover existing devices/plugins before creating duplicates.

Read `trmnl_framework_guide` and the current official Framework page for each specialized component. **Every authored plugin must adhere to TRMNL Framework docs and best practices. Prefer dynamic, data-driven UI wherever it helps.** Framework compliance is part of delivery, not optional polish. Read `trmnl_docs_read` topic `framework` for the detailed contract.

Choose native polling, static data or Plugin Merge when they suffice. For complex/API/private data, use a webhook and the middleware workflow. Inspect the source API's actual schema; do not invent fields, refresh rates or authentication. Put credentials in password custom fields or configured middleware environment references, never markup, URLs, sample data or logs.

Create a local project with `trmnl_project_create`, then tailor its files to the brief using `trmnl_project_save` and the revision returned by `trmnl_project_read`. The starter is a starting point, not the finished custom design. Build all four layouts with appropriate information density. Use Liquid conditionals/loops and escaped external text. Include loading, empty, error, stale/last-updated and long-data behavior.

For hosted private plugins, supply exactly one div.layout per layout and an optional sibling title_bar. TRMNL supplies Screen/View/Mashup. Use model classes and supported responsive utilities, semantic components and runtime fitting/overflow. Keep the active theme working. For charts, use TRMNLCharts/TRMNLPaint adapters and wait for settled rendering. Dynamic UI means adaptive render-time behavior and updated data; physical e-paper does not execute forms or continuous interaction.

Validate the complete project, resolve errors and evaluate warnings. Produce local previews and inspect them in the available browser. Test all layouts and representative intended models, portrait/theme/bit-depth behavior, long/empty/error data and runtime readiness. Local LiquidJS is approximate; use `trmnl_render_markup` and remote preview for TRMNL-only filters. Lint alone is never proof of visual quality or universal hardware support.

For deployment within the user's authorized scope, discover the private-plugin catalog ID using listPlugins/getPlugin, create a named instance if needed, compare/back up existing files, then use `trmnl_project_deploy`. Read files back and use startPreview/getPreview and startRefresh/getRefresh to verify remote results. Only attach to an intended device playlist when that is part of the request. Don't publish a recipe publicly merely because the user asked to build a private plugin.

Use `trmnl_catalog_search` and `trmnl_operation_schema` for exact operations and argument types. Raw file/markup tools exist for narrow repairs; still apply Framework validation and previews. Report what was created, where it was deployed, what was tested, and any remaining account/device evidence.
