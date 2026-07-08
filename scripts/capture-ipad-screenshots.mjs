#!/usr/bin/env node
/**
 * Generate 13-inch iPad App Store screenshots (2048x2732) from the web build.
 * Companion to capture-screenshots.mjs (iPhone). Apple requires >=1 13-inch
 * iPad screenshot for universal builds; Apple validates dimensions, not device
 * pedigree, so Chromium at exact iPad pixels is accepted.
 *
 * Hero frames: we pin TMDB /discover to a SINGLE popular movie per capture and
 * hide the video player, so the app's own full-bleed cinematic backdrop layer
 * fills the tall iPad frame and always matches the on-screen title (no 16:9
 * letterboxing, no mismatched "next movie" peek).
 *
 * Usage:
 *   node scripts/capture-ipad-screenshots.mjs --section=heroes --count=4 --out=/abs/dir
 *   node scripts/capture-ipad-screenshots.mjs --section=extras --out=/abs/dir
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const URL = arg('url', 'http://127.0.0.1:4173/');
const SECTION = arg('section', 'heroes');
const COUNT = parseInt(arg('count', '4'), 10);
const OFFSET = parseInt(arg('offset', '0'), 10);
const OUT = arg('out', join(process.cwd(), 'assets', 'screenshots', '13-inch'));
const VW = 1024, VH = 1366, DPR = 2;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const safe = (s) => (s || 'movie').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
  });
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH }, deviceScaleFactor: DPR,
    isMobile: true, hasTouch: true, reducedMotion: 'reduce',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('trailer-roulette.onboarded', 'true'); } catch {}
    const css = [
      '.tr-next{display:none!important}',
      '.player-wrap{display:none!important}',
      '.tr-backdrop{animation:none!important;opacity:1!important;filter:brightness(0.74) saturate(1.08)!important}',
    ].join('');
    const st = document.createElement('style'); st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  });

  const page = await ctx.newPage();
  let fixed = null;               // when set, every /discover returns just this movie
  const pool = [];                // collected popular movies (for hero selection)
  page.on('response', async (r) => {
    if (fixed || !/\/3\/discover\/movie/.test(r.url())) return;
    try { const j = await r.json();
      for (const m of (j.results || [])) if (m.backdrop_path && m.title) pool.push(m);
    } catch {}
  });
  await page.route(/\/3\/discover\/movie/, (route) => {
    if (fixed) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ page: 1, total_pages: 1, total_results: 1, results: [fixed] }) });
    }
    const u = new global.URL(route.request().url());
    u.searchParams.set('sort_by', 'popularity.desc');
    u.searchParams.set('vote_count.gte', '3000');
    u.searchParams.set('include_adult', 'false');
    u.searchParams.set('page', '1');
    u.searchParams.delete('primary_release_date.gte');
    u.searchParams.delete('primary_release_date.lte');
    u.searchParams.delete('with_genres');
    route.continue({ url: u.toString() });
  });
  // Player is hidden for hero shots; block the embed so nothing autoplays
  // (keeps the CTA reading 'Play') and pages load faster.
  await page.route(/youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com/, r => r.abort());

  const shot = async (name) => { await page.screenshot({ path: join(OUT, name) }); console.log('saved', name); };
  const titleOf = async () => (await page.$eval('.tr-cardinfo h2', el => el.innerText).catch(() => ''));

  if (SECTION === 'heroes') {
    const poolPath = join(OUT, 'pool.json');
    let picks = [];
    if (existsSync(poolPath)) {
      picks = JSON.parse(readFileSync(poolPath, 'utf8'));
      console.log('loaded pool from cache:', picks.length);
    } else {
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      for (let i = 0; i < 12 && pool.length < 18; i++) await sleep(500);
      const seen = new Set();
      for (const m of pool) { if (!seen.has(m.id)) { seen.add(m.id); picks.push(m); } }
      writeFileSync(poolPath, JSON.stringify(picks));
      console.log('collected + cached pool:', picks.length);
    }
    picks = picks.slice(OFFSET);
    // Phase 2: one clean full-bleed backdrop per movie.
    let n = 0;
    for (const m of picks) {
      if (n >= COUNT) break;
      fixed = m;
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('.tr-cardinfo h2', { timeout: 15000 }).catch(() => {});
      await page.addStyleTag({ content: '.tr-next{display:none!important}.player-wrap{display:none!important}.player{display:none!important}.tr-backdrop{animation:none!important;opacity:1!important;filter:brightness(0.74) saturate(1.08)!important}' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await sleep(700);
      const t = await titleOf();
      if (!t) continue;
      n++;
      await shot(`hero-${String(n).padStart(2, '0')}-${safe(t)}.png`);
      console.log('   title:', t);
    }
  } else if (SECTION === 'extras') {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.tr-cardinfo h2', { timeout: 20000 }).catch(() => {});
    await sleep(4000);
    const modes = await page.$('button[aria-label="Open fun modes"]');
    if (modes) { await modes.click(); await sleep(900); await shot('extra-01-funmodes.png'); }
    const first = await page.$('.fun-item');
    if (first) { await first.click(); await sleep(1600); await shot('extra-02-mode.png'); }
  }
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
