import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('marketplace installs a complete branded plugin with portable assets', async t => {
  const catalog = JSON.parse(await fs.readFile('.agents/plugins/marketplace.json', 'utf8'));
  assert.equal(catalog.name, 'trmnl-controller');
  const entry = catalog.plugins.find(p => p.name === 'trmnl-controller');
  assert.ok(entry);
  const root = path.resolve(entry.source.path);
  assert.ok(root.startsWith(path.resolve('plugins') + path.sep));
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
  const portable = JSON.parse(await fs.readFile(path.join(root, 'plugin.json'), 'utf8'));
  const compat = JSON.parse(await fs.readFile(path.join(root, '.codex-plugin/plugin.json'), 'utf8'));
  assert.equal(portable.name, entry.name);
  assert.equal(portable.version, pkg.version);
  assert.equal(compat.version, portable.version);
  for (const settings of [portable.extensions['com.openai'], compat]) {
    assert.equal(settings.interface.displayName, 'TRMNL Controller');
    assert.equal(settings.interface.websiteURL, 'https://github.com/MarkHopper24/trmnl-controller');
    for (const asset of [settings.interface.logo, settings.interface.composerIcon, ...settings.interface.screenshots]) {
      assert.ok(asset.startsWith('./assets/'));
      assert.ok((await fs.stat(path.join(root, asset))).size > 0);
    }
  }
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'trmnl-package-'));
  const outsider = await fs.mkdtemp(path.join(os.tmpdir(), 'trmnl-outsider-'));
  let client;
  t.after(async () => { await client?.close(); await fs.rm(home, { recursive: true, force: true }); await fs.rm(outsider, { recursive: true, force: true }); });
  const config = JSON.parse(await fs.readFile(path.join(root, '.mcp.json'), 'utf8')).mcpServers['trmnl-controller'];
  const runtime = path.join(root, config.args[0]);
  assert.equal((await fs.stat(runtime)).mode & 0o111, 0, 'Bundled runtime mode must match on every OS');
  const { stdout } = await promisify(execFile)(process.execPath, [runtime, '--help'], { cwd: outsider });
  assert.match(stdout, /worker/);
  const transport = new StdioClientTransport({ command: process.execPath, args: [runtime, 'serve'], cwd: outsider, env: { TRMNL_HOME: home, PATH: process.env.PATH || '' }, stderr: 'pipe' });
  client = new Client({ name: 'distribution-test', version: '1' });
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 199);
  const result = await client.callTool({ name: 'trmnl_status', arguments: {} });
  assert.ok(!result.isError);
  assert.equal(JSON.parse(result.content[0].text).version, pkg.version);
  assert.equal(JSON.parse(result.content[0].text).profiles[0].accountCredentialPresent, false);
});

test('release ZIP uses fixed timestamps and is reproducible across builds', async () => {
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
  const filename = `dist/trmnl-controller-codex-${pkg.version}.zip`;
  const first = await fs.readFile(filename);
  assert.equal(first.readUInt32LE(0), 0x04034b50);
  assert.equal(first.readUInt16LE(10), 0, 'ZIP entry time must be midnight');
  assert.equal(first.readUInt16LE(12), (20 << 9) | (1 << 5) | 1, 'ZIP entry date must be 2000-01-01');
  await promisify(execFile)(process.execPath, ['scripts/bundle-plugin.mjs']);
  assert.deepEqual(await fs.readFile(filename), first);
});
