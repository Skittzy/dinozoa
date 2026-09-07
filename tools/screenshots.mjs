// screenshots.mjs — regenerate the three README screenshots from a real game.
//
// The point of doing this in a script rather than by hand is that the answer
// changes every day, so a hardcoded set of guesses rots overnight. This works out
// today's answer from the same data and the same algorithm the game uses, then
// picks one guess far from it and one right beside it, so the tree always spans
// red to green no matter which animal is up.
//
// Nothing here is a source of truth: the epoch is READ OUT of dailyAnimal.ts
// rather than repeated, because a second copy of the launch date is exactly how
// the header ended up advertising the wrong one.
//
// USAGE — with `npm run dev` already running in another terminal:
//
//   npm i -D playwright
//   npx playwright install chromium      # once; skipped if you already have it
//   node tools/screenshots.mjs
//   npm un -D playwright
//
// It prefers a browser already on the machine (Chrome, then Edge) and only falls
// back to Playwright's own Chromium, so on a machine with Chrome installed the
// install step is a no-op.

import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = process.env.DINOZOA_URL ?? 'http://localhost:5173';
const OUT = join(ROOT, 'docs');

// ---------- work out today's answer, exactly as the game does ----------

const src = readFileSync(join(ROOT, 'src/game/dailyAnimal.ts'), 'utf8');
const m = src.match(/const EPOCH = Date\.UTC\((\d+),\s*(\d+),\s*(\d+)\)/);
if (!m) throw new Error('could not read EPOCH out of dailyAnimal.ts');
const EPOCH = Date.UTC(+m[1], +m[2], +m[3]);

const db = JSON.parse(readFileSync(join(ROOT, 'public/data/dinosaur-database.json'), 'utf8'));
const nodes = new Map();
const parent = new Map();
(function walk(n, p) {
    nodes.set(n.id, n);
    if (p !== null) parent.set(n.id, p);
    for (const c of n.children ?? []) walk(c, n.id);
})(db.root, null);

const label = (n) => n.common && n.common !== n.scientific ? n.common : n.scientific;
const isLeaf = (n) => !(n.children?.length);

