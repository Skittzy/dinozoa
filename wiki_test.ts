// wiki_test.ts — tests the image-picking heuristic in ui/wiki.ts.
//
// Filename scoring, curated-image integration and attribution are checked offline.

import { scoreImage, MIN_ACCEPT, isRedirect, fetchTaxonImage } from './src/ui/wiki.ts';
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;

function ok(label: string, cond: boolean): void {
    if (cond) { pass++; console.log('  ok  ' + label); }
    else { fail++; console.log('  FAIL ' + label); }
}

function beats(life: string, fossil: string): void {
    const a = scoreImage(life, 3);
    const b = scoreImage(fossil, 0);   // fossil gets the better page position on purpose
    ok(`"${life}" (${a}) beats "${fossil}" (${b})`, a > b);
}

console.log('\n1) life restorations score positive');
for (const f of [
    'File:Tyrannosaurus_rex_life_restoration.jpg',
    'File:Triceratops_BW.jpg',
    'File:Coelophysis_NT_small.jpg',
    'File:Stegosaurus_stenops_reconstruction.png',
    'File:Spinosaurus_by_Durbed.jpg',
    'File:Mammuthus_primigenius_restoration.jpg',
    'File:Quetzalcoatlus_artist_impression.jpg',
]) ok(`${f.slice(5, 44)} > 0`, scoreImage(f, 4) > 0);

console.log('\n2) bones, diagrams and site furniture score negative');
for (const f of [
    'File:Tyrannosaurus_rex_skeleton_AMNH.jpg',
    'File:Triceratops_skull_front.jpg',
    'File:Allosaurus_holotype_specimen.jpg',
    'File:Spinosaurus_size_comparison.svg',
    'File:Dinosaur_footprint_track.jpg',
    'File:Stegosaurus_vertebra_detail.jpg',
    'File:Commons-logo.svg',
    'File:Diplodocus_distribution_map.png',
    'File:Velociraptor_teeth_closeup.jpg',
]) ok(`${f.slice(5, 44)} <= 0`, scoreImage(f, 0) <= 0);

console.log('\n3) a restoration beats a fossil even from further down the page');
beats('File:Triceratops_life_restoration.jpg', 'File:Triceratops_skeleton_mount.jpg');
beats('File:Ankylosaurus_BW.jpg', 'File:Ankylosaurus_holotype_skull.jpg');
beats('File:Smilodon_by_Mauricio_Anton.jpg', 'File:Smilodon_fossil_La_Brea.jpg');
beats('File:Dimetrodon_NT.jpg', 'File:Dimetrodon_skeleton_cast.jpg');

console.log('\n4) non-image and vector files are rejected outright');
ok('.svg rejected', scoreImage('File:Anything_at_all.svg', 0) === -100);
ok('.ogg rejected', scoreImage('File:Pronunciation.ogg', 0) === -100);
ok('.pdf rejected', scoreImage('File:Paper.pdf', 0) === -100);

console.log('\n5) a neutral photo still beats nothing, but loses to a restoration');
ok('neutral name scores > 0', scoreImage('File:Iguanodon_in_museum_hall.jpg', 1) > 0);
ok('restoration outranks neutral',
    scoreImage('File:Iguanodon_restoration.jpg', 8) > scoreImage('File:Iguanodon_in_museum_hall.jpg', 1));

console.log('\n6) an ambiguous name containing both signals is treated as a fossil');
ok('"life_size_skeleton" is not chosen',
    scoreImage('File:Brachiosaurus_life_size_skeleton.jpg', 0) <= 0);


console.log('\n7) a 3D render is preferred over a plain illustration of the same animal');
ok('render beats plain restoration',
    scoreImage('File:Tyrannosaurus_3D_render.jpg', 5) > scoreImage('File:Tyrannosaurus_restoration.jpg', 5));
ok('render still beats a skeleton',
    scoreImage('File:Triceratops_digital_model.jpg', 9) > scoreImage('File:Triceratops_skeleton.jpg', 0));
ok('plain illustration still scores positive (the intended fallback)',
    scoreImage('File:Stegosaurus_life_restoration.png', 4) > 0);
ok('a MODEL of a skeleton is still rejected',
    scoreImage('File:Model_of_a_Diplodocus_skeleton.jpg', 0) <= 0);
ok('a rendered skull is still rejected',
    scoreImage('File:Allosaurus_skull_3d_render.jpg', 0) <= 0);

