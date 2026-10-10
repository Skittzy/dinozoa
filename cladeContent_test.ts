import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeClade, getCladeContent, getCladeImage, isSuitableCladeArticle, selectCladeImage } from './src/ui/cladeContent.ts';
import type { CladeContent, CladeImage } from './src/ui/cladeContent.ts';
import { fetchTaxonImage } from './src/ui/wiki.ts';
import type { TaxonImage } from './src/ui/wiki.ts';
import type { DinoNode } from './src/data/loadTree.ts';

const node = { id: 1, scientific: 'Rhinocerotidae', common: 'rhinos', rank: 'family',
    answer: false, children: [{}] } as DinoNode;
const parent = { ...node, scientific: 'Rhinocerotoidea' };
const article: TaxonImage = {
    imageUrl: null, fallbackUrl: null, extract: 'A Wikipedia description of rhinoceroses.',
    articleTitle: 'Rhinoceros', pageUrl: 'https://en.wikipedia.org/wiki/Rhinoceros',
    artist: null, fileUrl: null, imageTitle: null, licenseName: null, licenseUrl: null,
};
const profile = { wikiTitle: 'Rhinoceros' };
const local = { ...profile, summary: 'An original, reviewed description.',
    sources: [{ label: 'Rhino study', url: 'https://doi.org/10.1038/s42003-021-02170-6' }] };

assert.equal(describeClade(node, parent, local, article).kind, 'local');
assert.equal(describeClade(node, parent, local, null).text, local.summary);
assert.deepEqual(describeClade(node, parent, local, null).sources, local.sources);
assert.equal(describeClade(node, parent, profile, article).kind, 'wikipedia');
assert.equal(describeClade(node, parent, profile, article).text, article.extract);
assert.equal(node.scientific, 'Rhinocerotidae');

const wrong = { ...article, articleTitle: 'Perissodactyla' };
assert.equal(describeClade(node, parent, profile, wrong).kind, 'fallback');
assert.equal(isSuitableCladeArticle(node.scientific, profile, wrong), false);
assert.equal(describeClade(node, parent, profile, { ...article, articleType: 'disambiguation' }).kind, 'fallback');
assert.equal(describeClade(node, parent, undefined, article).kind, 'fallback');
assert.equal(describeClade(node, parent, profile, { ...article, extract: '' }).kind, 'fallback');
assert.equal(describeClade(node, parent, profile, { ...article, pageUrl: 'javascript:alert(1)' }).kind, 'fallback');
assert.equal(describeClade(node, parent, { ...local, sources: [] }, article).kind, 'wikipedia');
assert.deepEqual(describeClade(node, parent, undefined, null), {
    text: 'In Dinozoa’s classification, Rhinocerotidae is a subgroup of Rhinocerotoidea.',
    kind: 'fallback', sources: [],
});
assert.equal(describeClade(node, undefined, undefined, null).sources.length, 0);
assert.equal(isSuitableCladeArticle(node.scientific, { wikiTitle: false }, article), false);

const selectedImage: CladeImage = {
    imageUrl: 'https://upload.wikimedia.org/representative.jpg', fallbackUrl: null,
    artist: 'Example artist', imageTitle: 'Representative', fileUrl: 'https://commons.wikimedia.org/wiki/File:Representative.jpg',
    licenseName: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    caption: 'Representative member.', reviewNote: 'Temporary fix — review later.',
};
assert.equal(selectCladeImage(node.scientific, { wikiTitle: false }, null, selectedImage), selectedImage);
assert.equal(selectCladeImage(node.scientific, profile, wrong, selectedImage), selectedImage);
assert.equal(describeClade(node, parent, profile, wrong).kind, 'fallback', 'image permission must not approve a broader description');
assert.equal(selectCladeImage(node.scientific, profile, wrong), null, 'redirects need an explicit image pick');
assert.equal(selectCladeImage(node.scientific, profile, article), article, 'ordinary clade images remain the default');
assert.equal(selectCladeImage(node.scientific, profile, wrong, { ...selectedImage, imageUrl: 'javascript:alert(1)' }), null);

