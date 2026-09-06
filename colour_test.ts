import { readFileSync } from 'node:fs';
const orig = globalThis.fetch;
// The app fetches 'data/...' relatively; Node's fetch rejects relative URLs.
globalThis.fetch = (async (u: any) => /^\.?\/?data\//.test(String(u))
    ? new Response(readFileSync('public/' + String(u).replace(/^\.?\//, ''), 'utf8'), { status: 200 })
    : orig(u)) as any;

const tree = await import('./src/data/loadTree.ts');
const { findLCA } = await import('./src/game/lca.ts');
await tree.loadDatabase();
const { nodeLookup, depthLookup, nameLookup, normaliseName } = tree;

const id = (n: string) => nameLookup[normaliseName(n)];
const answerId = id('Tyrannosaurus');
const answerDepth = Math.max(1, depthLookup[answerId]);

// the exact formula treeView uses
const closeness = (nid: number) => {
    const shared = nid === answerId ? answerId : findLCA(answerId, nid);
    return Math.max(0, Math.min(1, depthLookup[shared] / answerDepth));
};
const hue = (t: number) => 6 + t * 88;      // 6 = red, 94 = green
const describe = (t: number) => t < 0.25 ? 'RED' : t < 0.5 ? 'orange' : t < 0.75 ? 'yellow-green' : 'GREEN';

console.log(`answer = Tyrannosaurus (depth ${answerDepth})\n`);
const probes = ['Meganeura','Otodus','Mammuthus','Pteranodon','Triceratops','Diplodocus',
                'Spinosaurus','Allosaurus','Gallimimus','Velociraptor','Tarbosaurus','Tyrannosaurus'];
let prev = -1, monotonic = true;
for (const nm of probes) {
    const t = closeness(id(nm));
    const shared = id(nm) === answerId ? answerId : findLCA(answerId, id(nm));
    console.log(`  ${nm.padEnd(15)} shares ${nodeLookup[shared].scientific.padEnd(18)}`
      + ` closeness=${t.toFixed(2)}  hue=${hue(t).toFixed(0).padStart(3)}  ${describe(t)}`);
    if (t < prev - 1e-9) monotonic = false;
    prev = t;
}
console.log(`\nordered red -> green as guesses get closer: ${monotonic ? 'YES' : 'NO'}`);
console.log(`root (Animalia) closeness = ${closeness(tree.rootId).toFixed(2)} (should be 0.00 = reddest)`);
console.log(`answer closeness          = ${closeness(answerId).toFixed(2)} (should be 1.00 = greenest)`);

// a clade that joins two wrong guesses should be red-ish, not green
const arth = id('Meganeura');
const shared2 = findLCA(answerId, arth);
console.log(`\nclade joining two arthropod guesses -> ${nodeLookup[shared2].scientific}, closeness ${closeness(arth).toFixed(2)}`);
