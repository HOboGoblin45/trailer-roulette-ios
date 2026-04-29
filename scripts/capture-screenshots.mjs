#!/usr/bin/env node
/**
 * Generate App Store screenshots from the deployed web build.
 *
 * Why Playwright instead of an iOS Simulator? We're a Windows shop with
 * no Mac. Playwright running Chromium at exact iPhone pixel dimensions
 * produces frames Apple accepts (Apple validates dimensions, not device
 * pedigree). Charlie can swap these for real iPhone screenshots later
 * if he wants — same filenames, same dimensions, drop-in replacement.
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs
 *   node scripts/capture-screenshots.mjs --url=http://localhost:5173
 *
 * Output:
 *   assets/screenshots/6.9-inch/01-shuffle.png       (1320×2868 — required)
 *   assets/screenshots/6.7-inch/01-shuffle.png       (1290×2796 — fallback)
 *   assets/screenshots/6.5-inch/01-shuffle.png       (1242×2688 — older)
 *   assets/screenshots/5.5-inch/01-shuffle.png       (1242×2208 — legacy)
 *   ...05 frames per device
 *
 * Requires: `npm install --no-save playwright @playwright/browser-chromium`
 *           (or run `npx playwright install chromium` once first)
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DEFAULT_URL = 'https://trailer-roulette.vercel.app/';
const argUrl = process.argv.find((a) => a.startsWith('--url='));
const URL = argUrl ? argUrl.slice(6) : DEFAULT_URL;

// Apple's accepted iPhone screenshot dimensions, current as of 2026 H1.
// One frame per device class — we produce 5 captures per device, indexed.
const DEVICES = [
  { label: '6.9-inch', width: 1320, height: 2868, dpr: 3 }, // iPhone 16 Pro Max
  { label: '6.7-inch', width: 1290, height: 2796, dpr: 3 }, // iPhone 15 Pro Max
  { label: '6.5-inch', width: 1242, height: 2688, dpr: 3 }, // iPhone XS Max
  { label: '5.5-inch', width: 1242, height: 2208, dpr: 3 }, // iPhone 8 Plus
];

// A representative pre-seeded watchlist so the Watchlist screen has
// real-looking content instead of an empty state. These are real TMDB
// movie ids and real poster paths — picking ones with broad recognition
// across decades so the screenshot doesn't feel cherry-picked.
const SEEDED_WATCHLIST = [
  { id: 27205, title: 'Inception', year: 2010, poster_path: '/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg', addedAt: '2026-04-20T18:00:00.000Z' },
  { id: 155,   title: 'The Dark Knight', year: 2008, poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg', addedAt: '2026-04-22T18:00:00.000Z' },
  { id: 680,   title: 'Pulp Fiction', year: 1994, poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', addedAt: '2026-04-23T18:00:00.000Z' },
  { id: 11,    title: 'Star Wars', year: 1977, poster_path: '/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg', addedAt: '2026-04-24T18:00:00.000Z' },
  { id: 13,    title: 'Forrest Gump', year: 1994, poster_path: '/h5J4W4veyxMXDMjeNxZI46TsHOb.jpg', addedAt: '2026-04-25T18:00:00.000Z' },
  { id: 24428, title: 'The Avengers', year: 2012, poster_path: '/RYMX2wcKCBAr24UyPD7xwmjaTn.jpg', addedAt: '2026-04-26T18:00:00.000Z' },
];

// Sequence of screens to capture. Each step is a function that prepares
// the page state, then we screenshot. Keep this ordered narratively —
// Apple shows screenshots in order in the App Store listing.
const FRAMES = [
  {
    name: '01-shuffle',
    setup: async (page) => {
      // Wait for first trailer to load and player iframe to be visible.
      await page.waitForSelector('.player iframe, .player-ios iframe', { timeout: 15_000 });
      await page.waitForTimeout(2_500); // give the iframe a moment to render
    },
  },
  {
    name: '02-up-next',
    setup: async (page) => {
      // Scroll to bottom so the Up Next list is in frame.
      await page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
      });
      await page.waitForTimeout(800);
    },
  },
  {
    name: '03-filters',
    setup: async (page) => {
      // Scroll back up so filter chips + meta + player are all visible together.
      await page.evaluate(() => {
        const filters = document.querySelector('.filters, [class*="filter"]');
        if (filters) filters.scrollIntoView({ block: 'end', behavior: 'instant' });
        else window.scrollTo({ top: 400, behavior: 'instant' });
      });
      await page.waitForTimeout(800);
    },
  },
  {
    name: '04-watchlist',
    setup: async (page) => {
      // Scroll to top first so the click hit-test isn't off-screen.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const heart = await page.$('button[aria-label^="Watchlist"]');
      if (heart) {
        await heart.click();
        await page.waitForTimeout(1200);
      }
    },
  },
  {
    name: '05-about',
    setup: async (page) => {
      // The About button is in the header; some flows route through a
      // close button on the watchlist screen first. Reset to home, then
      // click About.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      // If we're still on Watchlist (from previous frame), close it first.
      const close = await page.$('button[aria-label*="lose" i], button[aria-label*="ack" i]');
      if (close) {
        await close.click();
        await page.waitForTimeout(500);
      }
      const about = await page.$('button[aria-label="About"]');
      if (about) {
        await about.click();
        await page.waitForTimeout(800);
      }
    },
  },
];

async function captureForDevice(device, browser) {
  const dir = join(ROOT, 'assets', 'screenshots', device.label);
  await mkdir(dir, { recursive: true });

  const ctx = await browser.newContext({
    viewport: { width: device.width / device.dpr, height: device.height / device.dpr },
    deviceScaleFactor: device.dpr,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  // Seed localStorage *before* the app boots so the Watchlist screen
  // shows real-looking content. Storage keys come from app/src/lib/storage.js.
  await ctx.addInitScript(({ watchlist }) => {
    try {
      window.localStorage.setItem('trailer-roulette.watchlist', JSON.stringify(watchlist));
      window.localStorage.setItem('trailer-roulette.onboarded', JSON.stringify(true));
    } catch { /* noop */ }
  }, { watchlist: SEEDED_WATCHLIST });

  const page = await ctx.newPage();
  console.log(`[${device.label}] navigate → ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  for (const frame of FRAMES) {
    try {
      await frame.setup(page);
      const out = join(dir, `${frame.name}.png`);
      await page.screenshot({ path: out, fullPage: false });
      console.log(`[${device.label}] saved → ${frame.name}.png`);
    } catch (err) {
      console.warn(`[${device.label}] frame ${frame.name} failed: ${err.message}`);
    }
  }

  await ctx.close();
}

async function main() {
  console.log(`Capturing screenshots from ${URL}`);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const device of DEVICES) {
      await captureForDevice(device, browser);
    }
  } finally {
    await browser.close();
  }
  console.log('Done. See assets/screenshots/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
