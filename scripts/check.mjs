import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { operations } from '../src/catalog.mjs';
import { starterFiles,validateFiles } from '../src/framework.mjs';
for(const dir of ['src','scripts','test'])for(const file of await fs.readdir(dir))if(file.endsWith('.mjs'))execFileSync(process.execPath,['--check',dir+'/'+file]);
for(const name of ['setup','create-plugin','devices','schedule-data']){const text=await fs.readFile('plugin/skills/'+name+'/SKILL.md','utf8');if(!text.startsWith('---\nname: '+name+'\ndescription:'))throw new Error('Invalid skill '+name);}
if(!validateFiles(starterFiles('Test')).valid)throw new Error('Starter does not meet Framework rules');
if(operations.length!==171)throw new Error('Review updated operation coverage before releasing.');
for(const file of ['plugin/plugin.json','plugin/.codex-plugin/plugin.json','plugin/.mcp.json','plugin/mcp.json','config.example.json'])JSON.parse(await fs.readFile(file,'utf8'));
console.log('Syntax, 171 API operations, four skill entries, manifest JSON and Framework starter checks passed.');
