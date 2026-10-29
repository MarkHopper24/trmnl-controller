import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
const bundled=process.argv.includes('--bundle');
const installedIndex=process.argv.indexOf('--installed');
const packageIndex=process.argv.indexOf('--package');
const cwd=packageIndex>=0?path.resolve(process.argv[packageIndex+1]):installedIndex>=0?path.resolve(process.argv[installedIndex+1]):bundled?path.resolve('dist/marketplace/plugins/trmnl-controller'):path.resolve('.');
const entry=bundled||installedIndex>=0?'runtime/trmnl-control.mjs':'src/cli.mjs';
const client=new Client({name:'trmnl-public-smoke',version:'1.0.0'});
try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[entry,'serve'],cwd,env:{...process.env,TRMNL_READ_ONLY:'1'},stderr:'inherit'}));
  console.log('MCP tools discovered:',(await client.listTools()).tools.length,'in read-only mode');
  for(const name of ['trmnl_list_models','trmnl_list_palettes','trmnl_list_categories','trmnl_list_server_ips']){
    const result=await client.callTool({name,arguments:{}});if(result.isError)throw new Error(JSON.stringify(result));
    const payload=JSON.parse(result.content[0].text);const data=payload.data?.data;
    console.log(JSON.stringify({tool:name,status:payload.status,records:Array.isArray(data)?data.length:undefined}));
  }
}finally{await client.close();}