console.log('\n8) an image of a RELATIVE is rejected — the bug found in the wild');
// Wikipedia taxon articles carry pictures of related genera. Before the taxon-name
// check these outscored the correct image, because a filename like "Alioramus Life
// Restoration" matches more lifelike patterns than "Tyrannosaurus_rex_restoration".
const wrongAnimal: Array<[string, string[], string]> = [
    ['Velociraptor',  ['Velociraptor'],                    'File:Achillobator reconstruction.png'],
    ['Tyrannosaurus', ['Tyrannosaurus'],                   'File:Alioramus Life Restoration.jpg'],
    ['Procoptodon',   ['Procoptodon', 'giant kangaroo'],   'File:Ekaltadeta ima NT.jpg'],
    ['Smilodon',      ['Smilodon', 'saber-toothed cat'],   'File:Homotherium life reconstruction.png'],
    ['Carnotaurus',   ['Carnotaurus'],                     'File:Alioramus Life Restoration.jpg'],
];
for (const [taxon, names, file] of wrongAnimal) {
    ok(`${taxon}: rejects ${file.slice(5, 40)}`, scoreImage(file, 6, names) < 0);
}

console.log('\n9) an image of the RIGHT animal is still accepted');
const rightAnimal: Array<[string, string[], string]> = [
    ['Tyrannosaurus', ['Tyrannosaurus'],              'File:Tyrannosaurus_rex_restoration.jpg'],
    ['Velociraptor',  ['Velociraptor'],               'File:Velociraptor_mongoliensis_life_restoration.jpg'],
    ['Smilodon',      ['Smilodon'],                   'File:Smilodon_by_Mauricio_Anton.jpg'],
    ['Otodus',        ['Otodus', 'megalodon'],        'File:Megalodon_life_restoration.jpg'],
    ['Coelodonta',    ['Coelodonta', 'woolly rhino'], 'File:Woolly_rhino_restoration.jpg'],
];
for (const [taxon, names, file] of rightAnimal) {
    ok(`${taxon}: accepts ${file.slice(5, 44)}`, scoreImage(file, 6, names) > 0);
}
ok('the right animal now outranks the better-named wrong one',
    scoreImage('File:Tyrannosaurus_rex_restoration.jpg', 6, ['Tyrannosaurus'])
    > scoreImage('File:Alioramus Life Restoration.jpg', 6, ['Tyrannosaurus']));
ok('short names cannot match by accident',
    scoreImage('File:Alioramus_restoration.jpg', 0, ['Rex']) < 0);
ok('with no names supplied the check is skipped (generic scoring still works)',
    scoreImage('File:Anything_restoration.jpg', 0) > 0);

console.log('\n10) the right animal, but the wrong KIND of picture');
// All three of these are genuinely OF the named animal, which is why the taxon
// name check let them through. They were reported from the live site.
const wrongKind: Array<[string, string[], string, string]> = [
    ['Carnotaurus',   ['Carnotaurus'],   'File:Robustly modeled tail of Carnotaurus.png', 'a tail-muscle diagram'],
    ['Smilodon',      ['Smilodon'],      'File:Huellas de Smilodon.jpg',                  'footprints, Spanish title'],
    ['Smilodon',      ['Smilodon'],      'File:Smilodon icnitas Grupopaleowiki.jpg',      'trackway, Spanish title'],
    ['Tyrannosaurus', ['Tyrannosaurus'], 'File:King Kong 1933 Tyrannosaurus fight.jpg',   'a film still'],
    ['Tyrannosaurus', ['Tyrannosaurus'], 'File:Tyrannosaurus statue museum.jpg',          'a statue'],
    ['Triceratops',   ['Triceratops'],   'File:Triceratops horn detail.jpg',              'one horn'],
    ['Stegosaurus',   ['Stegosaurus'],   'File:Stegosaurus forelimb anatomy.jpg',         'one limb'],
    ['Velociraptor',  ['Velociraptor'],  'File:Velociraptor Jurassic Park prop.jpg',      'a film prop'],
];
for (const [taxon, names, file, why] of wrongKind) {
    ok(`${taxon}: rejects ${why}`, scoreImage(file, 4, names) < MIN_ACCEPT);
}

console.log('\n11) "no signal either way" no longer squeaks through on position');
// This was the real hole: a bare filename scored 6 from the position tiebreak
// alone, which is how a King Kong still won. Uncertainty must fall back to the
// article's lead image, which a Wikipedia editor chose on purpose.
ok('a bare "Tyrannosaurus.jpg" does not beat the lead image',
    scoreImage('File:Tyrannosaurus.jpg', 0, ['Tyrannosaurus']) < MIN_ACCEPT);
ok('a real restoration still clears the bar',
    scoreImage('File:Tyrannosaurus_restoration.jpg', 8, ['Tyrannosaurus']) >= MIN_ACCEPT);
