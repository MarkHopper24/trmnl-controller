import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

export const identifier = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)) throw new Error('Use an identifier of 1-80 letters, numbers, underscores or hyphens.');
  return value;
};
export async function loadConfig(env = process.env) {
  const home = path.resolve(env.TRMNL_HOME || path.join(os.homedir(), '.trmnl-control'));
  const file = env.TRMNL_CONFIG || path.join(home, 'config.json');
  let supplied = {};
  try { supplied = JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw new Error('Cannot read TRMNL_CONFIG: ' + e.message); }
  const config = { home, profiles: { default: { baseUrl: 'https://trmnl.com', tokenEnv: 'TRMNL_API_KEY', deviceTokenEnv: 'TRMNL_DEVICE_API_KEY' } }, allowedSourceHosts: [], allowPrivateSources: false, readOnly: false, maxResponseBytes: 5 * 1024 * 1024, timeoutMs: 20000, ...supplied, env };
  config.home = home;
  config.readOnly = env.TRMNL_READ_ONLY === '1' || config.readOnly;
  if (!config.profiles?.default) throw new Error('Configuration needs a default profile.');
  for (const [name, p] of Object.entries(config.profiles)) {
    identifier(name);
    const url = new URL(p.baseUrl);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Profile baseUrl must be an origin without credentials, query or path.');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && p.allowInsecureHttp === true)) throw new Error('Use HTTPS, or explicitly enable allowInsecureHttp for a trusted BYOS origin.');
    p.baseUrl = url.origin;
  }
  if (!Number.isInteger(config.maxResponseBytes) || config.maxResponseBytes < 1024 || config.maxResponseBytes > 50 * 1024 * 1024) throw new Error('maxResponseBytes must be 1024..52428800');
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 120000) throw new Error('timeoutMs must be 100..120000');
  return config;
}

export async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  try { await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }); }
}

export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}

// Never reclaim locks by age: a slow or suspended process may still own one.
export async function withFileLock(file, action, waitMs = 0) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + waitMs;
  let handle;
  while (!handle) {
    try { handle = await fs.open(file, 'wx', 0o600); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (Date.now() >= deadline) throw new Error('Another process holds the lock. Retry after it finishes; inspect a crashed process before removing its lock.');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await action();
  } finally { await handle.close(); await fs.rm(file, { force: true }); }
}

export function redact(value, secrets = []) {
  if (typeof value === 'string') {
    let text = value;
    for (const secret of secrets.filter(s => typeof s === 'string' && s.length > 3)) text = text.split(secret).join('[REDACTED]');
    return text.replace(/([?&](?:api_key|token|access_token|key)=)[^&#\s]+/gi, '$1[REDACTED]').replace(/\b(?:trmnl_|user_)[a-zA-Z0-9_-]{16,}\b/g, '[REDACTED]');
  }
  if (Array.isArray(value)) return value.map(v => redact(v, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /^(api_key|access_token|refresh_token|client_secret|authorization|password|token|webhook_url|polling_headers|polling_body)$/i.test(k) ? '[REDACTED]' : redact(v, secrets)]));
  return value;
}
