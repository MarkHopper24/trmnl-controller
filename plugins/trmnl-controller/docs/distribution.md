# Build, install and distribute

The public source and ready-to-install marketplace live at [MarkHopper24/trmnl-controller](https://github.com/MarkHopper24/trmnl-controller). The display name is **TRMNL Controller**; the plugin and marketplace identifiers are both `trmnl-controller`.

## Package layout

```text
.agents/plugins/marketplace.json    # repository catalog
plugin/                            # editable manifest, skills and assets
plugins/trmnl-controller/           # generated, installable package
  plugin.json                      # portable manifest
  mcp.json                         # portable local MCP configuration
  .codex-plugin/plugin.json         # Codex compatibility manifest
  .mcp.json                        # compatibility MCP configuration
  runtime/trmnl-control.mjs         # bundled runtime and dependencies
  skills/                          # setup, authoring, devices, scheduling
  assets/                          # logo and supplied screenshots
  docs/
  specs/
  THIRD_PARTY_NOTICES.txt
```

The root catalog points to `./plugins/trmnl-controller`, relative to the repository root. Asset paths are relative to the installed plugin. The local MCP launches Node in the plugin directory. The machine needs Node.js >=22.19.0; it does not need dependencies installed inside Codex's cache.

Both manifests carry the same display metadata. The portable manifest's `extensions.com.openai` is authoritative in current Codex; the compatibility overlay supports older clients. No credentials or author-machine paths belong in either configuration.

## Build and verification

```sh
npm ci --ignore-scripts
npm run bundle:plugin
npm test
npm run check
node scripts/smoke.mjs --bundle
```

Bundling updates `plugins/trmnl-controller` and the catalog, creates a matching marketplace under `dist/marketplace`, and writes `dist/trmnl-controller-codex-VERSION.zip` with a SHA-256 sidecar. The ZIP's root is the plugin root. Dependency notices are collected from the actual bundled dependencies. Commit the regenerated plugin with its source and version bump.

The distribution test launches the ready-made runtime from an unrelated working directory using an empty state home, enumerates tools, and checks version/credential absence. Use `codex plugin marketplace add ./dist/marketplace` and `codex plugin add trmnl-controller@trmnl-controller` to verify with a real Codex installer. Read-only account checks are a separate step.

The [README](../README.md) covers desktop and CLI installation, sign-in, upgrades and migration. The npm package name `trmnl-controller-mcp` is a local package identity; no npm publication is implied.

## Publication boundaries

This repository distributes a local plugin through a GitHub marketplace. It is not an OpenAI directory approval or an official TRMNL listing. OpenAI documents repo marketplaces and portable/compatibility manifests in [Package your plugin](https://developers.openai.com/plugins/build/plugins). Directory submission is a separate review process; [local MCP submission currently requires partner eligibility](https://developers.openai.com/plugins/deploy/desktop-only).

The CI workflow runs behavior/protocol/distribution checks, bundling and npm package installation on Windows, Linux and macOS. Read a specific run's result before claiming those platforms passed. No workflow needs a TRMNL credential. Public API smoke tests are optional local network checks.

Never publish `.local`, account state, automation prompts, exported account plugins or unrelated captures. The Git ignore rules exclude those locations; stage an explicit publication allowlist and scan staged files before pushing. A successful scan cannot establish that arbitrary user-authored files are free of private content, so inspect additions too.
