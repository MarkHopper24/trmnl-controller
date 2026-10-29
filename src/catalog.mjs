import fs from 'node:fs';
import Ajv from 'ajv';

export const spec = JSON.parse(fs.readFileSync(new URL('../specs/trmnl.openapi.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
const snake = s => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const sensitiveHeaders = /^(access-token|authorization|client-id)$/i;
const effectfulGets = new Set(['getDisplay', 'setupDevice', 'getRoomBookingIntegrationConnectUrl']);
const nonMutatingPosts = new Set(['renderMarkup', 'verifyCustomFields', 'evaluatePluginConfiguration', 'evaluateInstallationConfiguration', 'getPluginConfigurationChoices', 'getInstallationConfigurationChoices']);

export function normalizeSchema(input, seen = []) {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(v => normalizeSchema(v, seen));
  if (input.$ref) {
    if (seen.includes(input.$ref)) return {};
    const referenced = input.$ref.split('/').slice(1).reduce((o, k) => o?.[k], spec);
    if (!referenced) throw new Error('Unresolved schema ' + input.$ref);
    return normalizeSchema({ ...referenced, ...Object.fromEntries(Object.entries(input).filter(([k]) => k !== '$ref')) }, [...seen, input.$ref]);
  }
  const out = Object.fromEntries(Object.entries(input).filter(([k]) => !['example', 'nullable', 'xml', 'discriminator', 'readOnly', 'writeOnly'].includes(k)).map(([k, v]) => [k, normalizeSchema(v, seen)]));
  if (out.type === 'file' || out.format === 'binary') return { type: 'object', properties: { base64: { type: 'string' }, filename: { type: 'string', minLength: 1 }, contentType: { type: 'string' } }, required: ['base64', 'filename'], additionalProperties: false };
  if (input.nullable) return { anyOf: [out, { type: 'null' }] };
  return out;
}

export const operations = [];
for (const [route, item] of Object.entries(spec.paths)) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const op = item[method];
    if (!op) continue;
    const params = [...(item.parameters || []), ...(op.parameters || [])].map(p => p.$ref ? normalizeSchema(p) : p);
    const byKey = new Map(params.map(p => [p.in + ':' + p.name, p]));
    for (const name of [...route.matchAll(/\{([^}]+)\}/g)].map(m => m[1])) if (!byKey.has('path:' + name)) byKey.set('path:' + name, { name, in: 'path', required: true, schema: { type: 'string' } });
    const input = { type: 'object', properties: { profile: { type: 'string', description: 'Configured profile name; defaults to default.' } }, additionalProperties: false, required: [] };
    for (const [location, field] of [['path', 'path'], ['query', 'query'], ['header', 'headers']]) {
      const set = [...byKey.values()].filter(p => p.in === location && !sensitiveHeaders.test(p.name));
      if (!set.length) continue;
      input.properties[field] = { type: 'object', properties: Object.fromEntries(set.map(p => [p.name, { ...normalizeSchema(p.schema || { type: 'string' }), ...(p.description ? { description: p.description } : {}) }])), required: set.filter(p => p.required).map(p => p.name), additionalProperties: false };
      if (set.some(p => p.required)) input.required.push(field);
    }
    const content = op.requestBody?.content;
    const contentType = content?.['application/json'] ? 'application/json' : content ? Object.keys(content)[0] : undefined;
    if (contentType) {
      input.properties.body = normalizeSchema(content[contentType].schema || {});
      if (op.requestBody.required) input.required.push('body');
    }
    const readOnly = (method === 'get' && !effectfulGets.has(op.operationId)) || nonMutatingPosts.has(op.operationId);
    const destructive = method === 'delete' || /^(clear|reset|replace|import|remove|cancel|end)/.test(op.operationId);
    const annotations = { readOnlyHint: readOnly, destructiveHint: destructive, idempotentHint: readOnly || ['put', 'delete'].includes(method), openWorldHint: true };
    const description = [op.summary, op.description, `TRMNL ${method.toUpperCase()} ${route}.`, readOnly ? '' : 'Changes remote state or starts work. Run only within the user-authorized scope.'].filter(Boolean).join('\n');
    const entry = { id: op.operationId, name: 'trmnl_' + snake(op.operationId), route, method: method.toUpperCase(), params: [...byKey.values()], contentType, accountAuth: (op.security || []).some(s => s.bearer_auth), tags: op.tags || [], description, inputSchema: input, annotations };
    entry.validate = ajv.compile(input);
    operations.push(entry);
  }
}
export const byId = new Map(operations.map(o => [o.id, o]));
export const byName = new Map(operations.map(o => [o.name, o]));
export function validateOperation(op, args) {
  if (!op.validate(args)) throw new Error('Invalid arguments: ' + ajv.errorsText(op.validate.errors, { separator: '; ' }));
}
