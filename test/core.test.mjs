import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, redact } from '../src/config.mjs';
import { operations, byId } from '../src/catalog.mjs';
import { TrmnlClient } from '../src/client.mjs';
import { starterFiles, validateFiles, renderPreview } from '../src/framework.mjs';
import { Projects } from '../src/projects.mjs';
import { Pipelines, projectData, pointer, schedulePlan } from '../src/pipelines.mjs';
import { fetchSource, isPrivateAddress } from '../src/network.mjs';
import { Credentials } from '../src/credentials.mjs';

async function setup(t, extra={}) {
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'trmnl-test-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
  return {...await loadConfig({TRMNL_HOME:home,TRMNL_API_KEY:'test-secret-account-token',TRMNL_DEVICE_API_KEY:'test-secret-device-token'}),...extra};
}
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});

test('every official operation has a unique valid tool name and request validator',()=>{
  assert.equal(operations.length,171);assert.equal(new Set(operations.map(o=>o.name)).size,171);
  for(const o of operations){assert.match(o.name,/^[a-z0-9_]{1,64}$/);assert.equal(typeof o.validate,'function');}
  assert.equal(byId.get('getDisplay').annotations.readOnlyHint,false);
  assert.equal(byId.get('setupDevice').annotations.readOnlyHint,false);
  assert.equal(byId.get('getCurrentScreen').annotations.readOnlyHint,true);
  assert.equal(byId.get('renderMarkup').annotations.readOnlyHint,true);
});
test('inherits path parameters, encodes values and sends credentials to the exact profile',async t=>{
  const config=await setup(t);let request;
  const client=new TrmnlClient(config,async(url,init)=>{request={url:String(url),...init};return response({data:{ok:true}});});
  await client.execute('getPluginSettingDetails',{path:{id:'42'}});
  assert.equal(request.url,'https://trmnl.com/api/plugin_settings/42/details');assert.equal(request.headers.Authorization,'Bearer test-secret-account-token');assert.equal(request.redirect,'error');
  await assert.rejects(client.execute('getPluginSettingDetails',{path:{id:'../devices'}}),/Invalid path/);
  await assert.rejects(client.execute('readMarkup',{path:{plugin_setting_id:'..',size:'markup_full'}}),/Invalid path/);
  await assert.rejects(client.execute('listDevices',{headers:{Authorization:'stolen'}}),/Invalid arguments/);
});
test('public and device credentials remain separate; device errors inside HTTP 200 propagate',async t=>{
  const config=await setup(t);let headers;
  const client=new TrmnlClient(config,async(_url,init)=>{headers=init.headers;return response({status:404,message:'unknown'});});
  await assert.rejects(client.execute('listModels'),/HTTP 404/);assert.equal(headers.Authorization,undefined);
  await assert.rejects(client.execute('getCurrentScreen'),/HTTP 404/);assert.equal(headers['Access-Token'],'test-secret-device-token');assert.equal(headers.Authorization,undefined);
});
test('read-only mode blocks effects even for GET firmware endpoints',async t=>{
  const config=await setup(t,{readOnly:true});let calls=0;const client=new TrmnlClient(config,async()=>{calls++;return response({});});
  await assert.rejects(client.execute('getDisplay'),/READ_ONLY/);await assert.rejects(client.execute('deletePluginSetting',{path:{id:1}}),/READ_ONLY/);assert.equal(calls,0);
});
test('API preserves 429 guidance, never retries a mutation, and redacts credentials',async t=>{
  const config=await setup(t);let calls=0;const client=new TrmnlClient(config,async()=>{calls++;return response({error:'test-secret-account-token',access_token:'private'},429,{'Retry-After':'60'});});
  await assert.rejects(client.execute('createPluginSetting',{body:{name:'Test',plugin_id:1}}),e=>e.status===429&&e.retryAfter==='60'&&!e.message.includes('test-secret'));assert.equal(calls,1);
  assert.deepEqual(redact({api_key:'x',nested:{refresh_token:'y'}}),{api_key:'[REDACTED]',nested:{refresh_token:'[REDACTED]'}});
});
test('binary archives stay in a managed artifact and multipart uses file field',async t=>{
  const config=await setup(t);let req;
  const download=new TrmnlClient(config,async()=>new Response(Buffer.from([80,75,3,4]),{headers:{'content-type':'application/zip'}}));
  const result=await download.execute('downloadPluginSettingArchive',{path:{id:1}});assert.deepEqual(await fs.readFile(result.data.artifact),Buffer.from([80,75,3,4]));
  const upload=new TrmnlClient(config,async(_u,init)=>{req=init;return response({data:{}});});
  await upload.execute('uploadPluginSettingArchive',{path:{id:1},body:{base64:'UEsDBA==',filename:'plugin.zip'}});assert.equal(req.body.get('file').name,'plugin.zip');assert.equal(req.headers['Content-Type'],undefined);
});
test('response size is bounded including streaming responses',async t=>{
  const config=await setup(t,{maxResponseBytes:20});const c=new TrmnlClient(config,async()=>response({long:'x'.repeat(50)}));await assert.rejects(c.execute('listModels'),/byte limit/);
});
test('supplemental webhook and partner APIs use their separate credentials and body status',async t=>{
  const config=await setup(t);config.env.TRMNL_WEBHOOK_TEST='test-uuid';config.env.TRMNL_PARTNER_CLIENT_ID='partner-id';config.env.TRMNL_PARTNER_ACCESS_TOKEN='partner-secret';let req;
  const client=new TrmnlClient(config,async(url,init)=>{req={url:String(url),...init};return response({status:200,data:{code:'test-coupon'}});});
  await client.webhook({uuidEnv:'TRMNL_WEBHOOK_TEST',mergeVariables:{rows:[1]},mergeStrategy:'stream',streamLimit:10});
  assert.equal(req.url,'https://trmnl.com/api/custom_plugins/test-uuid');assert.equal(req.headers.Authorization,undefined);assert.equal(JSON.parse(req.body).stream_limit,10);
  await client.provisionPartner({data:{customer_reference:'fake-test-id'}});assert.equal(req.headers['Client-Id'],'partner-id');assert.equal(req.headers['Access-Token'],'partner-secret');assert.equal(JSON.parse(req.body).partner.action,'provision_discount');
  const denied=new TrmnlClient(config,async()=>response({status:403}));await assert.rejects(denied.provisionPartner({data:{}}),/403/);
});
test('Framework starter covers all four layouts and data states without wrapping the hosted view',async()=>{
  const files=starterFiles('Example & <safe>');assert.equal(validateFiles(files).valid,true);
  for(const layout of ['full','half_horizontal','half_vertical','quadrant'])for(const data of [{status:'loading'},{items:[]},{status:'error',error_message:'failed'},{stale:true,items:[{title:'<script>bad</script>',value:0}],updated_at:'now'}]){
    const html=await renderPreview(files,layout,data);assert.match(html,/class="screen screen--og screen--md screen--density-1x screen--1bit"/);assert.ok(!html.includes('<script>bad</script>'));
  }
  assert.match(await renderPreview(files,'full',{status:'error'}),/Unable to update/);
  assert.match(await renderPreview(files,'full',{items:[]}),/Nothing to show/);
});
test('Framework validator catches invalid wrappers, fixed dimensions, unsupported variants and interactive controls',()=>{
  const files=starterFiles('Bad');files['full.liquid']='<div class="screen"><div class="layout" style="width:800px;color:#fff"><button>Go</button><div class="2bit:grid--cols-3"></div></div></div>';
  const result=validateFiles(files);assert.equal(result.valid,false);assert.ok(result.errors.some(e=>e.includes('wrappers')));assert.ok(result.errors.some(e=>e.includes('dimensions')));assert.ok(result.errors.some(e=>e.includes('form controls')));assert.ok(result.errors.some(e=>e.includes('unsupported bit-depth')));
});
test('project edits enforce file allowlist, revisions and deployment validation',async t=>{
  const config=await setup(t);let calls=0;const p=new Projects(config,{execute:async()=>{calls++;return {status:200};}});
  await p.create('example','Example');await assert.rejects(p.create('example','Another'),/already exists/);await assert.rejects(p.create('../bad','Bad'),/identifier/);
  await assert.rejects(p.save('example',{expectedRevision:1,files:{'../../secret':'oops'}}),/Unsupported/);
  await p.save('example',{expectedRevision:1,files:{'full.liquid':'<div>invalid</div>'}});
  await assert.rejects(p.save('example',{expectedRevision:1,sample:{}}),/changed/);
  assert.equal((await p.deploy('example',4)).deployed,false);assert.equal(calls,0);
});
test('projection handles arrays, defaults, false/zero and escaped pointers while rejecting prototype reads',()=>{
  assert.deepEqual(projectData({source:{'a/b':[ {n:0,ok:false} ]}}, {items:{path:'/source/a~1b',map:{value:{path:'/n'},flag:{path:'/ok'},missing:{path:'/no',default:'n/a'}}}}),{items:[{value:0,flag:false,missing:'n/a'}]});
  assert.throws(()=>pointer({},'/__proto__/secret'),/Unsafe/);assert.throws(()=>projectData({},JSON.parse('{"__proto__":{"value":1}}')),/Unsafe/);
  assert.throws(()=>projectData({secret:'private'},{leak:{}}),/exactly one/);
});
test('source fetching blocks unlisted hosts, embedded credentials and private network addresses',async t=>{
  const config=await setup(t,{allowedSourceHosts:['127.0.0.1','localhost']});
  await assert.rejects(fetchSource(config,{url:'https://example.com/data'}),/allowedSourceHosts/);
  await assert.rejects(fetchSource(config,{url:'https://127.0.0.1/data'}),/Private/);
  await assert.rejects(fetchSource(config,{url:'https://a:b@localhost/data'}),/embedded/);
  for(const ip of ['127.0.0.1','169.254.169.254','10.0.0.1','::1','::ffff:127.0.0.1','::ffff:7f00:1','fe80::1','fc00::1'])assert.equal(isPrivateAddress(ip),true,ip);
  assert.equal(isPrivateAddress('1.1.1.1'),false);
});
test('pipeline dry run, enabled state, deduplication, spacing and failure preservation',async t=>{
  const config=await setup(t,{allowedSourceHosts:['example.com']});let calls=0;let upstream={n:1};const client={secrets:()=>[],execute:async()=>{calls++;return{status:200};}};
  const p=new Pipelines(config,client,async()=>upstream);
  await p.save('sample',{sources:[{name:'api',url:'https://example.com/data'}],fields:{value:{path:'/api/n'}},target:{pluginSettingId:1},intervalMinutes:5});
  assert.equal((await p.run('sample')).mergeVariables.value,1);assert.equal(calls,0);
  assert.equal((await p.run('sample',{dryRun:false})).reason,'Pipeline disabled');
  await p.enable('sample',true);assert.equal((await p.run('sample',{dryRun:false})).published,true);assert.equal(calls,1);
  assert.match((await p.run('sample',{dryRun:false,force:true})).reason,/next allowed/);
  const state=JSON.parse(await fs.readFile(p.stateFile('sample'),'utf8'));state.nextAttemptAt=0;await fs.writeFile(p.stateFile('sample'),JSON.stringify(state));
  assert.equal((await p.run('sample',{dryRun:false})).reason,'Data unchanged');assert.equal(calls,1);
  const definition=await p.get('sample');definition.target.pluginSettingId=2;await p.save('sample',definition);const editedState=JSON.parse(await fs.readFile(p.stateFile('sample'),'utf8'));editedState.nextAttemptAt=0;await fs.writeFile(p.stateFile('sample'),JSON.stringify(editedState));
  assert.equal((await p.run('sample',{dryRun:false})).published,true);assert.equal(calls,2);
  assert.equal(schedulePlan(await p.get('sample'),'codex','America/Chicago').harness,'codex');
  upstream={n:'x'.repeat(10000)};await assert.rejects(p.run('sample'),/payload limit/);assert.equal(calls,2);
});
test('local Liquid cannot read arbitrary files through include or render tags',async()=>{
  const files=starterFiles('No includes');files['full.liquid']="{% render '../package.json' %}";
  await assert.rejects(renderPreview(files,'full',{}),/file includes|File reads|not found/i);
});
test('pipeline process lock prevents overlapping fetch/publish',async t=>{
  const config=await setup(t,{allowedSourceHosts:['example.com']});let unlock;const wait=new Promise(r=>unlock=r);
  const p=new Pipelines(config,{secrets:()=>[],execute:async()=>({status:200})},async()=>{await wait;return{};});
  await p.save('lock',{sources:[{name:'api',url:'https://example.com'}],fields:{status:{value:'ok'}},target:{pluginSettingId:1},intervalMinutes:5});
  const first=p.run('lock');await new Promise(r=>setTimeout(r,30));assert.equal((await p.run('lock')).skipped,true);unlock();await first;
});
test('credential storage roundtrips without a plaintext token on Windows and binds tokens to origin',async t=>{
  const config=await setup(t);config.env={};const c=new Credentials(config);await c.save('default',{access_token:'secret-test-credential',origin:'https://trmnl.com'});
  assert.equal(await c.token('default'),'secret-test-credential');if(process.platform==='win32')assert.ok(!(await fs.readFile(c.file('default'),'utf8')).includes('secret-test-credential'));
  config.profiles.default.baseUrl='https://other.example';await assert.rejects(c.token('default'),/different origin/);
});