// Audit the shipped tree, rather than assuming a configured image belongs to its clade.
const imageEntries = JSON.parse(readFileSync('public/data/clade-images.json', 'utf8'));
const profiles: Record<string, CladeContent> = JSON.parse(readFileSync('public/data/clade-content.json', 'utf8'));
const cached = JSON.parse(readFileSync('public/data/wiki-cache.json', 'utf8'));
const clades = new Map<string, DinoNode>();
const descendants = (n: DinoNode): string[] => n.children.flatMap(c => [c.scientific, ...descendants(c)]);
const visit = (n: DinoNode) => { if (n.children.length) clades.set(n.scientific, n); n.children.forEach(visit); };
visit(JSON.parse(readFileSync('public/data/dinosaur-database.json', 'utf8')).root);
for (const [name, image] of Object.entries(imageEntries) as [string, any][]) {
    if (name.startsWith('_')) continue;
    assert.ok(clades.has(name), `${name}: image must refer to a clade`);
    for (const field of ['imageUrl', 'fallbackUrl', 'fileUrl', 'licenseUrl']) assert.match(image[field], /^https:\/\//, `${name}: ${field}`);
    for (const field of ['artist', 'imageTitle', 'licenseName', 'caption']) assert.ok(image[field]?.trim(), `${name}: ${field}`);
    assert.match(image.reviewNote, /Temporary fix.*review later/, `${name}: review marker`);
    if (image.selection === 'representative') {
        assert.ok(descendants(clades.get(name)!).includes(image.representative), `${name}: representative must belong to this clade`);
    } else {
        assert.equal(image.imageUrl, cached[name].imageUrl.split('?')[0], `${name}: keep the requested cached article image`);
    }
}
for (const [name] of clades) {
    const selected = selectCladeImage(name, profiles[name], cached[name] ?? null, imageEntries[name]);
    assert.ok(selected?.imageUrl, `${name}: every current clade must have an image`);
}

const originalFetch = globalThis.fetch;
const calls: string[] = [];
globalThis.fetch = async input => {
    const url = String(input); calls.push(url);
    if (url === 'data/clade-content.json') return new Response(readFileSync('public/data/clade-content.json', 'utf8'));
    if (url === 'data/clade-images.json') return new Response(readFileSync('public/data/clade-images.json', 'utf8'));
    if (url === 'data/image-overrides.json') return new Response('{}');
    if (url === 'data/wiki-cache.json') return new Response(JSON.stringify({
        Mammalia: { extract: 'Mammals.', articleTitle: 'Mammal',
            imageUrl: 'https://upload.wikimedia.org/mammals.jpg', pageUrl: 'https://en.wikipedia.org/wiki/Mammal' },
    }));
    if (url.endsWith('/Rhinoceros')) return new Response(JSON.stringify({
        extract: article.extract, titles: { canonical: 'Rhinoceros' },
        content_urls: { desktop: { page: article.pageUrl } },
    }));
    throw new Error('External service unavailable');
};
try {
    const actual = await getCladeContent('Rhinocerotidae');
    assert.equal(actual?.wikiTitle, 'Rhinoceros');
    const fetched = await fetchTaxonImage('Rhinocerotidae', false, [], actual?.wikiTitle || 'Rhinocerotidae');
    assert.equal(fetched.articleTitle, 'Rhinoceros');
    assert.ok(calls.some(c => c.endsWith('/Rhinoceros')));
    assert.ok(!calls.some(c => c.endsWith('/Rhinocerotidae')));
    const before = calls.length;
    await fetchTaxonImage('Mammalia', false, [], 'Mammal');
    assert.equal(calls.length, before, 'existing scientific-name cache survives a mapped title');
    const pelagiceti = await getCladeContent('Pelagiceti');
    assert.equal(pelagiceti?.wikiTitle, false);
    const pelagicetiImage = await getCladeImage('Pelagiceti');
    assert.ok(pelagicetiImage?.imageUrl);
    assert.equal(selectCladeImage('Pelagiceti', pelagiceti, null, pelagicetiImage), pelagicetiImage);
    await getCladeImage('Pelagiceti');
    assert.equal(calls.filter(c => c === 'data/clade-images.json').length, 1);
    assert.equal(describeClade({ ...node, scientific: 'Pelagiceti' }, parent, pelagiceti, null).kind, 'local');
    for (const name of ['Edmontosaurini', 'Dromaeosaurinae', 'Spinosaurinae', 'Abelisaurinae']) {
        const content = await getCladeContent(name);
        assert.equal(content?.wikiTitle, false, `${name}: a broader redirect is not an alternate title`);
        const selected = describeClade({ ...node, scientific: name }, parent, content, wrong);
        assert.equal(selected.kind, 'local');
        assert.equal(selected.text, content?.summary);
        assert.ok(selected.sources.length > 0);
        assert.ok(selected.sources.every(s => !s.url.includes('wikipedia.org')));
    }
    assert.equal(calls.filter(c => c === 'data/clade-content.json').length, 1);
} finally { globalThis.fetch = originalFetch; }
console.log('  ok  sourced local text, mapped articles, offline and redirect fallbacks');