ok('"model" no longer counts as 3D art',
    scoreImage('File:Modeled skeleton of Diplodocus.jpg', 0, ['Diplodocus']) < MIN_ACCEPT);

console.log('\n12) Wikipedia redirects are detected, not silently absorbed');
// Minor clades often have no article of their own. The REST endpoint follows the
// redirect without saying so, which put Tetanurae's text under the Avetheropoda
// heading and made the card look broken.
ok('Avetheropoda -> Tetanurae is a redirect', isRedirect('Avetheropoda', 'Tetanurae'));
ok('Otodus -> Otodus megalodon is a redirect', isRedirect('Otodus', 'Otodus megalodon'));
ok('same title is not a redirect', !isRedirect('Tetanurae', 'Tetanurae'));
ok('case differences are not a redirect', !isRedirect('Amniota', 'amniota'));
ok('underscores are not a redirect', !isRedirect('Haast s eagle', 'Haast_s_eagle'));
ok('a missing title is not a redirect', !isRedirect('Thyreophora', null));

// --- endless accuracy label -------------------------------------------------
import { accuracyLabel, imageCreditHtml } from './src/ui/render.ts';

console.log('\n13) endless accuracy is suppressed until a run means something');
ok('0 rounds  -> dash',  accuracyLabel(0, 0) === '—');
ok('1/1       -> dash',  accuracyLabel(1, 1) === '—');
ok('2/4       -> dash',  accuracyLabel(2, 4) === '—');
ok('3/5       -> 60%',   accuracyLabel(3, 5) === '60%');
ok('9/14      -> 64%',   accuracyLabel(9, 14) === '64%');
ok('0/10      -> 0%',    accuracyLabel(0, 10) === '0%');
ok('10/10     -> 100%',  accuracyLabel(10, 10) === '100%');

console.log('\n14) curated images retain article context and their own attribution');
const originalFetch = globalThis.fetch;
const calls: string[] = [];
const image = {
    imageUrl: 'https://upload.wikimedia.org/curated-960.png',
    fallbackUrl: 'https://upload.wikimedia.org/curated-500.png',
    imageTitle: 'Animal restoration', artist: 'Current artist',
    fileUrl: 'https://commons.wikimedia.org/wiki/File:Animal_restoration.png',
    licenseName: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
};
const article = {
    extract: 'The cached article description.', articleTitle: 'Cached article',
    pageUrl: 'https://en.wikipedia.org/wiki/Cached_article',
    imageUrl: 'https://upload.wikimedia.org/old-image.png', artist: 'Previous artist',
};
globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (url === 'data/image-overrides.json') return json({
        CachedLeaf: image, UncachedLeaf: image, OfflineLeaf: image, InvalidSummaryLeaf: image,
        NoArtistLeaf: { imageUrl: image.imageUrl },
    });
    if (url === 'data/wiki-cache.json') return json({
        CachedLeaf: article, NoArtistLeaf: article,
        TextOnlyClade: { extract: 'A cached description without an image.' },
    });
    if (url.endsWith('/TextOnlyClade')) return json({
        thumbnail: { source: 'https://upload.wikimedia.org/clade-plate.jpg' },
    });
    if (url.endsWith('/UncachedLeaf')) return json({
        extract: 'A freshly fetched description.', titles: { canonical: 'UncachedLeaf' },
        content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/UncachedLeaf' } },
    });
    if (url.endsWith('/InvalidSummaryLeaf')) return new Response('invalid JSON', { status: 200 });
    if (url.endsWith('/LiveLeaf')) return json({
        extract: 'Live article.', thumbnail: { source: 'https://upload.wikimedia.org/lead-bone.jpg' },
    });
    if (url.includes('generator=images') && url.includes('titles=LiveLeaf')) return json({
        query: { pages: { '1': {
            title: 'File:LiveLeaf restoration.jpg', imageinfo: [{
                thumburl: 'https://upload.wikimedia.org/live-thumb.jpg',
                url: 'https://upload.wikimedia.org/live-original.jpg',
                descriptionurl: image.fileUrl,
                extmetadata: {
                    Artist: { value: 'Live artist' }, LicenseShortName: { value: 'CC BY 4.0' },
                    LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' },
                },
            }],
        } } },
    });
    return new Response('', { status: 503 });
};
try {
    const leaf = await fetchTaxonImage('CachedLeaf', true);
    ok('curated image wins over the cached image', leaf.imageUrl === image.imageUrl);
    ok('cached article text survives the image override', leaf.extract === article.extract);
    ok('cached article identity and link survive',
        leaf.articleTitle === article.articleTitle && leaf.pageUrl === article.pageUrl);
    ok('credits belong to the curated image',
        leaf.artist === image.artist && leaf.licenseUrl === image.licenseUrl);
    ok('curated fallback remains the same artwork', leaf.fallbackUrl === image.fallbackUrl);
    ok('a complete cache requires no Wikipedia request', calls.length === 2);

    const clade = await fetchTaxonImage('CachedLeaf', false);
    ok('clade mode ignores the animal override', clade.imageUrl === article.imageUrl);
    const textOnly = await fetchTaxonImage('TextOnlyClade', false);
    ok('a cached description without an image still fetches the clade lead image',
        textOnly.imageUrl === 'https://upload.wikimedia.org/clade-plate.jpg'
        && textOnly.extract === 'A cached description without an image.');

    const uncached = await fetchTaxonImage('UncachedLeaf', true);
    ok('uncached article text is fetched alongside a curated image',
        uncached.extract === 'A freshly fetched description.' && uncached.imageUrl === image.imageUrl);
    ok('a curated animal does not run automatic image selection',
        !calls.some((url) => url.includes('generator=images')));
    const before = calls.length;
    await fetchTaxonImage('UncachedLeaf', true);
    ok('repeat lookups use the in-memory cache', calls.length === before);

    const offline = await fetchTaxonImage('OfflineLeaf', true);
    ok('a failed summary does not remove a curated image or its credits',
        offline.imageUrl === image.imageUrl && offline.artist === image.artist && offline.extract === null);
    const invalid = await fetchTaxonImage('InvalidSummaryLeaf', true);
    ok('an invalid summary does not remove a curated image', invalid.imageUrl === image.imageUrl);
    const missingArtist = await fetchTaxonImage('NoArtistLeaf', true);
    ok('an override never inherits the old image artist', missingArtist.artist === null);

    const live = await fetchTaxonImage('LiveLeaf', true);
    ok('unmatched animals still select a restoration live',
        live.imageUrl === 'https://upload.wikimedia.org/live-thumb.jpg');
    ok('live fallback uses the same art instead of a differently credited lead image',
        live.fallbackUrl === 'https://upload.wikimedia.org/live-original.jpg');
    ok('live image credits also carry the licence', live.licenseName === 'CC BY 4.0');
} finally {
    globalThis.fetch = originalFetch;
}

