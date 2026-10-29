import dns from 'node:dns/promises';
import net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

export async function readLimited(response, maxBytes) {
  if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('Response exceeds configured byte limit'); }
  if (!response.body) return Buffer.alloc(0);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Response exceeds configured byte limit');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function isPrivateAddress(address) {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (ip.includes(':')) {
    if (ip.startsWith('::ffff:')) {
      const tail = ip.slice(7);
      if (net.isIPv4(tail)) return isPrivateAddress(tail);
      const parts = tail.split(':');
      if (parts.length === 2) { const n = parseInt(parts[0], 16) * 65536 + parseInt(parts[1], 16); return isPrivateAddress([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')); }
    }
    // Conservatively allow only global-unicast IPv6; reject local, link-local, multicast, mapped, documentation.
    return !/^[23][0-9a-f]{3}:/.test(ip) || ip.startsWith('2001:db8:') || ip.startsWith('2002:');
  }
  if (!net.isIPv4(ip)) return true;
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b));
}

export async function fetchSource(config, source) {
  const url = new URL(source.url);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Source URL must be HTTP(S) without embedded credentials or fragment.');
  if (!config.allowedSourceHosts.includes(url.hostname)) throw new Error('Source host is not in allowedSourceHosts. Add the exact intended hostname to your local config.');
  if (url.protocol !== 'https:' && !config.allowPrivateSources) throw new Error('HTTPS is required for public sources.');
  const addresses = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }] : await dns.lookup(hostname, { all: true });
  if (!addresses.length || (!config.allowPrivateSources && addresses.some(a => isPrivateAddress(a.address)))) throw new Error('Private/reserved source addresses require allowPrivateSources and an explicit allowed host.');
  const headers = { Accept: 'application/json' };
  for (const [name, envName] of Object.entries(source.headerEnv || {})) {
    if (!/^TRMNL_SOURCE_[A-Z0-9_]+$/.test(envName)) throw new Error('Source credentials must reference a TRMNL_SOURCE_* environment variable.');
    if (/^(host|connection|content-length|transfer-encoding|proxy-authorization)$/i.test(name)) throw new Error('Disallowed source header');
    if (!config.env[envName]) throw new Error('Missing source credential environment variable: ' + envName);
    headers[name] = config.env[envName];
  }
  const method = source.method || 'GET';
  if (!['GET', 'POST'].includes(method)) throw new Error('Sources support GET or explicit POST only');
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  const agent = new Agent({ connect: { lookup: (_name, options, callback) => options.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family) } });
  try {
    const response = await undiciFetch(url, { method, headers, body: method === 'POST' ? JSON.stringify(source.body ?? {}) : undefined, redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs), dispatcher: agent });
    const bytes = await readLimited(response, config.maxResponseBytes);
    if (!response.ok) throw new Error(`Source responded HTTP ${response.status}; response body withheld.`);
    try { return JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Source did not return valid JSON'); }
  } catch(e) { if (e.name === 'TimeoutError') throw new Error('Source timed out'); throw e; }
  finally { await agent.close(); }
}
