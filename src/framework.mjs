import { parseFragment } from 'parse5';
import { Liquid } from 'liquidjs';
import YAML from 'yaml';

export const layouts = ['full', 'half_horizontal', 'half_vertical', 'quadrant'];
export const frameworkVersion = '3.4.0';
export const frameworkGuide = `Use TRMNL Framework 3.4. Private-plugin files contain exactly one div.layout, optionally followed by a sibling div.title_bar. The TRMNL platform supplies screen/view/mashup wrappers. Local and BYOS previews supply those wrappers themselves. Use framework utilities and semantic title/value/label/item/table components, not hardcoded hex colors or fixed screen dimensions. Use sm/md/lg size classes from device models, portrait variants, and only supported bit-depth variants. Responsive classes are size:orientation:bit-depth:utility. Layout utilities do not accept bit-depth. Dynamic means Liquid data and render-time responsive UI; physical e-paper does not run interactive web apps or continuous animation. Use data-overflow, data-overflow-counter, data-clamp, data-fit-value and data-value-format. Handle loading, empty, error and stale data. Use TRMNLCharts.watch/options/series and TRMNLPaint.px for charts; TRMNLPaint.watch/colors for custom drawing. Call terminalize() after injected content, await TRMNL_PLUGINS_READY for screenshots, inspect runtime errors. Theme-ready markup inherits its screen theme; do not inject a separate theme in a plugin. Escape external text. Keep secrets in password fields or middleware env references, never Liquid, URLs or sample data. Pin framework_version; test all four layouts, target models, orientation, theme and bit-depth. Lint is partial evidence, not rendered or physical-device proof. Sources: https://trmnl.com/framework/docs/3.4/structure https://trmnl.com/framework/docs/3.4/responsive https://trmnl.com/framework/docs/3.4/framework_runtime https://trmnl.com/framework/docs/3.4/v3_enhancement_guide`;

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function starterFiles(title, strategy = 'webhook') {
  const markup = `<div class="layout layout--col gap portrait:gap--small">
  {% if status == 'error' %}
  <span class="title" data-clamp="2">Unable to update</span>
  <span class="description" data-clamp="3">{{ error_message | default: 'The data source is unavailable. Try again later.' | escape }}</span>
  {% elsif status == 'loading' %}
  <span class="title">Waiting for the first update</span>
  {% elsif items.size > 0 %}
  {% if stale %}<span class="label label--inverted">Last known data · update delayed</span>{% endif %}
  <div class="flex flex--col gap w--full" data-overflow="true" data-overflow-counter="true">
    {% for item in items %}
    <div class="item">
      <div class="meta"><span class="index">{{ forloop.index }}</span></div>
      <div class="content">
        <span class="title title--small md:title--base" data-clamp="1">{{ item.title | escape }}</span>
        {% if item.value != nil %}<span class="value value--small md:value--base lg:value--large" data-fit-value="true">{{ item.value | escape }}</span>{% endif %}
        {% if item.description %}<span class="description" data-clamp="2">{{ item.description | escape }}</span>{% endif %}
      </div>
    </div>
    {% endfor %}
  </div>
  {% else %}
  <span class="title">Nothing to show yet</span>
  <span class="description" data-clamp="2">New information will appear after the next update.</span>
  {% endif %}
</div>
<div class="title_bar">
  <span class="title">${escapeHtml(title)}</span>
  <span class="instance">{{ updated_at | default: 'Waiting for data' | escape }}</span>
</div>
`;
  return { 'settings.yml': YAML.stringify({ name: title, strategy, framework_version: frameworkVersion, no_screen_padding: 'no', dark_mode: 'no' }), ...Object.fromEntries(layouts.map(l => [l + '.liquid', markup])), 'shared.liquid': '' };
}

