#!/usr/bin/env node
/**
 * Logistica Sanchez — sync & checks for the static site (zero dependencies, Node >= 18).
 *
 * The HTML files in public/ ARE the website: Netlify publishes them as they are,
 * with no build step. This tool only keeps the shared parts consistent.
 *
 *   node tools/sync.mjs                 inject partials/*.html into every page, mark the
 *                                       active navigation item, rebuild public/sitemap.xml
 *   node tools/sync.mjs --check         validate only, write nothing (exit 1 on errors)
 *   node tools/sync.mjs --domain https://www.example.it
 *                                       switch the production domain in every file
 *
 * Partials are injected between markers, e.g.
 *   <!-- partial:header -->  …generated…  <!-- /partial:header -->
 * The current page comes from <body data-page="servizi/groupage">: links in a partial
 * carrying data-nav="servizi/groupage" get aria-current="page", and links carrying
 * the parent section (data-nav="servizi") get aria-current="true".
 * Tokens available in partials: {{year}}, {{site}}.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PARTIALS = join(ROOT, 'partials');
const CONFIG_PATH = join(ROOT, 'site.config.json');
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const SITE = config.url.replace(/\/+$/, '');

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const domainIdx = args.indexOf('--domain');

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

const rel = (p) => relative(ROOT, p).split(sep).join('/');

/** public/servizi/index.html -> https://site/servizi/ */
function urlFor(file) {
  let p = relative(PUBLIC, file).split(sep).join('/');
  if (p === 'index.html') return `${SITE}/`;
  if (p.endsWith('/index.html')) return `${SITE}/${p.slice(0, -'index.html'.length)}`;
  return `${SITE}/${p}`;
}

// ---------------------------------------------------------------- --domain
if (domainIdx !== -1) {
  const next = (args[domainIdx + 1] || '').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(next)) {
    console.error('Usage: node tools/sync.mjs --domain https://www.example.it');
    process.exit(1);
  }
  let changed = 0;
  for (const f of walk(PUBLIC, ['.html', '.xml', '.txt', '.webmanifest', '.json', '.js'])) {
    const s = readFileSync(f, 'utf8');
    if (s.includes(SITE)) {
      writeFileSync(f, s.split(SITE).join(next));
      changed++;
    }
  }
  writeFileSync(CONFIG_PATH, JSON.stringify({ ...config, url: next }, null, 2) + '\n');
  console.log(`Domain ${SITE} -> ${next} (${changed} files updated). Run "node tools/sync.mjs" next.`);
  process.exit(0);
}

// ---------------------------------------------------------------- partials
const partials = Object.fromEntries(
  config.partials.map((name) => [name, readFileSync(join(PARTIALS, `${name}.html`), 'utf8').trim()]),
);

function renderPartial(name, page) {
  let s = partials[name]
    .replaceAll('{{year}}', String(new Date().getFullYear()))
    .replaceAll('{{site}}', SITE);
  // Active state: exact page -> aria-current="page"; ancestor section -> aria-current="true".
  s = s.replace(/data-nav="([^"]+)"/g, (m, key) => {
    if (!page) return m;
    if (key === page) return `${m} aria-current="page"`;
    if (page.startsWith(`${key}/`)) return `${m} aria-current="true"`;
    return m;
  });
  return s;
}

const MARKER = /<!-- partial:([a-z0-9-]+) -->[\s\S]*?<!-- \/partial:\1 -->/g;

function syncPage(html) {
  const page = (html.match(/<body[^>]*\sdata-page="([^"]*)"/) || [])[1] || '';
  return html.replace(MARKER, (_, name) => {
    if (!partials[name]) throw new Error(`unknown partial "${name}"`);
    return `<!-- partial:${name} -->\n${renderPartial(name, page)}\n<!-- /partial:${name} -->`;
  });
}

// ---------------------------------------------------------------- checks
const sprite = existsSync(join(PUBLIC, 'img/icons.svg')) ? readFileSync(join(PUBLIC, 'img/icons.svg'), 'utf8') : '';
const iconIds = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
const usedIcons = new Set();
const titles = new Map();
const descriptions = new Map();

