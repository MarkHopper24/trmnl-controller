import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import Ajv from 'ajv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { operations, byName } from './catalog.mjs';
import { TrmnlClient } from './client.mjs';
import { Projects } from './projects.mjs';
import { Pipelines } from './pipelines.mjs';
import { LoginManager } from './auth.mjs';
import { helperTools } from './helpers.mjs';
import { frameworkGuide } from './framework.mjs';
import { redact } from './config.mjs';

export function createContext(config, fetcher) {
  const client = new TrmnlClient(config, fetcher);
  return { config, client, projects: new Projects(config,client), pipelines: new Pipelines(config,client), login: new LoginManager(config) };
}
export function createServer(config, context) {
  const ctx = context || createContext(config);
  const server = new Server({ name:'trmnl-controller', version:'0.2.1' }, { capabilities:{ tools:{}, resources:{}, prompts:{} }, instructions:'Use catalog_search to discover tools. All authored TRMNL plugins must follow framework_guide and be validated and visually previewed. Natural-language work uses the current harness model. Host schedules are created by host tools, never implied by a schedule plan. Use only user-authorized remote actions. Device API getDisplay advances a playlist; use getCurrentScreen for passive inspection. Do not expose credentials. Official TRMNL-hosted MCP is also available at https://trmnl.com/mcp.' });
  ctx.server = server;
  const ajv = new Ajv({strict:false,allErrors:true,validateFormats:false});
  const helpers = helperTools(ctx).map(t => ({...t,validate:ajv.compile(t.inputSchema)}));
  const helperMap = new Map(helpers.map(t=>[t.name,t]));
  const listed = [...operations,...helpers].filter(t => !config.readOnly || t.annotations.readOnlyHint).map(({name,description,inputSchema,annotations})=>({name,description,inputSchema,annotations}));
  server.setRequestHandler(ListToolsRequestSchema, async () => ({tools:listed}));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      const {name,arguments:args={}} = request.params;
      const helper = helperMap.get(name); let result;
      if (helper) {
        if(config.readOnly && !helper.annotations.readOnlyHint) throw new Error('Read-only mode blocks this operation');
        if(!helper.validate(args)) throw new Error('Invalid arguments: '+ajv.errorsText(helper.validate.errors));
        result = await helper.run(args);
      } else { const op=byName.get(name); if(!op) throw new Error('Unknown tool'); result=await ctx.client.execute(op.id,args); }
      const safe = redact(result,ctx.client.secrets());
      if (name === 'trmnl_get_preview' && safe.data?.data?.preview_base64) {
        const base64 = safe.data.data.preview_base64.replace(/^data:image\/png;base64,/, '');
        const bytes = Buffer.from(base64, 'base64');
        if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Preview did not contain a PNG image');
        delete safe.data.data.preview_base64;
        safe.data.data.preview = { mimeType: 'image/png', bytes: bytes.length };
        return { content: [{ type: 'text', text: JSON.stringify(safe) }, { type: 'image', data: bytes.toString('base64'), mimeType: 'image/png' }] };
      }
      return {content:[{type:'text',text:JSON.stringify(safe)}]};
    } catch(e) { return {isError:true,content:[{type:'text',text:JSON.stringify({error:redact(e.message,ctx.client.secrets()),...(e.status?{httpStatus:e.status}:{}),...(e.retryAfter?{retryAfter:e.retryAfter}:{})})}]}; }
  });
  server.setRequestHandler(ListResourcesRequestSchema, async()=>({resources:[{uri:'trmnl://framework',name:'TRMNL Framework authoring requirements',mimeType:'text/plain'},{uri:'trmnl://api-catalog',name:'TRMNL operation inventory',mimeType:'application/json'}]}));
  server.setRequestHandler(ReadResourceRequestSchema,async r=>{const uri=r.params.uri; if(!['trmnl://framework','trmnl://api-catalog'].includes(uri))throw new Error('Unknown resource');return {contents:[{uri,mimeType:uri.endsWith('framework')?'text/plain':'application/json',text:uri.endsWith('framework')?frameworkGuide:JSON.stringify(operations.map(o=>({tool:o.name,operationId:o.id,summary:o.description.split('\n')[0],tags:o.tags})))}]};});
  server.setRequestHandler(ListPromptsRequestSchema,async()=>({prompts:[{name:'build-trmnl-plugin',description:'Turn a brief into a validated, responsive TRMNL plugin.',arguments:[{name:'brief',description:'Desired content, data source and target devices',required:true}]},{name:'schedule-trmnl-data',description:'Set up host-driven API middleware.',arguments:[{name:'brief',description:'Sources, target and desired schedule',required:true}]}]}));
  server.setRequestHandler(GetPromptRequestSchema,async r=>{if(!['build-trmnl-plugin','schedule-trmnl-data'].includes(r.params.name))throw new Error('Unknown prompt'); return {messages:[{role:'user',content:{type:'text',text:r.params.name==='build-trmnl-plugin'?`Build this TRMNL plugin: ${r.params.arguments?.brief || ''}\nRead framework_guide, discover target models and inspect relevant API schemas. Create a project and tailor all four layouts using current Framework utilities, data-driven conditions and render-time fitting. Keep credentials out of markup. Validate, render, inspect representative model/layout/theme/state previews. Deploy only to the requested target and verify remote readback/render. State any untested device limits.`:`Set up this TRMNL data workflow: ${r.params.arguments?.brief || ''}\nChoose native polling or Plugin Merge when they suffice; otherwise configure a source allowlist and credential references, save a disabled pipeline, test the projection and payload size, publish once when authorized, then use the host's native scheduler if available. schedule_plan alone does not install a schedule. Verify and report its actual ID and target.`}}]};});
  return {server,ctx,tools:listed};
}

