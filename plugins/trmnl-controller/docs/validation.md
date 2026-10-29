# Validation record — 2026-10-10

## Version 0.2.0 packaging checks — 2026-10-29

- All 27 behavior, protocol and distribution tests passed on Windows with Node 26.12.1; syntax, catalog, skill and manifest checks passed. The release ZIP uses a fixed timestamp and matches byte-for-byte across repeated builds.
- Codex CLI 0.165.0 accepted the repository-format marketplace and installed `trmnl-controller@trmnl-controller` version 0.2.0 from the locally generated catalog. The distribution test launched its bundled runtime from an unrelated folder with an empty credential home and discovered 199 tools.
- Public read-only smoke checks through the bundled MCP returned HTTP 200 for model, palette, category and server-IP discovery. No device or playlist changes were used for those checks.
- The npm candidate installed into a separate consumer folder and its CLI launched successfully. The dependency audit reported zero vulnerabilities after compatible dependency updates.
- Gitleaks 8.30.1 scanned the staged public snapshot and reported no leaks. Private local publishers, account state, raw automation definitions and unrelated captures were excluded from the publication allowlist.
- Both supplied screenshots and the original requested logo are included. Screenshots retain their compressed image content with embedded descriptive/location metadata removed. Their old listing name is explicitly labeled in the README.

These checks do not establish physical-display output, exhaustive live API coverage or a desktop UI walkthrough. Read the GitHub workflow results for current Linux/macOS and minimum-Node evidence. The original live trials below are historical, not a new account-wide validation.

This section records the original local trial of version 0.1.0. It is historical evidence; see the current release checks below. No npm, OpenAI universal directory or TRMNL Recipes publication is implied.

## Verified

- 24 automated behavior/protocol tests pass on Windows with Node 22.19.0. These cover actual MCP stdio and Streamable HTTP handshakes, all 199 tool schemas, project/deployment request contracts, middleware projection/publish behavior, credential separation, DPAPI storage, concurrent project writes and token refresh, source restrictions, payload limits, error redaction, native MCP preview image output and symlink-based npm launchers.
- The pinned official OpenAPI snapshot contains 171 operations. Another 28 tools provide authoring, middleware, login, documentation and supplemental webhook/partner APIs. Two resources and two prompts are advertised.
- Live public API reads returned 58 models, 11 palettes, 29 categories and server IPs. The installed Codex cache was exercised through a real MCP client, not just a source checkout.
- All four layouts across normal, empty, loading, error and long/stale data reached Framework readiness with no reported runtime errors in Browser. Overflow counters and title clamping changed with available space. Portrait reported 480 × 800; a TRMNL X preview used its model, size, density and palette classes.
- Codex installed the local marketplace plugin. Its bundled runtime SHA-256 matched the generated runtime when checked.
- The account holder granted OAuth consent. The installed Codex bundle authenticated, discovered three registered devices, created one clearly named private test plugin, uploaded all four layouts and read them back byte-for-byte. TRMNL normalized settings.yml and omitted the empty shared file as expected. The stored strategy and Framework 3.4.0 version matched the project.
- Sample data was pushed and read back. All four remote preview jobs completed and returned native MCP images. Their rendered results were visually inspected.
- A real middleware pipeline fetched TRMNL's public model catalog, projected four rows into 498 bytes, published to the private test plugin and confirmed the remote merge-variable sample. Additional OG 2 and TRMNL X remote previews completed and displayed that live data correctly. The test pipeline was disabled afterward; no recurring automation was installed.
- Account credentials stay in protected local storage. No token or credential was copied into distributable source or package files. Existing device playlists were not changed.

## Still needs live evidence

- A real recurring schedule for a user-selected data source, interval and target. The middleware runner and scheduling integration are implemented; no background schedule is installed by this build.
- Physical display output, every model/theme/palette combination, third-party BYOS differences and real partner provisioning. No live coupon or paid installation was created. Tests do not claim all 171 remote operations were executed against a live account.
- Linux/macOS execution. The distribution workflow contains a three-OS matrix, but no remote CI run has occurred.

Framework lint checks selected rules. It cannot guarantee visual quality or conformance for arbitrary user-authored code. The authoring skill requires current docs, all layouts, representative data states and visual inspection before claiming compatibility.

## Repeatable checks

```sh
npm test
npm run check
npm run bundle:plugin
node scripts/smoke.mjs --bundle
node scripts/smoke.mjs --installed /absolute/path/to/installed/plugin
```

`node scripts/preview-demo.mjs` serves the local verification gallery at `http://127.0.0.1:8790`. It uses synthetic sample data and official Framework assets. Stop it with Ctrl+C after inspection.