function attr(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

function resolveLocal(ref) {
  const clean = decodeURI(ref.split('#')[0].split('?')[0]);
  if (!clean || clean === '/') return join(PUBLIC, 'index.html');
  const p = join(PUBLIC, clean);
  if (clean.endsWith('/')) return join(p, 'index.html');
  return p;
}

function checkPage(file, html) {
  const name = rel(file);
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  const is404 = file.endsWith(`${sep}404.html`);

  if (!/<html lang="it"/.test(html)) err(name, 'missing <html lang="it">');
  const title = attr(html, /<title>([^<]*)<\/title>/);
  if (!title) err(name, 'missing <title>');
  else {
    if (title.length > 65) warn(name, `title is ${title.length} chars (keep <= 60-65): "${title}"`);
    if (!noindex) titles.set(title, [...(titles.get(title) || []), name]);
  }
  const desc = attr(html, /<meta name="description" content="([^"]*)"/);
  if (!desc) err(name, 'missing meta description');
  else {
    if (desc.length < 70 || desc.length > 165) warn(name, `description is ${desc.length} chars (aim for 120-160)`);
    if (!noindex) descriptions.set(desc, [...(descriptions.get(desc) || []), name]);
  }
  if (!noindex && !is404) {
    const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
    if (!canonical) err(name, 'missing canonical');
    else if (canonical !== urlFor(file)) err(name, `canonical ${canonical} != expected ${urlFor(file)}`);
    for (const p of ['og:title', 'og:description', 'og:url', 'og:image']) {
      if (!html.includes(`property="${p}"`)) warn(name, `missing ${p}`);
    }
    const ogUrl = attr(html, /<meta property="og:url" content="([^"]+)"/);
    if (ogUrl && canonical && ogUrl !== canonical) err(name, 'og:url differs from canonical');
  }
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) err(name, `expected exactly one <h1>, found ${h1}`);

  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt="/.test(m[0])) err(name, `<img> without alt: ${m[0].slice(0, 80)}`);
    if (!/\bwidth="/.test(m[0]) || !/\bheight="/.test(m[0])) warn(name, `<img> without width/height (CLS): ${m[0].slice(0, 80)}`);
  }
  for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    if (!/rel="[^"]*noopener/.test(m[0])) warn(name, `target=_blank without rel=noopener: ${m[0].slice(0, 80)}`);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1]);
    } catch (e) {
      err(name, `invalid JSON-LD: ${e.message}`);
    }
  }
  // Local references: href, src, srcset, imagesrcset, xlink/use refs, data-src.
  const refs = [];
  for (const m of html.matchAll(/\s(?:href|src|data-src|poster)="(\/[^"]*)"/g)) refs.push(m[1]);
  for (const m of html.matchAll(/\s(?:srcset|imagesrcset)="([^"]+)"/g)) {
    for (const part of m[1].split(',')) {
      const u = part.trim().split(/\s+/)[0];
      if (u.startsWith('/')) refs.push(u);
    }
  }
  for (const ref of refs) {
    if (ref.startsWith('//')) continue;
    const icon = ref.match(/^\/img\/icons\.svg#(.+)$/);
    if (icon) {
      usedIcons.add(icon[1]);
      if (!iconIds.has(icon[1])) err(name, `unknown icon #${icon[1]}`);
      continue;
    }
    const target = resolveLocal(ref);
    if (!existsSync(target)) err(name, `broken local link/asset: ${ref}`);
  }
  // Heading levels should not skip (h2 -> h4).
  let last = 0;
  for (const m of html.matchAll(/<h([1-6])[\s>]/g)) {
    const level = Number(m[1]);
    if (last && level > last + 1) warn(name, `heading jumps from h${last} to h${level}`);
    last = level;
  }
}

// ---------------------------------------------------------------- run
const pages = walk(PUBLIC, ['.html']).sort();
let outOfSync = 0;
let written = 0;

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  let next;
  try {
    next = syncPage(html);
  } catch (e) {
    err(rel(file), e.message);
    continue;
  }
  if (next !== html) {
    if (CHECK) {
      outOfSync++;
      err(rel(file), 'shared partials are out of date — run "node tools/sync.mjs"');
    } else {
      writeFileSync(file, next);
      written++;
    }
  }
  checkPage(file, CHECK ? html : next);
}

for (const [t, files] of titles) if (files.length > 1) warn(files.join(', '), `duplicate title "${t}"`);
for (const [d, files] of descriptions) if (files.length > 1) warn(files.join(', '), `duplicate description "${d.slice(0, 60)}…"`);

// ---------------------------------------------------------------- sitemap
function lastmod(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', file], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (out && !dirty) return out;
  } catch {
    /* not a git checkout: fall through */
  }
  return new Date().toISOString().slice(0, 10);
}

function priority(url) {
  const path = url.slice(SITE.length);
  if (path === '/') return '1.0';
  if (/^\/(privacy|cookie)\//.test(path)) return '0.3';
  const depth = path.split('/').filter(Boolean).length;
  return depth === 1 ? '0.8' : '0.6';
}

const entries = [];
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  if (/<meta name="robots" content="[^"]*noindex/.test(html) || file.endsWith(`${sep}404.html`)) continue;
  const loc = attr(html, /<link rel="canonical" href="([^"]+)"/);
  if (!loc) continue;
  entries.push({ loc, lastmod: lastmod(file), priority: priority(loc) });
}
entries.sort((a, b) => (a.loc === `${SITE}/` ? -1 : b.loc === `${SITE}/` ? 1 : a.loc.localeCompare(b.loc)));
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  entries
    .map((e) => `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n    <priority>${e.priority}</priority>\n  </url>`)
    .join('\n') +
  '\n</urlset>\n';
const sitemapPath = join(PUBLIC, 'sitemap.xml');
const currentSitemap = existsSync(sitemapPath) ? readFileSync(sitemapPath, 'utf8') : '';
const stripDates = (s) => s.replace(/<lastmod>[^<]*<\/lastmod>/g, '');
if (CHECK) {
  if (stripDates(currentSitemap) !== stripDates(sitemap)) err('public/sitemap.xml', 'out of date — run "node tools/sync.mjs"');
} else if (currentSitemap !== sitemap) {
  writeFileSync(sitemapPath, sitemap);
}

// ---------------------------------------------------------------- report
const unused = [...iconIds].filter((id) => !usedIcons.has(id));
for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(
  `\n${pages.length} pages, ${entries.length} in sitemap` +
    (CHECK ? `, ${outOfSync} out of sync` : `, ${written} updated`) +
    `, ${errors.length} errors, ${warnings.length} warnings` +
    (unused.length ? `\nunused icons in img/icons.svg (${unused.length}): ${unused.join(' ')}` : ''),
);
process.exit(errors.length ? 1 : 0);
