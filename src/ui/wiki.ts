// wiki.ts — fetches a representative image + blurb for a taxon from Wikipedia.
//
// The LCA shown after each guess is usually a group name like "Theropoda" or
// "Tyrannosauridae", which has its own Wikipedia page. Results are cached so we
// never fetch the same taxon twice.
//
// WHY THIS IS MORE THAN ONE REQUEST
//
// The obvious call is the REST summary endpoint, which hands back the article's
// LEAD image. For prehistoric taxa that lead image is very often a mounted
// skeleton, a skull, or a single bone — accurate, but it tells a player nothing
// about what the animal looked like, and a wall of grey fossils is a thin reward
// for solving the puzzle.
//
// So we also ask for every image on the page and pick the best life restoration by
// scoring filenames. Wikipedia palaeoart follows recognisable naming habits
// ("..._restoration.jpg", "..._life_reconstruction.jpg", the "_NT" / "_BW" / "_DB"
// suffixes used by prolific palaeoart contributors), and so do the images we want
// to avoid ("..._skeleton.jpg", "..._holotype.jpg", "..._size_comparison.svg").
//
// The summary is still fetched, for the blurb and as a fallback: if the image list
// fails, or nothing scores well, we fall back to the lead image and the behaviour
// is exactly what it was before.

export interface TaxonImage {
    imageUrl: string | null;
    /** The original (smaller) thumbnail, used if the upscaled URL 404s. */
    fallbackUrl: string | null;
    extract: string | null;
    pageUrl: string | null;
    /** The article Wikipedia actually served. Differs from the requested taxon
     *  when the name is a redirect — many minor clades have no article of their
     *  own and redirect to a parent, so the extract is about the PARENT. */
    articleTitle: string | null;
    /** Who made the image, and where its licence lives. Wikipedia palaeoart is
     *  mostly CC BY-SA, where crediting the author is a licence condition. */
    artist: string | null;
    fileUrl: string | null;
}

// Keyed by title AND mode. A given taxon is only ever fetched one way in practice
// (a node is a leaf or it isn't), but keying on both means the two paths can never
// serve each other's result if that ever changes.
const cache = new Map<string, Promise<TaxonImage>>();

// Optional pre-baked lookup, produced by tools/cache_wiki.py. When present the
// game shows its info card instantly and works without reaching Wikipedia at all.
// Its absence is not an error: everything falls back to live fetching, which is
// what the game did before the cache existed.
interface CachedEntry {
    extract?: string; imageUrl?: string; pageUrl?: string;
    artist?: string; fileUrl?: string; articleTitle?: string;
}
let wikiCache: Record<string, CachedEntry> | null = null;
let overrides: Record<string, CachedEntry> | null = null;
let cacheLoaded: Promise<void> | null = null;

