import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicJson, identifier, readJson, redact } from './config.mjs';
import { fetchSource } from './network.mjs';

const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
function validateRule(key, rule) {
  if (forbidden.has(key)) throw new Error('Unsafe output key');
  if (!rule || typeof rule !== 'object' || Array.isArray(rule) || Object.keys(rule).some(k => !['value','path','default','map','limit'].includes(k))) throw new Error('Invalid projection rule for ' + key);
  if (Object.hasOwn(rule, 'value') === Object.hasOwn(rule, 'path') || (Object.hasOwn(rule, 'path') && typeof rule.path !== 'string')) throw new Error('A projection rule requires exactly one of value or path');
  if (rule.limit !== undefined && (!Number.isInteger(rule.limit) || rule.limit < 0 || rule.limit > 1000)) throw new Error('Projection limit must be 0..1000');
}
export function validateProjection(fields, depth = 0) {
  if (depth > 8) throw new Error('Projection is nested too deeply');
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('Projection fields must be an object');
  for (const [key, rule] of Object.entries(fields)) {
    validateRule(key, rule);
    if (Object.hasOwn(rule, 'path')) pointer({}, rule.path);
    if (Object.hasOwn(rule, 'map')) validateProjection(rule.map, depth + 1);
  }
}
export function pointer(value, location = '') {
  if (location === '') return value;
  if (!location.startsWith('/')) throw new Error('Use a JSON pointer beginning with /');
  return location.slice(1).split('/').reduce((node, part) => {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (forbidden.has(key)) throw new Error('Unsafe property');
    return node != null && Object.hasOwn(Object(node), key) ? node[key] : undefined;
  }, value);
}
export function projectData(data, fields, depth = 0) {
  if (depth > 8) throw new Error('Projection is nested too deeply');
  if(!fields || typeof fields!=='object' || Array.isArray(fields))throw new Error('Projection fields must be an object');
  const result = {};
  for (const [key, rule] of Object.entries(fields)) {
    validateRule(key, rule);
    let value = Object.hasOwn(rule, 'value') ? rule.value : pointer(data, rule.path);
    if (value === undefined || value === null) value = rule.default ?? null;
    if (rule.map) {
      if (!Array.isArray(value)) throw new Error('Mapped field must select an array: ' + key);
      value = value.slice(0, rule.limit ?? 100).map(item => projectData(item, rule.map, depth + 1));
    }
    result[key] = value;
  }
  return result;
}