function walk(node, visit) { visit(node); for (const c of node.childNodes || []) walk(c, visit); }
export function validateFiles(files) {
  const errors = []; const warnings = [];
  let settings;
  try { settings = YAML.parse(files['settings.yml'] || '', { maxAliasCount: 10 }); } catch { errors.push('settings.yml must be valid YAML.'); }
  if (!settings || typeof settings !== 'object') errors.push('settings.yml is required.');
  if (settings && !settings.framework_version) errors.push('Pin framework_version in settings.yml.');
  if (settings && !['webhook', 'polling', 'static', 'plugin_merge', 'none', 'async_polling'].includes(settings.strategy)) errors.push('Choose a supported private-plugin strategy.');
  if (settings?.polling_url && /[?&](key|token|api_key)=/i.test(settings.polling_url)) errors.push('Polling credentials must use password custom fields; do not embed them in URLs.');
  const liquid = new Liquid({ strictFilters: false, ownPropertyOnly: true });
  for (const layout of layouts) {
    const name = layout + '.liquid'; const markup = files[name];
    if (!markup?.trim()) { errors.push(`${name}: provide this layout.`); continue; }
    try { liquid.parse((files['shared.liquid'] || '') + markup); } catch(e) { errors.push(`${name}: Liquid parse error: ${e.message}`); }
    const fragment = parseFragment(markup); const layoutNodes = [];
    walk(fragment, node => {
      const attrs = Object.fromEntries((node.attrs || []).map(a => [a.name, a.value])); const classes = (attrs.class || '').split(/\s+/);
      if (classes.includes('layout')) layoutNodes.push(node);
      if (classes.some(c => /^(screen|view|mashup)(--|$)/.test(c))) errors.push(`${name}: TRMNL provides screen/view/mashup wrappers; remove them from plugin markup.`);
      if (attrs.style && /(?:#[\da-f]{3,8}\b|rgba?\(|(?:width|height)\s*:\s*\d+px)/i.test(attrs.style)) errors.push(`${name}: replace hardcoded colors/dimensions with framework utilities or tokens.`);
      if (['input', 'button', 'select', 'textarea'].includes(node.tagName) || Object.keys(attrs).some(k => /^on(click|change|submit|input)$/.test(k))) errors.push(`${name}: physical screens cannot operate interactive form controls.`);
      if (node.tagName === 'img' && !('alt' in attrs)) warnings.push(`${name}: add image alt text.`);
      for (const c of classes) if (/(?:1|2|4)bit:(?:flex|gap|grid|layout|rounded|w|h|p|m)--/.test(c)) errors.push(`${name}: ${c} uses an unsupported bit-depth variant.`);
    });
    if (layoutNodes.length !== 1 || layoutNodes[0]?.tagName !== 'div') errors.push(`${name}: use exactly one div.layout.`);
    if (layoutNodes[0] && !fragment.childNodes.includes(layoutNodes[0])) errors.push(`${name}: div.layout must be at the plugin root.`);
    if (!/data-(overflow|clamp|fit-value|value-fit|table-limit|content-max-height)/.test(markup)) warnings.push(`${name}: use Framework runtime fitting/overflow controls for variable data.`);
    if (!/\{%\s*(if|unless|case)\b/.test(markup)) warnings.push(`${name}: include conditional empty/error states.`);
    if (!/\b(md:|lg:|portrait:)/.test(markup)) warnings.push(`${name}: consider device-responsive utilities.`);
    if (/Highcharts\.chart/.test(markup) && !/TRMNLCharts\.watch/.test(markup)) errors.push(`${name}: wrap charts in TRMNLCharts.watch and use its device/theme-aware options.`);
    if (/\b(?:setInterval|requestAnimationFrame)\s*\(/.test(markup)) warnings.push(`${name}: render-time animation must settle before screenshot capture.`);
    if (/\b(?:trmnl_|user_)[a-zA-Z0-9_-]{16,}/.test(markup)) errors.push(`${name}: apparent credential in markup.`);
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)], scope: 'Static structure and selected framework rules only. Test TRMNL previews, actual data, models, orientation, themes and runtime readiness before claiming compatibility.' };
}

export async function renderPreview(files, layout, variables, { screenClasses = ['screen--og','screen--md','screen--density-1x','screen--1bit'], orientation = 'landscape' } = {}) {
  if (!layouts.includes(layout)) throw new Error('Unknown layout');
  if (!Array.isArray(screenClasses) || screenClasses.some(c=>!/^screen--[a-z0-9_-]+$/.test(c)) || !['landscape', 'portrait'].includes(orientation)) throw new Error('Invalid preview device/orientation');
  const noFilesystem={resolve:()=>{throw new Error('Local template file includes are disabled; use shared.liquid.');},readFile:async()=>{throw new Error('File reads disabled');},readFileSync:()=>{throw new Error('File reads disabled');},exists:async()=>false,existsSync:()=>false};
  const liquid = new Liquid({ fs:noFilesystem, relativeReference:false, strictFilters: true, ownPropertyOnly: true, jsTruthy: false, renderLimit: 2000, parseLimit: 2 * 1024 * 1024, memoryLimit: 10 * 1024 * 1024 });
  let rendered;
  try { rendered = await liquid.parseAndRender((files['shared.liquid'] || '') + files[layout + '.liquid'], variables); }
  catch (e) { throw new Error(`Local Liquid preview: ${e.message}. TRMNL-specific filters need the server-side renderMarkup tool.`); }
  const view = `<div class="view view--${layout}">${rendered}</div>`;
  const mashup = layout === 'full' ? view : `<div class="mashup mashup--${layout === 'quadrant' ? '2x2' : layout === 'half_vertical' ? '1Lx1R' : '1Tx1B'}">${view}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TRMNL local preview</title><link rel="stylesheet" href="https://trmnl.com/css/${frameworkVersion}/plugins.css"><script src="https://trmnl.com/js/${frameworkVersion}/plugins.js"></script></head><body class="environment trmnl"><div class="screen ${screenClasses.join(' ')}${orientation === 'portrait' ? ' screen--portrait' : ''}">${mashup}</div></body></html>`;
}