// Hand-maintained escape hatch, checked BEFORE the cache and before any live
// lookup. Filename heuristics have a ceiling: they cannot tell a life restoration
// from a scientific tail-muscle diagram without reading the picture. When one
// slips through, add the taxon here and it is fixed permanently.
//
// This file is never generated, so regenerating the cache cannot overwrite it.
function loadCache(): Promise<void> {
    if (!cacheLoaded) {
        cacheLoaded = Promise.all([
            fetch('data/image-overrides.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
            fetch('data/wiki-cache.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]).then(([o, c]) => { overrides = o; wikiCache = c; });
    }
    return cacheLoaded;
}

// Wikipedia thumbnail URLs embed their width, e.g. ".../320px-Trex.jpg". The summary
// endpoint hands back a small one, which looks soft in a card this size, so we ask for a
// wider render of the same file. If that particular width isn't available the <img>
// falls back to the original URL.
function widen(url: string, target = 800): string {
    return url.replace(/\/(\d+)px-/, (match, w) => (Number(w) < target ? `/${target}px-` : match));
}

// Names that say "this is what the animal looked like".
const LIFELIKE: RegExp[] = [
    /restoration/i, /reconstruction/i, /reconstitution/i,
    /life[\s_-]/i, /[\s_-]life\b/i,
    /artist/i, /impression/i, /paleoart/i, /palaeoart/i,
    /[\s_-]by[\s_-]/i,          // "Tyrannosaurus_rex_by_Durbed.jpg"
    /[\s_-](nt|bw|db)\b/i,      // suffixes used by prolific palaeoart contributors
];

// A mild nudge toward 3D renders where one exists. Be aware this rarely fires:
// Wikipedia does not systematically distinguish a CG render from a digital
// painting in filenames, so most winners will be illustrations. That is the
// intended fallback anyway — a drawn animal beats a photographed skeleton.
// "model" is deliberately absent. On taxon pages it matches scientific modelling
// far more often than 3D creature art — "Robustly modeled tail of Carnotaurus"
// scored 51 and beat every real restoration on that page.
const RENDERED: RegExp[] = [/render/i, /\b3d\b/i, /\bcgi?\b/i, /digital/i];

// A picture of PART of the animal is not a picture of the animal. These arrive
// looking innocent because they carry no fossil vocabulary at all.
const PARTIAL: RegExp[] = [
    /\btail\b/i, /limb\b/i, /forelimb|hindlimb/i, /\barm\b|\bhand\b/i,
    /\bfoot\b|\bfeet\b|\bpaw\b/i, /\bhorn\b|\bcrest\b|\bfrill\b/i,
    /\bbrain\b|endocast/i, /muscle|myolog|anatomy|dissect/i,
    /\beye\b|\bskin\b|scale bar/i,
];

// Film stills, statues, toys and theme-park props. All are "of" the animal and
// none of them are science. A King Kong still passed on the Tyrannosaurus page.
const POP_CULTURE: RegExp[] = [
    /king kong|\bkong\b|godzilla|jurassic|dinosaur train/i,
    /movie|film|cinema|poster|trailer|screenshot/i,
    /statue|sculpt|animatronic|\btoy\b|lego|figurine|mascot|costume/i,
    /cartoon|comic|stamp|\bcoin\b|logo|\bpark\b|theme/i,
];

// Wikipedia is multilingual and so are its filenames. The English "footprint"
// and "track" rules missed a Spanish-titled Smilodon trackway entirely.
const NON_ENGLISH_TRACES: RegExp[] = [
    /huella|rastro|icnita|pisada/i,      // Spanish
    /empreinte|trace fossile/i,          // French
    /spur\b|fährte|abdruck/i,            // German
    /impronta|orma/i,                    // Italian
];

// Names that say "this is a bone, a diagram, or site furniture".
const NOT_LIFELIKE: RegExp[] = [
    /skelet/i, /skull/i, /fossil/i, /holotype/i, /specimen/i, /\bcast\b/i,
    /\bmount(ed)?\b/i, /bone/i, /teeth|tooth|dentition/i,
    /vertebra|femur|humerus|claw|jaw|pelvis|\brib\b/i,
    /footprint|track|ichno/i, /\begg\b|nest/i, /quarry|excavation/i,
    /size|scale|comparison|chart|diagram|cladogram|phylogen|timeline|strat/i,
    /\bmap\b|distribution|locality|locations/i,
    /commons-logo|wikispecies|question_book|symbol|ambox|disambig|edit-|padlock|portal|wiki_letter|increase|decrease/i,
];

/**
 * Higher is more likely to be a life restoration. Negative means "definitely not".
 * `index` is the image's position on the page — earlier images are usually more
 * central to the article, so it breaks ties without overriding the filename.
 *
 * Exported for wiki_test.ts. This heuristic is the risky part of the module, so it
 * is kept pure and tested rather than buried inside a fetch that can't be run offline.
 */
export function scoreImage(filename: string, index = 0, names: string[] = []): number {
    const name = filename.replace(/^File:/i, '');

    // SVGs on taxon pages are essentially always scale charts, maps or icons.
    if (/\.svg$/i.test(name)) return -100;
    if (!/\.(jpe?g|png|webp)$/i.test(name)) return -100;

    // IS THIS EVEN THE RIGHT ANIMAL?
    //
    // A Wikipedia taxon article shows its relatives too. Velociraptor's page
    // carries Achillobator, Tyrannosaurus' carries Alioramus, Smilodon's carries
    // Homotherium. Scoring on "does the filename look like a life restoration"
    // alone made this actively worse than random: "Alioramus Life Restoration"
    // matches two lifelike patterns and scored 94, while the correct
    // "Tyrannosaurus_rex_restoration" matched one and scored 34. The better the
    // wrong animal's filename, the more certainly it won.
    //
    // Wikipedia palaeoart filenames almost always contain the genus, so requiring
    // the name to appear is a cheap and decisive filter. When nothing matches we
    // return no candidate and fall back to the article's own lead image, which is
    // at least guaranteed to be the right animal.
    if (names.length > 0) {
        const hay = name.toLowerCase().replace(/[_-]+/g, ' ');
        const named = names.some((n) => n && n.length >= 4 && hay.includes(n.toLowerCase()));
        if (!named) return -100;
    }

    let score = 0;
    let bad = 0;
    for (const re of NOT_LIFELIKE) if (re.test(name)) { bad++; score -= 40; }
    for (const re of PARTIAL) if (re.test(name)) { bad++; score -= 60; }
    for (const re of NON_ENGLISH_TRACES) if (re.test(name)) { bad++; score -= 60; }
    // Pop culture is disqualifying outright rather than merely penalised: no
    // amount of "restoration" in a filename makes a film still scientific.
    for (const re of POP_CULTURE) if (re.test(name)) return -100;

    let life = 0;
    for (const re of LIFELIKE) if (re.test(name)) life++;
    let rendered = 0;
    for (const re of RENDERED) if (re.test(name)) rendered++;

    // More matching signals means more confidence, so they stack.
    score += life * 30;

    // A render IS a depiction of the living animal, so it earns the same base even
    // when the filename never says "restoration" — without this, a file called
    // "Trex_3D_render.jpg" scored below a plain "_restoration.jpg", which is the
    // opposite of preferring renders. Withheld if the name also looks like a bone,
    // so "Model_of_a_Diplodocus_skeleton.jpg" stays rejected.
    if (rendered > 0 && life === 0 && bad === 0) score += 30;

    // ...and once it qualifies, a render outranks a flat illustration.
    if (bad === 0) score += rendered * 15;

    // Mild preference for images that appear early on the page.
    score += Math.max(0, 10 - index);
    return score;
}

interface ImageInfoPage {
    title?: string;
    index?: number;
    imageinfo?: Array<{
        thumburl?: string; url?: string; descriptionurl?: string;
        extmetadata?: { Artist?: { value?: string }; LicenseShortName?: { value?: string } };
    }>;
}

export interface LifeImage { url: string; artist: string | null; fileUrl: string | null; }

/** A candidate must carry at least one genuine "this is a life restoration"
 *  signal (worth 30) to beat the article's own lead image. */
export const MIN_ACCEPT = 30;

// extmetadata Artist arrives as an HTML fragment ("<a href=...>Nobu Tamura</a>").
// The card renders text, so strip the markup and collapse the whitespace.
function plainArtist(html?: string): string | null {
    if (!html) return null;
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 0 && text.length < 120 ? text : null;
}

// One request returns every image on the page WITH its URL, so we can score and
// choose without a second round trip per candidate.
// Wikimedia asks API consumers to identify themselves. A browser cannot set
// User-Agent, so their documented alternative is the Api-User-Agent header.
const API_UA = 'Dinozoa/1.0 (https://github.com/Skittzy/dinozoa; student project) browser';

async function bestLifeImage(title: string, names: string[]): Promise<LifeImage | null> {
    const url = 'https://en.wikipedia.org/w/api.php'
        + '?action=query&format=json&origin=*&generator=images'
        + `&titles=${encodeURIComponent(title)}`
        + '&gimlimit=60&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800';

    // The custom header turns this into a CORS preflight. If a proxy or future
    // policy change rejects that, retry plain rather than losing the feature —
    // identifying ourselves is good manners, not worth breaking the card over.
    let res = await fetch(url, { headers: { 'Api-User-Agent': API_UA } }).catch(() => null);
    if (!res || !res.ok) res = await fetch(url).catch(() => null);
    if (!res || !res.ok) return null;
    const data = await res.json();
    const pages: Record<string, ImageInfoPage> = data?.query?.pages ?? {};

    let best: { score: number; img: LifeImage } | null = null;
    for (const page of Object.values(pages)) {
        const name = page.title ?? '';
        const info = page.imageinfo?.[0];
        const src = info?.thumburl ?? info?.url;
        if (!src) continue;
        const score = scoreImage(name, page.index ?? 0, names);
        // MIN_ACCEPT, not 0. A file with no signal either way used to pass on the
        // position tiebreak alone, which is how a King Kong still and a Smilodon
        // trackway both won with a score of 6. Requiring a real positive signal
        // means "we are not sure" falls back to the article's lead image, which
        // Wikipedia editors chose deliberately.
        if (score >= MIN_ACCEPT && (!best || score > best.score)) {
            best = {
                score,
                img: {
                    url: src,
                    artist: plainArtist(info?.extmetadata?.Artist?.value),
                    fileUrl: info?.descriptionurl ?? null,
                },
            };
        }
    }
    return best?.img ?? null;
}

/**
 * @param preferRestoration  true for LEAF animals — hunt for a life restoration so
 *   the player sees what the creature looked like. false for CLADES, where the
 *   Wikipedia lead image is usually a composite plate showing several members of
 *   the group, which describes a clade far better than any single restoration
 *   could. Clades therefore cost one request instead of two.
 */
export function fetchTaxonImage(title: string, preferRestoration = false,
                                altNames: string[] = []): Promise<TaxonImage> {
    const key = `${preferRestoration ? 'life' : 'lead'}:${title}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const promise = (async (): Promise<TaxonImage> => {
        try {
            const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

            // Both requests go out together; hunting for a restoration must never
            // delay the blurb. Either can fail without taking the other down.
            // A cache hit skips the network entirely.
            await loadCache();
            const hit = overrides?.[title] ?? wikiCache?.[title];
            if (hit && hit.imageUrl) {
                return {
                    imageUrl: hit.imageUrl,
                    fallbackUrl: hit.imageUrl,
                    extract: hit.extract ?? null,
                    pageUrl: hit.pageUrl ?? null,
                    artist: hit.artist ?? null,
                    fileUrl: hit.fileUrl ?? null,
                    articleTitle: hit.articleTitle ?? null,
                };
            }

            const [summaryRes, life] = await Promise.all([
                fetch(summaryUrl).catch(() => null),
                preferRestoration
                    ? bestLifeImage(title, [title, ...altNames]).catch(() => null)
                    : Promise.resolve(null),
            ]);

            if (!summaryRes || !summaryRes.ok) {
                return {
                    imageUrl: life?.url ?? null, fallbackUrl: life?.url ?? null,
                    extract: null, pageUrl: null, articleTitle: null,
                    artist: life?.artist ?? null, fileUrl: life?.fileUrl ?? null,
                };
            }
            const data = await summaryRes.json();
            const lead: string | null = data?.thumbnail?.source ?? data?.originalimage?.source ?? null;

            // Prefer the restoration; keep the lead image as the <img> onerror fallback
            // so a bad pick degrades to the OLD behaviour rather than to nothing.
            const chosen = life?.url ?? (lead ? widen(lead) : null);
            return {
                imageUrl: chosen,
                fallbackUrl: lead,
                extract: data?.extract ?? null,
                pageUrl: data?.content_urls?.desktop?.page ?? null,
                // Only claim an artist for the image we actually chose. The lead image
                // came from a different endpoint and its author is unknown here.
                artist: life ? life.artist : null,
                fileUrl: life ? life.fileUrl : null,
                // Wikipedia follows redirects silently, so the article we got back
                // is not necessarily the one we asked for.
                articleTitle: data?.titles?.canonical ?? data?.title ?? null,
            };
        } catch {
            return { imageUrl: null, fallbackUrl: null, extract: null,
                     pageUrl: null, artist: null, fileUrl: null, articleTitle: null };
        }
    })();

    cache.set(key, promise);
    return promise;
}


/** True when Wikipedia served a different article than the taxon we asked for.
 *  Titles are compared loosely because Wikipedia normalises spacing and case. */
export function isRedirect(requested: string, served: string | null): boolean {
    if (!served) return false;
    const norm = (t: string) => t.toLowerCase().replace(/[_\s]+/g, ' ').trim();
    return norm(requested) !== norm(served);
}
