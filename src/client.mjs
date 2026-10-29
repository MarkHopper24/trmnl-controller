import fs from 'node:fs/promises';
import path from 'node:path';
import { byId, validateOperation } from './catalog.mjs';
import { Credentials } from './credentials.mjs';
import { redact } from './config.mjs';
import { readLimited } from './network.mjs';

export class ApiError extends Error {
  constructor(status, data, retryAfter) { super(`TRMNL HTTP ${status}: ${JSON.stringify(data).slice(0, 1500)}`); this.status = status; this.retryAfter = retryAfter; }
}
export class TrmnlClient {
  constructor(config, fetcher = fetch) { this.config = config; this.fetch = fetcher; this.credentials = new Credentials(config); }
  secrets() { return Object.entries(this.config.env).filter(([k]) => /^(TRMNL_)/.test(k) && /KEY|TOKEN|SECRET|SOURCE_|WEBHOOK_|PARTNER_/.test(k)).map(([, v]) => v); }
  async supplemental(route,{profile='default',method='GET',headers={},body,readOnly=method==='GET'}={}){
    if(this.config.readOnly&&!readOnly)throw new Error('TRMNL_READ_ONLY blocks this operation.');
    const p=this.config.profiles[profile];if(!p)throw new Error('Unknown profile');
    if(!/^\/api\/(partners|custom_plugins\/[A-Za-z0-9_-]+)$/.test(route))throw new Error('Unsupported supplemental route');
    const response=await this.fetch(new URL(route,p.baseUrl),{method,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(this.config.timeoutMs)});
    const bytes=await readLimited(response,this.config.maxResponseBytes);let data;try{data=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('TRMNL returned invalid JSON');}
    const safe=redact(data,this.secrets());if(!response.ok||typeof data.status==='number'&&data.status>=400)throw new ApiError(!response.ok?response.status:data.status,safe,response.headers.get('retry-after'));
    return {status:response.status,data:safe};
  }
  async webhook({profile='default',uuidEnv,mergeVariables,mergeStrategy,streamLimit,maxPayloadBytes=5000}){
    if(!/^TRMNL_WEBHOOK_[A-Z0-9_]+$/.test(uuidEnv))throw new Error('Webhook UUID must reference a TRMNL_WEBHOOK_* environment variable.');
    const uuid=this.config.env[uuidEnv];if(!uuid||! /^[A-Za-z0-9_-]+$/.test(uuid))throw new Error('Configured webhook UUID is missing or invalid.');
    if(mergeVariables===undefined)return this.supplemental('/api/custom_plugins/'+uuid,{profile});
    if(Buffer.byteLength(JSON.stringify(mergeVariables))>maxPayloadBytes)throw new Error('Webhook merge variables exceed configured byte quota.');
    return this.supplemental('/api/custom_plugins/'+uuid,{profile,method:'POST',body:{merge_variables:mergeVariables,...(mergeStrategy?{merge_strategy:mergeStrategy}:{}),...(streamLimit?{stream_limit:streamLimit}:{})}});
  }
  async provisionPartner({profile='default',data,expiresAt}){
    const p=this.config.profiles[profile];if(!p)throw new Error('Unknown profile');
    const clientId=this.config.env[p.partnerClientIdEnv||'TRMNL_PARTNER_CLIENT_ID'];const token=this.config.env[p.partnerTokenEnv||'TRMNL_PARTNER_ACCESS_TOKEN'];
    if(!clientId||!token)throw new Error('Partner credentials must be issued by TRMNL and configured in the profile environment.');
    return this.supplemental('/api/partners',{profile,method:'POST',headers:{'Client-Id':clientId,'Access-Token':token},body:{partner:{action:'provision_discount',data,...(expiresAt?{meta:{expires_at:expiresAt}}:{})}}});
  }
  async execute(id, args = {}) {
    const op = byId.get(id);
    if (!op) throw new Error('Unknown TRMNL operation');
    validateOperation(op, args);
    if (this.config.readOnly && !op.annotations.readOnlyHint) throw new Error('TRMNL_READ_ONLY blocks this operation.');
    const profile = args.profile || 'default';
    const p = this.config.profiles[profile];
    if (!p) throw new Error('Unknown profile');
    const route = op.route.replace(/\{([^}]+)\}/g, (_, key) => {
      const val = String(args.path?.[key] ?? '');
      if (!val || ['.', '..'].includes(val) || /[\\/\x00-\x1f]/.test(val)) throw new Error('Invalid path parameter ' + key);
      return encodeURIComponent(val);
    });
    const url = new URL(route, p.baseUrl);
    for (const [key, value] of Object.entries(args.query || {})) {
      if (value === undefined) continue;
      const param = op.params.find(p => p.in === 'query' && p.name === key);
      if (Array.isArray(value)) {
        if (param?.explode === false) url.searchParams.set(key, value.join(','));
        else for (const v of value) url.searchParams.append(key, String(v));
      } else if (value && typeof value === 'object') { for (const [k, v] of Object.entries(value)) url.searchParams.append(`${key}[${k}]`, String(v)); }
      else url.searchParams.set(key, String(value));
    }
    const headers = { Accept: 'application/json', 'User-Agent': 'trmnl-control-mcp/0.2.1', ...Object.fromEntries(Object.entries(args.headers || {}).map(([k,v]) => [k, String(v)])) };
    let token;
    if (op.accountAuth) {
      token = await this.credentials.token(profile, this.fetch);
      if (!token && id !== 'downloadPluginSettingArchive') throw new Error('Account authentication is missing. Run trmnl-control login or set the configured tokenEnv.');
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (op.params.some(p => p.name === 'Access-Token')) {
      const deviceKey = this.config.env[p.deviceTokenEnv || 'TRMNL_DEVICE_API_KEY'];
      if (!deviceKey) throw new Error('Device API key is missing for this profile.');
      headers['Access-Token'] = deviceKey;
    }
    let body;
    if (args.body !== undefined) {
      if (op.contentType === 'multipart/form-data') {
        // Archive field name is confirmed by the official trmnlp API client.
        const file = args.body;
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64) || file.base64.length % 4) throw new Error('File is not canonical base64');
        const bytes = Buffer.from(file.base64, 'base64');
        if (bytes.length > 10 * 1024 * 1024) throw new Error('Upload exceeds 10 MiB');
        body = new FormData(); body.append('file', new Blob([bytes], { type: file.contentType || 'application/zip' }), path.basename(file.filename));
      } else { headers['Content-Type'] = op.contentType; body = JSON.stringify(args.body); }
    }
    const response = await this.fetch(url, { method: op.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(this.config.timeoutMs) });
    const bytes = await readLimited(response, this.config.maxResponseBytes);
    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('json')) { try { data = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('TRMNL returned malformed JSON'); } }
    else if (/zip|octet-stream|image\//.test(contentType) && response.ok) {
      const ext = contentType.includes('zip') ? '.zip' : '.bin';
      const filename = path.join(this.config.home, 'artifacts', crypto.randomUUID() + ext);
      await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
      await fs.writeFile(filename, bytes, { mode: 0o600 });
      data = { artifact: filename, bytes: bytes.length, contentType, sensitive: true, note: 'Account exports may contain credentials. Review before sharing.' };
    } else data = bytes.toString('utf8');
    const safe = redact(data, [...this.secrets(), token]);
    if (!response.ok) throw new ApiError(response.status, safe, response.headers.get('retry-after'));
    if (typeof data?.status === 'number' && data.status >= 400) throw new ApiError(data.status, safe);
    return { status: response.status, data: safe };
  }
}
