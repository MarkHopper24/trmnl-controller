import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { atomicJson, identifier, readJson, withFileLock } from './config.mjs';

function protect(text, decrypt = false) {
  const prefix = "$ErrorActionPreference='Stop'; [void][Reflection.Assembly]::Load('System.Security, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'); ";
  const action = prefix + (decrypt
    ? "$b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))"
    : "$b=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); [Console]::Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))");
  try { return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', action], { input: text, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { throw new Error('Windows credential protection failed. No plaintext fallback was written. Use an environment variable or repair Windows DPAPI support.'); }
}
export class Credentials {
  constructor(config) { this.config = config; this.refreshes = new Map(); }
  file(profile) { return path.join(this.config.home, 'credentials', identifier(profile) + '.json'); }
  async read(profile) {
    const stored = await readJson(this.file(profile), null);
    if (!stored) return null;
    return stored.protection === 'windows-dpapi' ? JSON.parse(protect(stored.payload, true)) : stored.payload;
  }
  async save(profile, credential) {
    const encrypted = process.platform === 'win32';
    await atomicJson(this.file(profile), { protection: encrypted ? 'windows-dpapi' : 'owner-file', payload: encrypted ? protect(JSON.stringify(credential)) : credential });
  }
  async remove(profile) { await fs.rm(this.file(profile), { force: true }); }
  async token(profile, fetcher = fetch) {
    const p = this.config.profiles[profile];
    if (!p) throw new Error('Unknown profile');
    const envKey = this.config.env[p.tokenEnv || 'TRMNL_API_KEY'];
    if (envKey) return envKey;
    const c = await this.read(profile);
    if (!c) return undefined;
    if (c.origin !== p.baseUrl) throw new Error('Stored credential belongs to a different origin. Sign in to this profile again.');
    if (!c.expires_at || c.expires_at > Date.now() + 60000) return c.access_token;
    if (!c.refresh_token) throw new Error('Credential expired. Sign in again.');
    if (!this.refreshes.has(profile)) this.refreshes.set(profile, this.refresh(profile, c, fetcher).finally(() => this.refreshes.delete(profile)));
    return this.refreshes.get(profile);
  }
  async refresh(profile, c, fetcher) {
    return withFileLock(this.file(profile) + '.lock', async () => {
    // Another harness/worker may have rotated this token while we waited.
    c = await this.read(profile);
    if (!c || c.origin !== this.config.profiles[profile].baseUrl) throw new Error('Credential changed. Sign in again.');
    if (c.expires_at > Date.now() + 60000) return c.access_token;
    const endpoint = new URL(c.token_endpoint);
    if (endpoint.origin !== c.origin) throw new Error('OAuth token endpoint origin mismatch');
    const response = await fetcher(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.config.timeoutMs), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.client_id }) });
    if (!response.ok) throw new Error('OAuth refresh failed. Sign in again.');
    const data = await response.json();
    if (!data.access_token) throw new Error('OAuth refresh returned no token');
    await this.save(profile, { ...c, ...data, expires_at: Date.now() + (data.expires_in || 7200) * 1000 });
    return data.access_token;
    }, this.config.timeoutMs + 5000);
  }
}