console.log('\n15) image credits include titles and licence links safely');
const credit = imageCreditHtml(image);
ok('credit names the artwork and artist', credit.includes(image.imageTitle) && credit.includes(image.artist));
ok('credit links the original file and licence', credit.includes(image.fileUrl) && credit.includes(image.licenseUrl));
const escapedCredit = imageCreditHtml({ ...image, artist: '<script>artist</script>', licenseUrl: 'javascript:alert(1)' });
ok('credit text is escaped', escapedCredit.includes('&lt;script&gt;') && !escapedCredit.includes('<script>'));
ok('credit links cannot run JavaScript', !escapedCredit.includes('javascript:'));

console.log('\n16) every shipped curated image names a real leaf and has credits');
const db = JSON.parse(readFileSync(new URL('./public/data/dinosaur-database.json', import.meta.url), 'utf8'));
const leaves = new Set<string>();
function collectLeaves(node: { scientific: string; children?: typeof node[] }): void {
    if (!node.children?.length) leaves.add(node.scientific);
    for (const child of node.children ?? []) collectLeaves(child);
}
collectLeaves(db.root);
const overrides = JSON.parse(readFileSync(new URL('./public/data/image-overrides.json', import.meta.url), 'utf8'));
const invalidEntries: string[] = [];
const isWikimediaImage = (url?: string): boolean =>
    !!url && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(url);
for (const [taxon, value] of Object.entries(overrides)) {
    if (taxon.startsWith('_')) continue;
    const entry = value as Record<string, string>;
    if (!leaves.has(taxon) || !entry.artist || !entry.imageTitle || !entry.licenseName
        || !entry.fileUrl?.startsWith('https://commons.wikimedia.org/wiki/File:')
        || !isWikimediaImage(entry.imageUrl)
        || !isWikimediaImage(entry.fallbackUrl)
        || (entry.licenseName !== 'Public domain' && !entry.licenseUrl?.startsWith('https://'))) {
        invalidEntries.push(taxon);
    }
}
ok('all curated entries have valid leaf names, image sources and attribution', invalidEntries.length === 0);
if (invalidEntries.length) console.log('  Invalid entries:', invalidEntries.join(', '));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
