import fs from 'node:fs/promises';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { atomicJson, identifier, readJson, withFileLock } from './config.mjs';
import { starterFiles, validateFiles, renderPreview, layouts } from './framework.mjs';

const allowedFiles = new Set(['settings.yml', 'full.liquid', 'half_horizontal.liquid', 'half_vertical.liquid', 'quadrant.liquid', 'shared.liquid', 'transform.js']);
export class Projects {
  constructor(config, client) { this.config = config; this.client = client; }
  file(id) { return path.join(this.config.home, 'projects', identifier(id) + '.json'); }
  async list() { let names; try { names = await fs.readdir(path.join(this.config.home, 'projects')); } catch(e) { if(e.code === 'ENOENT') return []; throw e; } return names.filter(n => n.endsWith('.json')).map(n => n.slice(0, -5)); }
  async get(id) { return readJson(this.file(id)); }
  async create(id, title, brief = '', strategy = 'webhook') {
    return withFileLock(this.file(id) + '.lock', async () => {
    if (await readJson(this.file(id), null)) throw new Error('Project already exists.');
    const project = { id, title, brief, revision: 1, files: starterFiles(title, strategy), sample: { status: 'ok', updated_at: 'Sample data', items: [{ title: 'Connected data', value: '42', description: 'Replace this with values from your API.' }] } };
    await atomicJson(this.file(id), project); return { ...project, validation: validateFiles(project.files) };
    });
  }
  async save(id, { files, sample, expectedRevision }) {
    return withFileLock(this.file(id) + '.lock', async () => {
    const p = await this.get(id);
    if (expectedRevision !== p.revision) throw new Error('Project changed. Read it again and use its current revision.');
    if (files) for(const [name, text] of Object.entries(files)) {
      if (!allowedFiles.has(name) || typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024) throw new Error('Unsupported project file or file too large: ' + name);
      p.files[name] = text;
    }
    if (sample) p.sample = sample;
    if (Buffer.byteLength(JSON.stringify(p)) > 5 * 1024 * 1024) throw new Error('Project exceeds 5 MiB');
    p.revision += 1; await atomicJson(this.file(id), p);
    return { revision: p.revision, validation: validateFiles(p.files) };
    });
  }
  async preview(id, layout = 'full', variables, options) {
    const p = await this.get(id);
    const renderOptions={orientation:options?.orientation};
    let model;
    if(options?.deviceModel){
      const models=await this.client.execute('listModels',{});const palettes=await this.client.execute('listPalettes',{});
      model=models.data.data.find(m=>m.name===options.deviceModel);
      if(!model)throw new Error('Unknown deviceModel; choose a name from listModels.');
      const paletteId=options.palette || model.palette_ids[0];
      if(!model.palette_ids.includes(paletteId))throw new Error('Palette is not supported by this model.');
      const palette=palettes.data.data.find(p=>p.id===paletteId);
      if(!palette?.framework_class || !model.css?.classes)throw new Error('Model/palette lacks Framework metadata.');
      renderOptions.screenClasses=[...Object.values(model.css.classes),palette.framework_class];
    }else if(options?.palette)throw new Error('Choose deviceModel when selecting a palette.');
    const html = await renderPreview(p.files, layout, variables || p.sample, renderOptions);
    const filename = path.join(this.config.home, 'artifacts', identifier(id) + '-' + layout + '-' + crypto.randomUUID() + '.html');
    await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 }); await fs.writeFile(filename, html, { mode: 0o600 });
    return { path: filename, html, deviceModel:model?.name || 'OG baseline', proof: 'Local Liquid approximation using live Framework assets. TRMNL custom filters require remote preview; no physical device proof.' };
  }
  async export(id) {
    const p = await this.get(id); const validation = validateFiles(p.files);
    if (!validation.valid) return { exported: false, validation };
    const file = path.join(this.config.home, 'artifacts', identifier(id) + '-' + p.revision + '.zip');
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, zipSync(Object.fromEntries(Object.entries(p.files).map(([n, s]) => [n, strToU8(s)]))), { mode: 0o600 });
    return { path: file, validation };
  }
  async deploy(id, pluginSettingId, profile = 'default') {
    const project = await this.get(id); const validation = validateFiles(project.files);
    if (!validation.valid) return { deployed: false, validation };
    const result = await this.client.execute('importPluginSettingFiles', { profile, path: { plugin_setting_id: pluginSettingId }, body: { files: project.files } });
    return { deployed: true, result, validation, next: 'Start TRMNL previews for each of the four layouts and every intended device model. Attaching a plugin to a playlist is a separate action.' };
  }
  async compare(id, pluginSettingId, profile = 'default') {
    const p = await this.get(id);
    const remote = await this.client.execute('getPluginSettingFiles', { profile, path: { plugin_setting_id: pluginSettingId } });
    const files = remote.data?.data?.files || remote.data?.data;
    if (!files || typeof files !== 'object') throw new Error('Unexpected remote files response');
    return { layouts, files: [...new Set([...Object.keys(p.files), ...Object.keys(files)])].map(file => ({ file, same: p.files[file] === files[file], localBytes: Buffer.byteLength(p.files[file] || ''), remoteBytes: typeof files[file] === 'string' ? Buffer.byteLength(files[file]) : null })), note: 'Secret fields in remote settings may be redacted.' };
  }
}
