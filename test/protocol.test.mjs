import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadConfig } from '../src/config.mjs';
import { serveHttp, createContext, createServer } from '../src/server.mjs';

test('real stdio MCP handshake, tool discovery, local authoring, prompts and resources',async t=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'trmnl-stdio-'));
  const transport=new StdioClientTransport({command:process.execPath,args:['src/cli.mjs','serve'],cwd:path.resolve('.'),env:{...process.env,TRMNL_HOME:home},stderr:'pipe'});
  const client=new Client({name:'protocol-test',version:'1.0.0'});
  t.after(async()=>{await client.close();await fs.rm(home,{recursive:true,force:true});});
  let stderr='';transport.stderr?.on('data',b=>stderr+=b.toString());
  await client.connect(transport);
  const listing=await client.listTools();assert.equal(listing.tools.length,199);
  const created=await client.callTool({name:'trmnl_project_create',arguments:{id:'demo',title:'Protocol demo',brief:'Dynamic metrics for all screen layouts'}});assert.ok(!created.isError);
  const valid=await client.callTool({name:'trmnl_project_validate',arguments:{id:'demo'}});assert.equal(JSON.parse(valid.content[0].text).valid,true);
  assert.equal((await client.listResources()).resources.length,2);assert.ok((await client.readResource({uri:'trmnl://framework'})).contents[0].text.includes('Framework'));
  assert.equal((await client.listPrompts()).prompts.length,2);
  const prompt=await client.getPrompt({name:'build-trmnl-plugin',arguments:{brief:'weather'}});assert.ok(prompt.messages[0].content.text.includes('weather'));
  const invalid=await client.callTool({name:'trmnl_project_read',arguments:{id:'../secret'}});assert.equal(invalid.isError,true);
  assert.equal(stderr,'');
});

test('HTTP transport authentication, Host/Origin validation and real SDK calls',async t=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'trmnl-http-'));const config=await loadConfig({TRMNL_HOME:home});const token='test-http-token-with-at-least-24-characters';
  const app=await serveHttp(config,{port:0,token});const url=new URL(`http://127.0.0.1:${app.address().port}/mcp`);
  const client=new Client({name:'http-test',version:'1.0.0'});
  t.after(async()=>{await client.close();await new Promise(r=>app.close(r));await fs.rm(home,{recursive:true,force:true});});
  assert.equal((await fetch(url,{method:'POST'})).status,401);
  assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://evil.example'}})).status,403);
  const badHost=await new Promise((resolve,reject)=>{const req=http.request(url,{method:'POST',headers:{Authorization:'Bearer '+token,Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
  assert.equal(badHost,403);
  await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:'Bearer '+token}}}));
  assert.equal((await client.listTools()).tools.length,199);
  const status=await client.callTool({name:'trmnl_status',arguments:{}});assert.ok(!status.isError);assert.equal(JSON.parse(status.content[0].text).profiles[0].accountCredentialPresent,false);
});

test('remote preview results are native MCP images with compact metadata', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'trmnl-preview-'));
  const config = await loadConfig({ TRMNL_HOME: home, TRMNL_API_KEY: 'fake-token' });
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
  const context = createContext(config, async () => new Response(JSON.stringify({ data: { status: 'complete', job_id: 'fixture', preview_base64: png } }), { headers: { 'content-type': 'application/json' } }));
  const { server } = createServer(config, context);
  const client = new Client({ name: 'preview-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); await fs.rm(home, { recursive: true, force: true }); });
  await server.connect(b); await client.connect(a);
  const result = await client.callTool({ name: 'trmnl_get_preview', arguments: { path: { plugin_setting_id: '42', id: 'fixture' } } });
  assert.equal(result.isError, undefined);
  assert.equal(result.content[1].type, 'image'); assert.equal(result.content[1].data, png);
  assert.ok(!result.content[0].text.includes('preview_base64'));
});

test('CLI launches through the symlinks used by Unix npm bins', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trmnl-bin-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const entry = path.join(root, 'trmnl-control.mjs');
  try { await fs.symlink(path.resolve('src/cli.mjs'), entry, 'file'); }
  catch(e) { if(process.platform === 'win32' && ['EPERM','EACCES'].includes(e.code)){t.skip('Windows account cannot create file symlinks; Unix CI covers npm bins.');return;}throw e; }
  const { stdout } = await promisify(execFile)(process.execPath, [entry, '--help'], { cwd: root });
  assert.match(stdout, /trmnl-control serve/);
});
