---
name: devices
description: Inspect or manage TRMNL devices, playlists, schedules, mashups, themes, plugin installations and diagnostics through the documented API.
---

Discover the operation with `trmnl_catalog_search`, inspect its schema when needed, and read the current target state before changing it. Resolve device names to IDs using listDevices; do not guess IDs or model dimensions. Prefer getCurrentScreen for passive device inspection: getDisplay advances playlist state and setupDevice can provision a device.

Choose the correct configured profile and credential family. Account/OAuth scopes and resource limits govern account tools; device credentials govern display/log protocol calls. A 403 needs the indicated capability/resource or entitlement, not repeated retries. Preserve upstream 429 retry guidance; don't repeat uncertain mutating calls blindly.

Support the requested lifecycle with the API: configuration evaluation before changes, preview/refresh job status, playlist coverage and forecasts, plugin/device logs and timelines. Distinguish an accepted change, a completed render and a physical screen update. Preserve other devices, playlist entries and schedules outside the user's request.

Deletion/unlinking, provider disconnection, firmware changes, app installation and room bookings have different consequences. Use the user's actual authorization and normal harness approval rules. Don't silently buy upgrades or publish content. If a workflow lacks an API, explain the exact gap and use the browser only within the requested scope.

All new/edited plugin markup must follow the create-plugin workflow and Framework guide. Never infer all-device compatibility from one model or local preview.