test('two project writers cannot silently overwrite the same revision', async t => {
  const config = await setup(t); const first = new Projects(config, {}); const second = new Projects(config, {});
  await first.create('concurrent', 'Concurrent');
  const results = await Promise.allSettled([first.save('concurrent', { expectedRevision: 1, sample: { winner: 'first' } }), second.save('concurrent', { expectedRevision: 1, sample: { winner: 'second' } })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await first.get('concurrent')).revision, 2);
});

test('project deployment, comparison and pipeline publishing use actual API request schemas', async t => {
  const config = await setup(t, { allowedSourceHosts: ['example.com'] });
  const remoteFiles = starterFiles('Contract'); const requests = [];
  const client = new TrmnlClient(config, async (url, init) => { requests.push({ url: String(url), method: init.method, body: init.body }); return response({ data: remoteFiles }); });
  const projects = new Projects(config, client);
  await projects.create('contract', 'Contract');
  assert.equal((await projects.deploy('contract', 42)).deployed, true);
  assert.ok((await projects.compare('contract', 42)).files.every(f => f.same));
  const pipelines = new Pipelines(config, client, async () => ({ n: 42 }));
  await pipelines.save('contract', { sources: [{ name: 'api', url: 'https://example.com' }], fields: { value: { path: '/api/n' } }, target: { pluginSettingId: 42 }, intervalMinutes: 5, enabled: true });
  assert.equal((await pipelines.run('contract', { dryRun: false })).published, true);
  assert.equal(requests.length, 3);
  assert.deepEqual(JSON.parse(requests[2].body), { merge_variables: { value: 42 } });
});

test('separate credential instances serialize refresh-token rotation', async t => {
  const config = await setup(t); config.env = {};
  const first = new Credentials(config); const second = new Credentials(config);
  await first.save('default', { access_token: 'old', refresh_token: 'rotate-once', expires_at: 1, origin: 'https://trmnl.com', token_endpoint: 'https://trmnl.com/oidc/token', client_id: 'test' });
  let calls = 0;
  const fetcher = async () => { calls++; await new Promise(r => setTimeout(r, 100)); return response({ access_token: 'fresh', refresh_token: 'rotated', expires_in: 7200 }); };
  assert.deepEqual(await Promise.all([first.token('default', fetcher), second.token('default', fetcher)]), ['fresh', 'fresh']);
  assert.equal(calls, 1);
});
