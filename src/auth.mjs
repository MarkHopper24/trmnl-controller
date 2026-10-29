import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { Credentials } from './credentials.mjs';

export const allowedScopes = ['read', 'content', 'devices', 'delete', 'profile', 'apps'];
export class LoginManager {
  constructor(config) { this.config = config; this.credentials = new Credentials(config); this.attempts = new Map(); }
  async start(profile = 'default', scopes = ['read', 'content', 'devices']) {
    const p = this.config.profiles[profile];
    if (!p) throw new Error('Unknown profile');
    if (!scopes.length || scopes.some(s => !allowedScopes.includes(s))) throw new Error('Unsupported OAuth scope');
    if (this.attempts.size >= 5) throw new Error('Cancel an existing login before starting another.');
    const origin = p.baseUrl;
    if (!origin.startsWith('https://')) throw new Error('OAuth requires HTTPS');
    const metadataResponse = await fetch(origin + '/.well-known/oauth-authorization-server', { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!metadataResponse.ok) throw new Error('OAuth discovery unavailable for this profile');
    const meta = await metadataResponse.json();
    for (const field of ['issuer', 'authorization_endpoint', 'token_endpoint', 'registration_endpoint']) if (new URL(meta[field]).origin !== origin) throw new Error('OAuth endpoint does not match configured origin');
    const id = randomBytes(16).toString('hex'); const state = randomBytes(32).toString('base64url'); const verifier = randomBytes(48).toString('base64url');
    const attempt = { id, profile, status: 'pending', scopes, expiresAt: Date.now() + 5 * 60000 };
    const server = http.createServer(async (req, res) => {
      const incoming = new URL(req.url, 'http://127.0.0.1');
      if (incoming.pathname !== '/callback' || req.method !== 'GET') { res.writeHead(404).end(); return; }
      const suppliedState = incoming.searchParams.get('state') || '';
      if (Buffer.byteLength(suppliedState) !== Buffer.byteLength(state) || !timingSafeEqual(Buffer.from(suppliedState), Buffer.from(state))) { res.writeHead(400).end('Invalid state'); return; }
      if (attempt.status !== 'pending') { res.writeHead(409).end('Login already handled'); return; }
      attempt.status = 'exchanging';
      try {
        if (incoming.searchParams.has('error')) throw new Error('Consent declined');
        if (incoming.searchParams.has('iss') && incoming.searchParams.get('iss') !== meta.issuer) throw new Error('Issuer mismatch');
        const code = incoming.searchParams.get('code');
        if (!code) throw new Error('No code');
        const tokenResponse = await fetch(meta.token_endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: attempt.clientId, code, redirect_uri: attempt.redirectUri, code_verifier: verifier }) });
        if (!tokenResponse.ok) throw new Error('Token exchange failed');
        const data = await tokenResponse.json();
        if (!data.access_token || data.token_type?.toLowerCase() !== 'bearer') throw new Error('Invalid token response');
        await this.credentials.save(profile, { ...data, origin, client_id: attempt.clientId, token_endpoint: meta.token_endpoint, expires_at: Date.now() + (data.expires_in || 7200) * 1000 });
        attempt.status = 'connected';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'no-store' }).end('<h1>TRMNL connected</h1><p>You can return to your assistant. Your credential is stored locally and was not printed.</p>');
      } catch { attempt.status = 'failed'; res.writeHead(400).end('TRMNL sign-in did not complete. Start a new login.'); }
      finally { clearTimeout(attempt.timer); server.close(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    attempt.server = server;
    attempt.redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
    try {
      const registration = await fetch(meta.registration_endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'TRMNL Controller', redirect_uris: [attempt.redirectUri], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }) });
      if (!registration.ok) throw new Error('OAuth client registration unavailable. Configure an API key using tokenEnv instead.');
      attempt.clientId = (await registration.json()).client_id;
      if (!attempt.clientId) throw new Error('Registration returned no client ID');
    } catch(e) { server.close(); throw e; }
    const url = new URL(meta.authorization_endpoint);
    for (const [k,v] of Object.entries({ client_id: attempt.clientId, response_type: 'code', redirect_uri: attempt.redirectUri, scope: scopes.join(' '), state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', resource: origin + '/mcp' })) url.searchParams.set(k,v);
    attempt.timer = setTimeout(() => { if (attempt.status === 'pending') attempt.status = 'expired'; server.close(); }, 5 * 60000);
    attempt.timer.unref();
    this.attempts.set(id, attempt);
    return { id, authorizationUrl: url.href, expiresAt: attempt.expiresAt, scopes, instruction: 'Open this URL and let the account holder review and grant access. Do not approve consent for them. Keep this server running until login completes.' };
  }
  status(id) { const a = this.attempts.get(id); if (!a) throw new Error('Unknown login attempt'); return { id, profile: a.profile, status: a.status, scopes: a.scopes, expiresAt: a.expiresAt }; }
  cancel(id) { const a = this.attempts.get(id); if (!a) throw new Error('Unknown login attempt'); clearTimeout(a.timer); a.server.close(); this.attempts.delete(id); return { cancelled: true }; }
  close() { for (const id of this.attempts.keys()) this.cancel(id); }
}
