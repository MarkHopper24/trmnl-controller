import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { starterFiles,renderPreview,layouts } from '../src/framework.mjs';
const root=path.resolve('.local/previews');await fs.mkdir(root,{recursive:true});
const files=starterFiles('TRMNL Control');
const probe=html=>html.replace('</body>',`<script>window.addEventListener('trmnl:terminalize:stats',function(event){document.documentElement.dataset.runtimeErrors=JSON.stringify(event.detail.errors||[]);});window.addEventListener('load',function(){terminalize().then(function(){document.documentElement.dataset.runtimeReady=String(window.TRMNL_PLUGINS_READY);});});</script></body>`);
const states={
  normal:{status:'ok',updated_at:'Updated just now',items:[{title:'Outdoor temperature',value:'18.4°',description:'Clear skies. Data supplied by your API.'},{title:'Next update',value:'30 min',description:'The display adapts to its available space.'},{title:'Devices supported',value:'58',description:'Models discovered from TRMNL’s live public catalog.'}]},
  empty:{items:[]},loading:{status:'loading'},error:{status:'error',error_message:'The source did not respond. Your next scheduled update will retry.'},
  overflow:{stale:true,updated_at:'Last updated 2 hours ago',items:Array.from({length:30},(_,i)=>({title:`Item ${i+1} with a much longer title that needs adaptive clamping`,value:String((i+1)*12345),description:'A long description tests the Framework runtime’s available space and overflow handling.'}))}
};
const links=[];
for(const layout of layouts)for(const [state,data]of Object.entries(states)){
  const name=layout+'-'+state+'.html';await fs.writeFile(path.join(root,name),probe(await renderPreview(files,layout,data)));links.push(`<li><a href="/${name}">${layout} · ${state}</a></li>`);
}
await fs.writeFile(path.join(root,'full-portrait.html'),probe(await renderPreview(files,'full',states.normal,{orientation:'portrait'})));
await fs.writeFile(path.join(root,'full-x.html'),probe(await renderPreview(files,'full',states.normal,{screenClasses:['screen--v2','screen--lg','screen--density-2x','screen--4bit']})));
await fs.writeFile(path.join(root,'index.html'),`<!doctype html><html><head><title>TRMNL Control preview checks</title></head><body><h1>TRMNL Control · Framework previews</h1><p>Official Framework 3.4 assets; local Liquid rendering. All four layouts and five data states.</p><ul>${links.join('')}<li><a href="/full-portrait.html">Portrait</a></li></ul></body></html>`);
const app=http.createServer(async(req,res)=>{const name=req.url==='/'?'index.html':req.url.slice(1);if(!/^[a-z_-]+\.html$/.test(name)){res.writeHead(404).end();return;}try{const html=await fs.readFile(path.join(root,name));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}catch{res.writeHead(404).end('Not found');}});
app.listen(8790,'127.0.0.1',()=>console.log('Preview gallery: http://127.0.0.1:8790'));