export class Pipelines {
  constructor(config, client, sourceFetcher = fetchSource) { this.config = config; this.client = client; this.sourceFetcher = sourceFetcher; }
  file(id) { return path.join(this.config.home, 'pipelines', identifier(id) + '.json'); }
  stateFile(id) { return path.join(this.config.home, 'pipeline-state', identifier(id) + '.json'); }
  async list() {
    let files; try { files = await fs.readdir(path.join(this.config.home, 'pipelines')); } catch(e) { if (e.code === 'ENOENT') return []; throw e; }
    return Promise.all(files.filter(f => f.endsWith('.json')).map(async f => { const p = await this.get(f.slice(0, -5)); return { id: p.id, enabled: p.enabled, intervalMinutes: p.intervalMinutes, target: p.target, state: await readJson(this.stateFile(p.id), {}) }; }));
  }
  async get(id) { return readJson(this.file(id)); }
  async save(id, definition) {
    if (this.config.readOnly) throw new Error('Read-only mode blocks saving executable pipelines.');
    if (!this.config.profiles[definition.target.profile || 'default']) throw new Error('Unknown target profile');
    if (!Number.isInteger(definition.intervalMinutes) || definition.intervalMinutes < 5 || definition.intervalMinutes > 10080) throw new Error('Interval must be 5..10080 minutes.');
    for (const source of definition.sources) {
      identifier(source.name);
      const url = new URL(source.url);
      if (!this.config.allowedSourceHosts.includes(url.hostname)) throw new Error('Add source hostname to allowedSourceHosts first: ' + url.hostname);
      if (url.username || url.password || /[?&](?:api_key|access_token|token|key)=/i.test(url.search)) throw new Error('Use headerEnv for source credentials.');
    }
    if (new Set(definition.sources.map(s => s.name)).size !== definition.sources.length) throw new Error('Source names must be unique.');
    // Validate projection grammar even when no upstream data is available.
    validateProjection(definition.fields);
    const p = { ...definition, id, enabled: definition.enabled ?? false, revision: crypto.randomUUID() };
    await atomicJson(this.file(id), p);
    return { id, enabled: p.enabled, note: 'Saving does not start a scheduler. Use a harness automation or run the worker explicitly.' };
  }
  async enable(id, enabled) { const p = await this.get(id); return this.save(id, { ...p, enabled }); }
  async run(id, { dryRun = true, force = false } = {}) {
    if (!dryRun && this.config.readOnly) throw new Error('Read-only mode blocks pipeline publishing.');
    const lock = this.stateFile(id) + '.lock';
    await fs.mkdir(path.dirname(lock), { recursive: true, mode: 0o700 });
    let handle;
    try { handle = await fs.open(lock, 'wx', 0o600); } catch(e) { if(e.code === 'EEXIST') return { skipped: true, reason: 'Another run holds the lock. If a process crashed, inspect the lock file and remove it after verifying it is no longer running.' }; throw e; }
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    try {
      const p = await this.get(id); const state = await readJson(this.stateFile(id), {});
      if (!dryRun && !p.enabled) return { skipped: true, reason: 'Pipeline disabled' };
      // force bypasses unchanged-data suppression, never rate spacing.
      if (!dryRun && state.nextAttemptAt > Date.now()) return { skipped: true, reason: 'Waiting for next allowed attempt', nextAttemptAt: state.nextAttemptAt };
      if (!dryRun) await atomicJson(this.stateFile(id), { ...state, lastAttemptAt: Date.now(), nextAttemptAt: Date.now() + p.intervalMinutes * 60000 });
      const data = {};
      for (const source of p.sources) data[source.name] = await this.sourceFetcher(this.config, source);
      const merged = projectData(data, p.fields);
      const serialized = JSON.stringify(merged);
      const bytes = Buffer.byteLength(serialized);
      if (bytes > (p.maxPayloadBytes ?? 5000)) throw new Error(`Projected data is ${bytes} bytes, exceeding the configured webhook payload limit.`);
      const digest = createHash('sha256').update(serialized).digest('hex');
      if (dryRun) return { dryRun: true, mergeVariables: redact(merged, this.client.secrets()), bytes, changed: digest !== state.digest || state.revision !== p.revision };
      if (!force && state.digest === digest && state.revision === p.revision) { await atomicJson(this.stateFile(id), { ...state, lastAttemptAt: Date.now(), nextAttemptAt: Date.now() + p.intervalMinutes * 60000, lastOutcome: 'unchanged' }); return { skipped: true, reason: 'Data unchanged' }; }
      const result = await this.client.execute('updatePluginSettingData', { profile: p.target.profile || 'default', path: { id: String(p.target.pluginSettingId) }, body: { merge_variables: merged } });
      await atomicJson(this.stateFile(id), { digest, revision:p.revision, lastAttemptAt: Date.now(), lastSuccessAt: Date.now(), nextAttemptAt: Date.now() + p.intervalMinutes * 60000, lastOutcome: 'published', consecutiveFailures: 0 });
      return { published: true, bytes, status: result.status };
    } catch(e) {
      if (!dryRun) { const state = await readJson(this.stateFile(id), {}); const failures = (state.consecutiveFailures || 0) + 1; await atomicJson(this.stateFile(id), { ...state, lastOutcome: 'failed', consecutiveFailures: failures, nextAttemptAt: Math.max(state.nextAttemptAt || 0, Date.now() + Math.min(3600, 300 * 2 ** Math.min(failures - 1, 4)) * 1000), lastError: 'Run failed; inspect an explicit manual dry run. Upstream payloads and credentials are not logged.' }); }
      throw e;
    } finally { await handle.close(); await fs.rm(lock, { force: true }); }
  }
  async tick() {
    const outcomes = [];
    for (const p of await this.list()) if (p.enabled) { try { outcomes.push({ id: p.id, ...await this.run(p.id, { dryRun: false }) }); } catch { outcomes.push({ id: p.id, failed: true }); } }
    return outcomes;
  }
}

export function schedulePlan(pipeline, harness = 'generic', timeZone = 'UTC') {
  new Intl.DateTimeFormat('en', { timeZone }).format();
  return { harness, pipelineId: pipeline.id, timeZone, intervalMinutes: pipeline.intervalMinutes,
    prompt: `Run TRMNL pipeline ${pipeline.id} using trmnl_pipeline_run with dryRun=false. Its saved configuration contains the data sources, projection and target. Report only a meaningful failure or required user action; remain quiet for unchanged or successful routine updates. Do not change the pipeline or its destination.`,
    command: ['trmnl-control', 'pipeline', 'run', pipeline.id, '--publish'],
    alternatives: ['Use the current harness scheduling tool if available and if the user requests recurrence.', 'Use an OS scheduler to invoke the command.', 'Run trmnl-control worker in a supervised process for interval scheduling.'],
    limitation: 'MCP does not standardize host scheduling discovery. This is a plan, not a created schedule. The host must create and confirm the automation, and have this MCP/credentials available on scheduled runs. Avoid installing multiple schedulers for the same pipeline.' };
}
