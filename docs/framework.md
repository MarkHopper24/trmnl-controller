# Framework authoring contract

Verified against [TRMNL Framework 3.4](https://trmnl.com/framework/docs/3.4) on 2026-10-10. Read the current official page for any component you introduce. Do not invent responsive variants, Liquid filters, settings names, or JavaScript APIs.

## Structure and portability

For hosted private plugins, TRMNL supplies Screen, Mashup and View. Each layout file contains exactly one `div.layout`; an optional `div.title_bar` is its sibling. A custom/BYOS preview provides the full screen → optional mashup → view → layout hierarchy. Non-full views belong in a mashup. See [Structure](https://trmnl.com/framework/docs/3.4/structure).

Provide `full.liquid`, `half_horizontal.liquid`, `half_vertical.liquid`, `quadrant.liquid`, `shared.liquid` and `settings.yml`. Shared content is prepended, so scope selectors and use unique chart IDs per layout. Pin `framework_version: 3.4.0`; refresh deliberately after checking the upgrade guide. Do not add Screen/View wrappers or reload the Framework inside hosted layout files.

Use framework components (`title`, `value`, `label`, `item`, `table`, `progress`) and utilities. Inherit the host's theme. Avoid hardcoded colors and inline fixed dimensions; use framework tokens, and `TRMNLPaint` for canvas/SVG. Use `image--adaptive` only for monochrome silhouettes with same-origin/CORS-enabled assets, not photos or multicolor logos. See [Enhancement Guide](https://trmnl.com/framework/docs/3.4/v3_enhancement_guide).

## Dynamic UI

Prefer data-driven Liquid conditions and loops, plus render-time adaptive UI. E-paper displays a captured image; click handlers, forms and continuous animation do not create usable device interaction.

Use `data-clamp`, `data-overflow`, `data-overflow-counter`, responsive `data-overflow-max-cols-*`, `data-fit-value`, `data-value-format`, and `data-table-limit` where appropriate. Show loading, empty, error, stale/last-updated states. Escape external text and handle null, zero, false, long labels, large values, Unicode and long arrays. Do not quietly present stale values as current.

Framework breakpoints are model size classes, not browser pixel widths. Use `sm:`, `md:`, `lg:`, `portrait:` and supported bit-depth variants. Ordering is size:orientation:bit-depth:utility. Layout/gap/grid/flex/spacing/size take size and orientation only. Bit-depth variants are exact, not progressive. See [Responsive](https://trmnl.com/framework/docs/3.4/responsive).

Charts should use `TRMNLCharts.watch`, `TRMNLCharts.options`, `TRMNLCharts.series`, and `TRMNLPaint.px` so device and theme changes rebuild them. Fetch and transform data upstream rather than running credentialed requests in markup. After injecting DOM content, call and await `terminalize()`. The renderer waits for `window.TRMNL_PLUGINS_READY`; also inspect `trmnl:terminalize:stats` errors. See [Runtime](https://trmnl.com/framework/docs/3.4/framework_runtime) and [Chart](https://trmnl.com/framework/docs/3.4/chart).

## Required authoring verification

1. Discover target models with `trmnl_list_models`, rather than assuming 800×480, and read their profile/dimensions/color capabilities.
2. Validate local files. Resolve errors; evaluate warnings against the intended design.
3. Preview every provided layout with realistic data and loading/empty/error/stale states. Include a long/overflow fixture.
4. Inspect representative intended models, portrait orientation if supported, theme and color/bit-depth behavior. For specialized charts, check runtime readiness and final settled output.
5. When authorized, deploy to a named private-plugin instance, read back its files and use TRMNL's preview jobs. An uploaded plugin is not automatically playlist/display proof.

Local LiquidJS intentionally fails on unsupported TRMNL custom filters; use `trmnl_render_markup` or remote preview for those. Static lint is deliberately limited and cannot establish visual quality, contrast, runtime overflow, network availability or all-device compatibility.
