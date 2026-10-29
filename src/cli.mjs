#!/usr/bin/env node
import { loadConfig } from './config.mjs';
import { createContext, serveStdio, serveHttp } from './server.mjs';
import { operations } from './catalog.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';

export async function main(args=process.argv.slice(2)) {
  const config=await loadConfig();
  const value=(flag, fallback)=>{const i=args.indexOf(flag);return i<0?fallback:args[i+1];};
  switch(args[0] || 'serve') {
    case 'serve':
      if(args.includes('--http')) { const app=await serveHttp(config,{host:value('--host','127.0.0.1'),port:Number(value('--port','8787'))}); console.error(`TRMNL MCP listening at http://${app.address().address}:${app.address().port}/mcp`); }
      else await serveStdio(config);
      break;
    case 'login': {
      const ctx=createContext(config);const start=await ctx.login.start(value('--profile','default'),value('--scopes','read,content,devices').split(','));
      console.log(JSON.stringify(start,null,2));
      while(ctx.login.status(start.id).status==='pending'||ctx.login.status(start.id).status==='exchanging') await delay(1000);
      const state=ctx.login.status(start.id);console.log(JSON.stringify(state));ctx.login.close(); if(state.status!=='connected')process.exitCode=1;break;
    }
    case 'logout': {const ctx=createContext(config);await ctx.client.credentials.remove(value('--profile','default'));console.log('Local credential removed. Revoke the grant in TRMNL Connected agents to remove server-side access.');break;}
    case 'catalog': console.log(JSON.stringify(operations.map(o=>({operationId:o.id,tool:o.name,method:o.method,path:o.route})),null,2));break;
    case 'pipeline': {if(args[1]!=='run'||!args[2])throw new Error('Use pipeline run ID [--publish]');const ctx=createContext(config);console.log(JSON.stringify(await ctx.pipelines.run(args[2],{dryRun:!args.includes('--publish')}),null,2));break;}
    case 'worker': {const ctx=createContext(config);console.error('TRMNL pipeline worker running; stop with Ctrl+C. Only enabled pipelines publish.');while(true){const outcomes=await ctx.pipelines.tick();for(const x of outcomes)if(!x.skipped)console.error(JSON.stringify(x));await delay(30000);} }
    case 'help': case '--help': console.log('trmnl-control serve [--http --host HOST --port PORT]\ntrmnl-control login [--profile NAME --scopes read,content,devices]\ntrmnl-control logout [--profile NAME]\ntrmnl-control catalog\ntrmnl-control pipeline run ID [--publish]\ntrmnl-control worker\nConfig: TRMNL_CONFIG, TRMNL_HOME; credentials: TRMNL_API_KEY or browser login. Node.js >=22.19.0.');break;
    default: throw new Error('Unknown command. Use --help.');
  }
}
if(process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main().catch(e=>{console.error(e.message);process.exitCode=1;});
