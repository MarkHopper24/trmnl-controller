# Coverage and verification boundaries

The pinned official [OpenAPI specification](https://trmnl.com/api-docs/openapi.json) was retrieved on 2026-10-10. It contains 171 operations. Every operation becomes a schema-validated MCP tool with inherited path/query/header/body parameters, method, description and effect annotations. Run `trmnl-control catalog` for the complete inventory. It is a snapshot, not a promise that upstream never changes.

| Area | Supported surface |
| --- | --- |
| Devices | Discovery, settings, claim/unlink, identify, mirror/resync, playlist copy, diagnostics/logs/timelines/forecast, firmware retry |
| Models | Live device profiles, palettes, server IPs, flashable firmware metadata; registered OG/X/BYOD devices use the service's model support |
| Device protocol | Setup, current screen, next screen, device log (separate device key); next-screen and setup are effectful |
| Playlists | List/add/reorder/update/delete/duplicate/hide, bulk visibility, schedules, coverage, previews, mashups |
| Plugin development | Local four-layout projects, Framework lint, sample states, local HTML preview, ZIP export, compare/deploy, raw files/markup/transform endpoints |
| Plugin lifecycle | Catalog/schema discovery, create/prepare/configure/complete/cancel installation, credentials/provider connections, clone, remove, refresh/preview jobs and health/logs |
| Data | Native data, merge variables, webhook data/image uploads, polling/Plugin Merge/async settings via official schemas, source projection and middleware |
| Publishing | Recipes/search/install/markup; author analytics/errors/feedback, third-party plugin definitions, featured-image endpoints; no unrequested public publication |
| Themes and apps | User themes/imports, app catalog/install, fleet control, room calendars/collections/bookings/provider integration |
| Harness integration | Stdio, authenticated Streamable HTTP, resources/prompts, Codex skills, scheduler plan and deterministic CLI worker |

## Deliberate limits

- APIs/scopes, Developer edition, TRMNL+, app entitlements and server rate limits remain authoritative. A tool cannot bypass them.
- A compatible BYOS profile works for endpoints that server implements. This project is not a replacement firmware/server implementation, USB flasher or universal adapter for unrelated DIY APIs.
- Partner provisioning and UUID webhooks are additional documented tools outside the account OpenAPI snapshot. Partner coupon redemption can incur agreement-based billing; partner-issued credentials and explicit provisioning intent are required. They have mock contract tests; no real partner coupon is generated during validation.
- Existing TRMNL cloud callbacks, OAuth provider connections and async-polling services can be configured through API/UI workflows. This release does not host a public OAuth provider callback/third-party marketplace backend for you.
- Deterministic middleware handles JSON over GET/POST and declarative projection. Arbitrary XML/HTML extraction or custom executable transforms belong in a reviewed external service or the harness, not unrestricted code inside this server.
- No hardware, OAuth consent, or account mutation is claimed verified without an actual recorded live check. Source tests and protocol handshakes do not establish physical display output or all-model visual compatibility.

## Sources

- [TRMNL API overview](https://docs.trmnl.com/go) and [OpenAPI reference](https://trmnl.com/api-docs)
- [Authentication](https://trmnl.com/auth.md), [Account API](https://docs.trmnl.com/go/private-api/account)
- [Framework 3.4](https://trmnl.com/framework/docs/3.4), [Structure](https://trmnl.com/framework/docs/3.4/structure), [Runtime](https://trmnl.com/framework/docs/3.4/framework_runtime)
- [Private Plugins](https://help.trmnl.com/en/articles/9510536-private-plugins), [Webhooks](https://docs.trmnl.com/go/private-plugins/webhooks), [Plugin Data](https://docs.trmnl.com/go/private-api/plugin-data)
- [BYOS](https://docs.trmnl.com/go/diy/byos), [Partners](https://docs.trmnl.com/go/partners-api/introduction), [Marketplace](https://docs.trmnl.com/go/plugin-marketplace/introduction)
- [Official trmnlp archive client](https://github.com/usetrmnl/trmnlp/blob/main/lib/trmnlp/api_client.rb)
- [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins)