function mulberry32(seed) {
    return () => {
        let t = (seed += 0x6D2B79F5) >>> 0;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function todaysAnswerId(now = new Date()) {
    const pool = [...nodes.values()].filter((n) => isLeaf(n) && n.answer).map((n) => n.id).sort((a, b) => a - b);
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const day = Math.floor((utcMidnight - EPOCH) / 86400000);
    const cycle = Math.floor(day / pool.length);
    const position = ((day % pool.length) + pool.length) % pool.length;
    const rnd = mulberry32(cycle + 1);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool[position];
}

const chain = (id) => { const out = [id]; while (parent.has(id)) { id = parent.get(id); out.push(id); } return out; };
function lca(a, b) {
    const seen = new Set(chain(a));
    for (const id of chain(b)) if (seen.has(id)) return id;
    return db.root.id;
}

const answerId = todaysAnswerId();
const answer = nodes.get(answerId);

// A sibling if there is one, otherwise the closest other leaf — this is the guess
// that paints the tree green.
const near = (() => {
    let scope = parent.get(answerId);
    while (scope !== undefined) {
        const kin = [...nodes.values()]
            .filter((n) => isLeaf(n) && n.id !== answerId && chain(n.id).includes(scope));
        if (kin.length) return kin.sort((a, b) => chain(b.id).length - chain(a.id).length)[0];
        scope = parent.get(scope);
    }
    throw new Error('no relative found');
})();

// Something whose only common ancestor is the root — the red end of the scale.
const far = [...nodes.values()]
    .filter((n) => isLeaf(n) && n.answer && lca(n.id, answerId) === db.root.id)[0]
    ?? [...nodes.values()].filter((n) => isLeaf(n) && n.id !== answerId && n.id !== near.id)[0];

console.log(`answer: ${answer.scientific}`);
console.log(`  far  guess: ${label(far)}`);
console.log(`  near guess: ${label(near)}`);

// ---------- drive it ----------

// Prefer a browser the machine already has; fall back to Playwright's Chromium.
// Any of them renders this page identically — it is a static site with no
// browser-specific code — so this is purely about not making anyone download
// 150MB they may not need.
async function launch() {
    for (const channel of ['chrome', 'msedge']) {
        try { return await chromium.launch({ channel }); } catch { /* try the next */ }
    }
    try {
        return await chromium.launch();
    } catch (err) {
        console.error('\nNo usable browser found. Run:  npx playwright install chromium\n');
        throw err;
    }
}
const browser = await launch();
mkdirSync(OUT, { recursive: true });

async function play(page, guesses) {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    // The tutorial opens itself on a first visit; every context here is fresh.
    const close = page.locator('#howto-close');
    if (await close.isVisible().catch(() => false)) await close.click();
    for (const g of guesses) {
        await page.fill('#guess-input', g);
        await page.click('#guess-btn');
        await page.waitForTimeout(900);          // the tree animates in
    }
    // The whole reason for regenerating these: wait for the panel's PHOTO.
    //
    // Waiting for any <img> is not enough. The panel shows a bone placeholder while
    // the real picture is fetched, and that placeholder is itself a fully loaded
    // image — so a naive complete/naturalWidth check passes instantly and captures
    // the placeholder. Wait specifically for a Wikimedia-hosted source.
    await page.waitForFunction(() => {
        const img = document.querySelector('#lca-panel img');
        return !!img && /wikimedia|wikipedia/.test(img.currentSrc || img.src)
            && img.complete && img.naturalWidth > 0;
    }, null, { timeout: 25000 }).catch(() => console.warn('  ! panel photo did not load in time'));
    await page.waitForTimeout(400);
}

// 1 + 2: desktop, mid-game then the win screen.
// reducedMotion is not a nicety here, it is what makes the tree appear at all.
// Every node except the root starts at opacity 0 and is faded in by a SMIL
// <animate> whose begin time is relative to the document timeline; by the time a
// scripted run submits its guesses those times are long past, the animations never
// activate, and the screenshot catches an empty tree with a lone root. Under
// prefers-reduced-motion the renderer skips the animation and paints the nodes
// solid, which is exactly what a still image wants.
//
// deviceScaleFactor stays at 1 on purpose: the page background is a fine sandstone
// grain, which is high-entropy noise that PNG cannot compress. A 2x capture of it
// tripled the file size for images GitHub renders at ~880px wide anyway.
const desktop = await browser.newContext({
    viewport: { width: 1280, height: 880 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
});
const page = await desktop.newPage();
await play(page, [far.scientific, near.scientific]);
await page.screenshot({ path: join(OUT, 'screenshot-game.png') });
console.log('wrote docs/screenshot-game.png');

await page.fill('#guess-input', answer.scientific);
await page.click('#guess-btn');
await page.waitForSelector('#modal.open', { timeout: 10000 });
await page.waitForTimeout(1800);                 // modal image + count-up
await page.screenshot({ path: join(OUT, 'screenshot-win.png') });
console.log('wrote docs/screenshot-win.png');
await desktop.close();

// 3: the same game on a phone. A fresh context so the day's saved progress is not
// restored and the game actually replays.
const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 '
             + '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const phone = await mobile.newPage();
await play(phone, [far.scientific, near.scientific]);
// The in-game scroll-to-tree already ran, but pin it explicitly so the framing
// does not depend on how far that happened to travel.
await phone.locator('.tree-frame').scrollIntoViewIfNeeded();
await phone.waitForTimeout(500);
await phone.screenshot({ path: join(OUT, 'screenshot-mobile.png') });
console.log('wrote docs/screenshot-mobile.png');
await mobile.close();

await browser.close();

const { statSync } = await import('node:fs');
console.log('');
for (const f of ['screenshot-game.png', 'screenshot-win.png', 'screenshot-mobile.png']) {
    console.log(`  ${f.padEnd(24)} ${Math.round(statSync(join(OUT, f)).size / 1024)} KB`);
}
console.log('\ndone — open docs/ and check the tree is populated and the photos loaded');
