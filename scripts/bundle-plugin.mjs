import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';

const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
const root=path.resolve('dist/marketplace');
const plugin=path.join(root,'plugins/trmnl-controller');
// Only clear the two explicitly owned generated plugin directories.
for(const relative of ['dist/marketplace/plugins/trmnl-controller','plugins/trmnl-controller']){
  const target=path.resolve(relative);
  if(!target.startsWith(path.resolve('.')+path.sep)||path.basename(target)!=='trmnl-controller')throw new Error('Unsafe generated path');
  await fs.rm(target,{recursive:true,force:true});
}
await fs.mkdir(plugin,{recursive:true});
await fs.cp('plugin',plugin,{recursive:true});
await fs.cp('docs',path.join(plugin,'docs'),{recursive:true,filter:source=>!source.split(path.sep).includes('superpowers')});
await fs.mkdir(path.join(plugin,'specs'),{recursive:true});
await fs.copyFile('specs/trmnl.openapi.json',path.join(plugin,'specs/trmnl.openapi.json'));
await fs.copyFile('specs/source.json',path.join(plugin,'specs/source.json'));
await fs.copyFile('LICENSE',path.join(plugin,'LICENSE'));
await fs.writeFile(path.join(plugin,'README.md'),(await fs.readFile('README.md','utf8')).replaceAll('plugin/assets/','assets/'));
const built=await build({entryPoints:['src/cli.mjs'],bundle:true,platform:'node',target:'node22',format:'esm',outfile:path.join(plugin,'runtime/trmnl-control.mjs'),banner:{js:"import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"},legalComments:'eof',metafile:true});
// esbuild marks shebang outputs executable on Unix. Launching through Node
// needs no executable bit; normalize it to the committed Windows-built mode.
await fs.chmod(path.join(plugin,'runtime/trmnl-control.mjs'),0o644);
const dependencyRoots=new Set();
for(const input of Object.keys(built.metafile.inputs)){
  const index=input.lastIndexOf('node_modules/');if(index<0)continue;
  const base=input.slice(0,index+'node_modules/'.length);const parts=input.slice(base.length).split('/');
  dependencyRoots.add(base+parts.slice(0,parts[0].startsWith('@')?2:1).join('/'));
}
let notices='Third-party software bundled with TRMNL Controller\n\n';
for(const root of [...dependencyRoots].sort()){
  const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const licenses=(await fs.readdir(root,{withFileTypes:true})).filter(f=>f.isFile()&&/^(licen[cs]e|copying|notice)(\.|$)/i.test(f.name));
  if(!licenses.length)throw new Error('No license notice found for bundled dependency '+pkg.name);
  notices+=`${pkg.name} ${pkg.version} (${pkg.license || 'see notice'})\n${'='.repeat(72)}\n`;
  for(const file of licenses)notices+=await fs.readFile(path.join(root,file.name),'utf8')+'\n';
  notices+='\n';
}
await fs.writeFile(path.join(plugin,'THIRD_PARTY_NOTICES.txt'),notices.trimEnd()+'\n');
await fs.mkdir(path.join(root,'.agents/plugins'),{recursive:true});
const marketplace=JSON.stringify({name:'trmnl-controller',interface:{displayName:'TRMNL Controller'},plugins:[{name:'trmnl-controller',source:{source:'local',path:'./plugins/trmnl-controller'},policy:{installation:'AVAILABLE',authentication:'ON_USE'},category:'Utilities'}]},null,2)+'\n';
await fs.writeFile(path.join(root,'.agents/plugins/marketplace.json'),marketplace);
await fs.mkdir('.agents/plugins',{recursive:true});
await fs.writeFile('.agents/plugins/marketplace.json',marketplace);
await fs.mkdir('plugins',{recursive:true});
await fs.cp(plugin,'plugins/trmnl-controller',{recursive:true});
const entries={};
async function collect(dir,prefix=''){for(const item of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){const relative=prefix+item.name;if(item.isDirectory())await collect(path.join(dir,item.name),relative+'/');else entries[relative]=new Uint8Array(await fs.readFile(path.join(dir,item.name)));}}
await collect(plugin);
const zip=zipSync(entries,{level:6,mtime:new Date(2000,0,1),os:0});const archive=path.resolve(`dist/trmnl-controller-codex-${pkg.version}.zip`);
await fs.writeFile(archive,zip);await fs.writeFile(archive+'.sha256',createHash('sha256').update(zip).digest('hex')+'  '+path.basename(archive)+'\n');
console.log(JSON.stringify({plugin,marketplace:root,archive,bytes:zip.length},null,2));
