import test from 'node:test';
import assert from 'node:assert/strict';
import {starterFiles,renderPreview} from '../src/framework.mjs';

test('previews accept authored templates beyond 2000 characters and retain a bound',async()=>{
 const files=starterFiles('Sessions');
 files['shared.liquid']='<!-- '+'x'.repeat(4000)+' -->';
 assert.match(await renderPreview(files,'full',{items:[{title:'Recent session',description:'Progress'}]}),/Recent session/);
 files['shared.liquid']='x'.repeat(2*1024*1024);
 await assert.rejects(renderPreview(files,'full',{}),/parse length limit exceeded/);
});