export async function serveStdio(config) { const {server,ctx}=createServer(config); await server.connect(new StdioServerTransport()); const close=()=>{ctx.login.close();server.close();}; process.once('SIGINT',close);process.once('SIGTERM',close); return {server,ctx}; }

export async function serveHttp(config,{host='127.0.0.1',port=8787,token=config.env.TRMNL_MCP_TOKEN}={}) {
  if(!token || token.length<24) throw new Error('HTTP requires TRMNL_MCP_TOKEN with at least 24 characters. Use stdio for simple local clients.');
  const ctx=createContext(config);
  const app=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const incomingHost=req.headers.host || '';
    const localHosts=new Set(['localhost','127.0.0.1','[::1]']);
    const incomingHostname=incomingHost.replace(/:\d+$/,'');
    if(localHosts.has(host) && !localHosts.has(incomingHostname)){res.writeHead(403).end('Invalid Host');return;}
    if(req.headers.origin){res.writeHead(403).end('Browser origins are not allowed on the MCP endpoint');return;}
    const auth=req.headers.authorization || ''; const expected='Bearer '+token;
    if(Buffer.byteLength(auth)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(auth),Buffer.from(expected))){res.writeHead(401,{'WWW-Authenticate':'Bearer'}).end('Unauthorized');return;}
    if(req.url!=='/mcp'){res.writeHead(404).end();return;}
    if(req.method!=='POST'){res.writeHead(405,{'Allow':'POST'}).end();return;}
    let size=0;const chunks=[];
    try {
      for await(const chunk of req){size+=chunk.length;if(size>12*1024*1024){res.writeHead(413).end();return;}chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const {server}=createServer(config,ctx); const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
      res.on('close',()=>{transport.close();server.close();});
      await server.connect(transport);await transport.handleRequest(req,res,body);
    }catch{if(!res.headersSent)res.writeHead(400).end('Invalid MCP request');}
  });
  app.requestTimeout=30000;
  await new Promise((resolve,reject)=>{app.once('error',reject);app.listen(port,host,resolve);});
  app.on('close',()=>ctx.login.close());
  return app;
}
