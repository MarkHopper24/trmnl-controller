# Data and scheduling

Choose the simplest supported data path:

- Native TRMNL polling for directly accessible APIs; use password custom fields and Liquid references for secrets.
- Plugin Merge for connected native plugin data. Keep source plugins on a playlist; a hidden source can refresh while a Plugin Merge plugin reads it.
- Static for infrequently edited content, None for self-contained markup, Async Polling for an existing callback-capable service.
- Webhook for harness tools, transformed data, multiple APIs or private/local API middleware.

TRMNL's native serverless transforms and OAuth plugin settings can also reduce middleware needs. Discover configuration schemas through the API rather than inventing them. See [Private Plugins](https://help.trmnl.com/en/articles/9510536-private-plugins) and [Webhook semantics](https://docs.trmnl.com/go/private-plugins/webhooks).

## Reusable JSON pipeline

Add the exact source hostname to `allowedSourceHosts` in local config. Restart the MCP server. Define source credentials in environment variables such as `TRMNL_SOURCE_WEATHER_TOKEN`; `headerEnv` maps an HTTP header to the variable name. No secret values are saved in the pipeline.

Example `trmnl_pipeline_save` arguments (use a real private-plugin ID you own):

```json
{
  "id": "weather",
  "definition": {
    "sources": [{"name":"weather","url":"https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m"}],
    "fields": {
      "status": {"value":"ok"},
      "temperature": {"path":"/weather/current/temperature_2m"},
      "updated_at": {"path":"/weather/current/time"}
    },
    "target": {"profile":"default","pluginSettingId":123},
    "intervalMinutes":30,
    "enabled":false
  }
}
```

Fields use JSON pointers over source-name roots. A rule has `path` and optional `default`, or constant `value`. A selected array can use `map` with nested field rules and `limit`. For example `{"items":{"path":"/api/results","limit":20,"map":{"title":{"path":"/name"},"value":{"path":"/count","default":0}}}}` creates items for the starter layout. No eval, arbitrary script, shell execution or unrestricted environment access is available.

Run `trmnl_pipeline_run` with its default `dryRun:true`, inspect the projected payload, then enable and publish once when authorized. A dry run still contacts the upstream API; an explicitly configured POST can have upstream effects. Data isn't published on source failure, and the previous TRMNL values remain. Include an upstream timestamp and render a stale-data indicator based on data age.

## Scheduling choices

`trmnl_schedule_plan` returns a scheduling prompt, interval/timezone and CLI command. It **does not create a schedule**. MCP does not standardize host scheduler discovery.

In Codex, the packaged scheduling skill discovers `automation_update`, inspects existing automations to avoid duplicates, then creates or updates a heartbeat when the user requests recurrence. It uses the actual returned automation ID as proof. Other harnesses use their available native scheduler, or an OS scheduler invoking `trmnl-control pipeline run ID --publish`.

For deterministic polling without model calls, run `trmnl-control worker` in a supervised process. It checks enabled jobs every 30 seconds, obeys each interval, suppresses identical successful payloads, applies failure backoff and uses cross-process lock files. It does not install itself as a service. Sleeping/offline machines cannot publish. Do not run redundant schedulers.

For data supplied by other connected tools (calendar, email, databases), schedule a harness prompt to read those authorized sources, build minimal merge variables, and call `trmnl_update_plugin_setting_data`. Keep source data scope and the exact target in the saved prompt. Use deterministic pipelines when possible to avoid repeated model cost.

## Limits and failures

Webhook merge-variable quota is 5 kB normally or 10 kB on TRMNL+; configure 10,000 bytes only when eligible. TRMNL documents 12 webhook requests/hour normally and 30 on Plus, and account API limits of 120/minute or 300/minute. Server eligibility and 429 responses remain authoritative. The local worker minimum interval is five minutes; it never blindly retries mutations.

State tracks attempt/success times, data hash and failure counts, not payload history. If a process is killed with a lock held, inspect its recorded PID and remove that specific lock only after confirming no run is alive. Publishing and marking success cannot be transactionally atomic across the network; a crash after the server accepts a write may repeat an identical replace-style update next run.

A webhook accepted by TRMNL does not prove a physical display has refreshed. Plugin refresh timing and device wake timing are separate. Refresh jobs and device timelines provide additional evidence.
