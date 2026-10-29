---
name: setup
description: Connect and verify TRMNL Controller in Codex or another local MCP harness, including OAuth, profiles and device discovery.
---

Call `trmnl_status` to inspect profile names and local credential presence. If tools are absent, check that the plugin is enabled and Node.js 22.19+ is on PATH; reload the plugin or start a new chat after installation. Do not install a second standalone server when this plugin already provides it.

Use `trmnl_auth_start` for a new account connection. Ask only for the scopes needed by the user's workflow (read/content/devices by default); delete/profile/apps require their own need. Give the consent URL to the user to review. Do not approve their OAuth consent. Keep the server alive; use `trmnl_auth_status` to verify completion. An API key supplied securely through the launching environment is also supported. Never request a secret in chat or embed one in project files.

Once authenticated, call `trmnl_list_devices` and `trmnl_list_models`. Report the returned device names/model capabilities and any scope/edition limitation. A present credential or a successful installation alone is not proof of access. Avoid next-screen/setup/identify or other mutations as a health check.

For multiple accounts/devices/BYOS, read the packaged [setup guide](../../docs/setup.md). In the installed package the same guide is also available through `trmnl_docs_read` with topic `setup`. Use configured profile origins and separate device/account keys. Honor existing authorization without adding blanket approval requests.
