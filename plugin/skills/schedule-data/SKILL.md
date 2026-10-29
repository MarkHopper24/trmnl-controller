---
name: schedule-data
description: Feed TRMNL plugins from APIs or connected harness tools, using reusable data pipelines and the current harness scheduler when available.
---

Read `trmnl_docs_read` topic `middleware`. Prefer native TRMNL polling or Plugin Merge for straightforward data; use webhook middleware when transformation, multiple/private sources or harness connectors are needed.

For a JSON pipeline, configure exact source host allowlists outside the tool call, use TRMNL_SOURCE_* secret references, and project only data needed by the plugin. Create a disabled pipeline, test its projection, inspect a dry run and payload size, then publish once when authorized. Explicit POST sources can have side effects even in a dry run. Preserve source timestamps and design visible stale/error states using Framework components.

When the user requests recurrence, discover the actual scheduling capability of this harness. MCP has no standard scheduler API. `trmnl_schedule_plan` supplies a prompt/command; it does not create an automation.

In Codex, use the available `automation_update` tool. Inspect matching existing automation metadata first and update it rather than creating duplicates. Default to a heartbeat attached to the current chat unless the user requests a standalone job. Preserve the exact target pipeline/plugin, source scope, interval and timezone in the prompt. Instruct routine runs to remain quiet on unchanged/non-actionable state and notify only meaningful failure or required action, unless the user wants reports. Verify the saved schedule and report its real ID. Do not fabricate a successful schedule or write raw automation directives.

For other harnesses, use their available scheduler. If there is none, provide a concrete CLI/OS schedule setup or the deterministic `trmnl-control worker` path. Create an OS task only when authorized for that host. A local sleeping/offline host cannot publish. Avoid multiple schedulers for one pipeline.

If data comes from connected tools rather than HTTP, the host automation may call those tools, build minimal merge variables and use `trmnl_update_plugin_setting_data`. Keep sensitive source scope and destination explicit. Do not copy credentials into the saved prompt. Confirm one actual update and distinguish TRMNL receipt from device wake/display proof.
