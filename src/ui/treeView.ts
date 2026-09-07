// treeView.ts — the animated family tree (hand-rolled SVG, no libraries).
//
// THREE IDEAS MAKE THIS FIT ON SCREEN NO MATTER HOW MANY GUESSES:
//
// 1. INDUCED SUBTREE. We don't draw the whole tree of life, and we don't hang every
//    guess off the root either. We draw the *minimal* tree that connects the root, every
//    guess, and the answer — keeping only nodes where branches actually split. Two cold
//    guesses that are cousins (say two arthropods) share a branch instead of each taking
//    their own column, so the tree grows much slower than "one column per guess".
//
// 2. FIT-TO-VIEWBOX. We measure the drawing's real bounding box, then set the SVG's
//    viewBox to it with preserveAspectRatio="xMidYMid meet". The browser then scales the
//    whole picture to exactly fit the container. This makes "never needs a scrollbar" a
//    mathematical guarantee rather than something we tune by hand.
//
// 3. MEASURED LABELS + TIERED STAGGER. Spacing is derived from real text widths (canvas
//    measureText), and leaves alternate between 2-3 vertical tiers so neighbours can sit
//    closer horizontally without their labels colliding.

import { nodeLookup, ancestorsOf, rootId, depthLookup } from '../data/loadTree';
import { findLCA } from '../game/lca';
import type { GameState } from '../game/gameState';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ROW_H = 80;        // vertical gap between tree levels (roomier = easier to read)
const TIER_DY = 40;      // extra drop for staggered leaf tiers
const GAP = 22;          // minimum horizontal gap between two labels on the SAME tier
const MIN_ADVANCE = 26;  // keeps leaves in left-to-right order even when tiers differ
const BOX_H = 30;        // label box height
const PAD_X = 11;        // horizontal padding inside a label box
const MARGIN = 26;       // margin around the whole drawing
const MAX_ZOOM = 1.15;

// Font size the tree labels are authored at, in user units (see .tv-text in
// style.css), and the smallest they may appear on screen after fitting.
const TEXT_PX = 15;
const MIN_LABEL_PX = 11;   // stops a 3-node tree from being blown up to fill the pane
const FONT = '600 15px ui-monospace, SFMono-Regular, Menlo, monospace';

// ---------------------------------------------------------------------------
// ANIMATION — copied from Metazooa's own SVG output.
//
// Their saved page shows exactly how it works. Every branch is a <path> whose
// dash pattern is as long as the path itself, with the dash pushed fully out of
// view; a SMIL <animate> then walks stroke-dashoffset back to 0, so the line
// appears to be drawn from the parent down to the child:
//
//   <path d="M297,100C297,140,124,140,124,180"
//         stroke-dasharray="199.89 199.89" stroke-dashoffset="199.89">
//     <animate attributeName="stroke-dashoffset" from="199.89" to="0"
//              dur="0.59s" begin="0.59" fill="freeze"/>
//   </path>
//
// The box at the end then fades in over 0.5s, starting exactly when its branch
// finishes:
//
//   <rect opacity="0" ...>
//     <animate attributeName="opacity" from="0" to="1"
//              dur="0.5s" begin="1.18" fill="freeze"/>
//   </rect>
//
// begin = depth x 0.59s, so every branch on the same level draws AT THE SAME
// TIME — that is what makes the guess and the "?" grow in parallel when they
// hang off the same ancestor.
const EDGE_S = 0.59;   // how long one branch takes to draw   (Metazooa: 0.59s)
const POP_S = 0.5;     // how long a box takes to fade in      (Metazooa: 0.5s)
const STEP_S = 0.59;   // delay between generations            (Metazooa: 0.59s)
// A 19-deep tree at 0.59s/level would take 11s, so we compress the delay (only)
// once a replay would run past this. Trees up to 7 deep are bit-for-bit Metazooa.
const MAX_TOTAL_S = 4.2;

type Kind = 'root' | 'ancestor' | 'revealed' | 'guess' | 'answer' | 'answerRevealed';

interface RNode {
    key: string;
    label: string;   // possibly shortened for dense trees
    full: string;    // always the complete name
    title: string;
    kind: Kind;
    taxonId: number;      // the database node this box stands for (used for clicks)
    rank: string;         // Kingdom / Phylum / ... — labels the sediment band it sits in
    onAnswerPath: boolean;// does the answer's own lineage run through this box?
    closeness: number;    // 0 = as far from the answer as possible, 1 = the answer itself
    children: RNode[];
    depth: number;       // structural depth, drives the animation's begin times
    leafCount: number;   // drives branch thickness, like a real trunk tapering
    fill: string;        // the node's own colour, reused for the branch gradient
    textFill: string;    // readable against `fill` (dark on yellow, light on red/green)
    w: number;
    x: number;
    y: number;
}


// --- text measuring (one shared canvas) ---
let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string): number {
    if (!measureCtx) {
        const canvas = document.createElement('canvas');
        measureCtx = canvas.getContext('2d');
        if (measureCtx) measureCtx.font = FONT;
    }
    if (!measureCtx) return text.length * 9;
    return measureCtx.measureText(text).width;
}

// FOUR-STOP RAMP, deliberately slow: red -> orange -> yellow -> green.
// The stop POSITIONS matter as much as the colours. Yellow doesn't arrive until roughly
// two-thirds of the way in, and the last third is spent easing from yellow into green, so
// pure green is reached only at the very end. Each entry is [position, hue, sat, light].
//
// ---------------------------------------------------------------------------
// TWO THEMES, ONE TREE.
//
// Think of it as stage lighting. The boxes are the actors and they are painted in
// warm colours; if the stage is ALSO lit warm, the warm actors disappear into the
// set. That is measurably what happens on the cream page: the yellow band — the
// "you're getting close" signal, the most important moment in the game — sits at
// 1.32:1 contrast against the paper, where 3:1 is the floor for a UI element you
// are meant to be able to see. On cool rock it measures 9.76:1.
//
// So 'strata' turns the stage cool and dark and leaves the actors warm. Every
// colour the tree paints is read from THEME, which means switching skins is just
// a re-render — and deleting the strata entry below reverts the tree completely.
type ThemeName = 'classic' | 'strata' | 'dig' | 'layers';

interface TreeTheme {
    ramp: Array<[number, number, number, number]>;
    leafFill: string;        // the box behind a guess, and behind the hidden "?"
    leafText: string;
    revealedStroke: string;  // dashed outline on a rank you paid a hint for
    wonFill: string;         // the answer, once you've found it
    wonStroke: string;
    wonText: string;
    shadow: string;          // '' means no filter at all — see the note in nodeEl
    fillLeaves: boolean;     // dig: a guess box carries the ramp as FILL, not just outline
    boneStroke: string;      // dig: every box outlined in bone whatever its fill
    textDark: string;
    textLight: string;
    bands: boolean;          // draw sediment strata behind the tree
    bandColumn: string[];    // one rock tone per depth; [] falls back to bandFill alternation
    bandTexture: string[];   // matching lithology pattern id per depth
    grass: boolean;          // turf growing on the surface above the root
    bandLabels: boolean;
    bandFill: string;
    bandEdge: string;
    bandText: string;
}

const THEMES: Record<ThemeName, TreeTheme> = {
    classic: {
        ramp: [[0.00, 2, 70, 42], [0.35, 26, 85, 46], [0.68, 48, 92, 50], [1.00, 125, 60, 32]],
        leafFill: '#fffdf8',
        leafText: '#2b2318',
        revealedStroke: '#e8b84b',
        wonFill: '#f5c542',
        wonStroke: '#b8860b',
        wonText: '#2b2318',
        shadow: 'filter: drop-shadow(rgba(0,0,0,0.2) 2px 3px 1px)',
        fillLeaves: false,
        boneStroke: '',
        // ===== TEXT COLOUR — revert switch ==============================
        // Label text inside the tree boxes. Pairs with the switch in
        // src/style.css (search for "TEXT COLOUR"); change both together.
        // textDark: '#2b2318',   // ORIGINAL — near-black brown
        textDark: '#3f2c1a',      // CURRENT  — warm very dark brown
        // ================================================================
        textLight: '#fdf6ec',
        bands: false,
        bandColumn: [],
        bandTexture: [],
        grass: false,
        bandLabels: false,
        bandFill: '',
        bandEdge: '',
        bandText: '',
    },
    strata: {
        // ONLY STOP 0 MOVES. Against the rock ground the red at lightness 42 measures
        // 2.47:1, just under the 3:1 floor; lightness 48 lifts it to 3.04:1. Orange,
        // yellow and green already clear it there (4.47, 9.76, 3.27), so they are
        // untouched. The whole colour migration is one number.
        ramp: [[0.00, 2, 70, 48], [0.35, 26, 85, 46], [0.68, 48, 92, 50], [1.00, 125, 60, 32]],
        leafFill: '#232c29',
        leafText: '#e8e3d6',
        revealedStroke: '#d9a441',
        wonFill: '#f5c542',
        wonStroke: '#7a5a12',
        wonText: '#1d2422',
        // No filter. A full 20-guess tree draws ~39 boxes, so the classic skin pays for
        // ~39 separate SVG filter regions on every render — the slow rasterisation path,
        // not the cheap composited one a CSS box-shadow gets. On a dark ground the shadow
        // reads as nothing anyway, so dropping it costs no legibility and buys back the
        // single most expensive thing the renderer does.
        shadow: '',
        fillLeaves: false,
        boneStroke: '',
        textDark: '#2b2318',
        textLight: '#fdf6ec',
        bands: true,
        bandColumn: [],
        bandTexture: [],
        grass: false,
        bandLabels: true,
        bandFill: '#212a27',
        bandEdge: '#2c3733',
        bandText: '#6f8a7d',
    },
    // -----------------------------------------------------------------------
    // DIG. Earth pigments on earth ground fail the same contrast test sand did
    // (rust on topsoil measures 1.06:1). But BONE on earth measures 4.43–9.48:1.
    // So this skin stops using hue to carry temperature and uses excavation
    // instead: closeness is how much matrix is still stuck to the fossil.
    //
    // A wild guess surfaces as a dirt-caked lump. A close guess is clean bone.
    // Same maths, same `closeness` value — the ramp is now a LIGHTNESS ramp,
    // spread 8.78:1 end to end, which survives a cheap washed-out screen far
    // better than hue ever did. Nothing on screen is saturated.
    dig: {
        // Stop POSITIONS are front-loaded on purpose. Most guesses land in the
        // bottom third of the closeness range, and the first attempt spent its
        // lightness change up at the top where almost nothing ever reached — so
        // every box came out the same mid-brown and the signal died. Most of the
        // travel now happens early. Hue warms alongside lightness as a second,
        // redundant cue: cold damp matrix -> warm dry bone.
        ramp: [[0.00, 30, 18, 16], [0.25, 34, 24, 33], [0.55, 38, 30, 56], [1.00, 44, 46, 88]],
        leafFill: '#ece4d2',
        leafText: '#2a2318',
        revealedStroke: '#c9b892',
        wonFill: '#f2ead6',
        wonStroke: '#8a7550',
        wonText: '#2a2318',
        shadow: '',
        // A still-buried box sits at only 1.33:1 against the soil, so fill alone
        // would lose it. The bone outline every box carries is what makes it read
        // as a box — that stroke is load-bearing here, not decoration.
        fillLeaves: true,
        boneStroke: '#e4dac4',
        textDark: '#2a2318',
        textLight: '#ece4d2',
        bands: false,
        bandColumn: [],
        bandTexture: [],
        grass: false,
        bandLabels: false,
        bandFill: '',
        bandEdge: '',
        bandText: '',
    },
    // -----------------------------------------------------------------------
    // LAYERS. Everything here is classic v7 — same ramp, same box colours, same
    // pale page. The only addition is the ground the tree hangs in: one rock bed
    // per depth, Animalia sitting in topsoil and every level below it a stratum
    // further down the crust.
    //
    // The beds deliberately do NOT get darker as they descend. A column that
    // darkens with depth would wreck the very colours that live down there —
    // green measures 3.57:1 up in topsoil but 1.05:1 on bedrock, and green is
    // where the close guesses are. Real geological columns vary by lithology
    // rather than brightness anyway: reddish clay, grey-green shale, pale
    // limestone. So depth reads as a change of rock, not a dimming of the light,
    // and every ramp colour keeps the contrast it has today.
    layers: {
        ramp: [[0.00, 2, 70, 42], [0.35, 26, 85, 46], [0.68, 48, 92, 50], [1.00, 125, 60, 32]],
        leafFill: '#fffdf8',
        leafText: '#2b2318',
        revealedStroke: '#e8b84b',
        wonFill: '#f5c542',
        wonStroke: '#b8860b',
        wonText: '#2b2318',
        shadow: 'filter: drop-shadow(rgba(0,0,0,0.35) 2px 3px 2px)',
        fillLeaves: false,
        // Cream edge on the filled clade boxes only — it clears 3:1 against every
        // bed (3.73:1 worst case). Guess boxes keep their ramp-coloured outline,
        // because their white fill already separates them from dirt at 3.95-9.40:1
        // and that outline IS the temperature signal.
        boneStroke: '#fdf6ea',
        textDark: '#2b2318',
        textLight: '#fdf6ec',
        bands: true,
        bandColumn: [
            '#5a4028',  // 0  organic layer — leaf litter and humus
            '#7d5a35',  // 1  topsoil
            '#8a6740',  // 2  topsoil, lower
            '#96714a',  // 3  subsoil
            '#9d7850',  // 4  subsoil, lower
            '#8a6a48',  // 5  weathered rock
            '#7e5f41',  // 6  weathered rock, lower
            '#6f5339',  // 7  parent material
            '#6e6862',  // 8  bedrock
            '#625c57',  // 9  bedrock, deeper
        ],
        bandTexture: [
            'tv-organic', 'tv-topsoil', 'tv-topsoil', 'tv-subsoil', 'tv-subsoil',
            'tv-weathered', 'tv-weathered', 'tv-weathered', 'tv-bedrock', 'tv-bedrock',
        ],
        grass: true,
        bandLabels: false,
        bandFill: '',
        bandEdge: 'rgba(122, 100, 68, .38)',   // bedding plane between two rock beds
        bandText: '',
    },
};

let THEME: TreeTheme = THEMES.classic;

export function currentThemeName(): ThemeName {
    const t = document.documentElement.dataset.theme;
    return t === 'strata' || t === 'dig' || t === 'layers' ? t : 'classic';
}

function rampHsl(t: number): [number, number, number] {
    const ramp = THEME.ramp;
    const x = Math.max(0, Math.min(1, t));
    let i = 0;
    while (i < ramp.length - 2 && x > ramp[i + 1][0]) i++;
    const lo = ramp[i];
    const hi = ramp[i + 1];
    const span = hi[0] - lo[0];
    const f = span <= 0 ? 0 : (x - lo[0]) / span;
    return [
        lo[1] + (hi[1] - lo[1]) * f,
        lo[2] + (hi[2] - lo[2]) * f,
        lo[3] + (hi[3] - lo[3]) * f,
    ];
}

function rampColor(t: number, dl = 0): string {
    const [h, sat, l] = rampHsl(t);
    const lightness = Math.max(12, Math.min(88, l + dl));
    return `hsl(${h.toFixed(0)} ${sat.toFixed(0)}% ${lightness.toFixed(0)}%)`;
}

// A filled yellow box needs dark text while red and green need light text. Yellows read
// far brighter than reds or greens at the same HSL lightness, so we bias by how yellow
// the hue is before deciding.
function textOn(t: number, dl = 0): string {
    const [h, , l] = rampHsl(t);
    const yellowness = Math.max(0, 1 - Math.abs(h - 55) / 55);
    return (l + dl) + yellowness * 22 > 52 ? THEME.textDark : THEME.textLight;
}

export class TreeView {
    private svg: SVGSVGElement;
    private bandsG: SVGGElement;
    private edgesG: SVGGElement;
    private nodesG: SVGGElement;
    private defs!: SVGDefsElement;
    private view = { x: 0, y: 0, w: 0, h: 0 };
    private gradSeq = 0;
    private lastState: GameState | null = null;

    // Called when the player clicks any box in the tree, with that taxon's database id.
    private onSelect: ((taxonId: number) => void) | null = null;

    constructor(svg: SVGSVGElement, onSelect?: (taxonId: number) => void) {
        this.svg = svg;
        this.onSelect = onSelect ?? null;
        this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        this.defs = document.createElementNS(SVG_NS, 'defs');
        this.bandsG = document.createElementNS(SVG_NS, 'g');
        this.edgesG = document.createElementNS(SVG_NS, 'g');
        this.nodesG = document.createElementNS(SVG_NS, 'g');
        this.svg.appendChild(this.defs);
        this.svg.appendChild(this.bandsG);   // sediment layers at the very back...
        this.svg.appendChild(this.edgesG);   // ...then branches...
        this.svg.appendChild(this.nodesG);   // ...so boxes always cover the line ends

        // Re-fit when the window changes shape. (The viewBox already rescales on its own;
        // this just refreshes the zoom clamp, which depends on the container's size.)
        let resizeTimer = 0;
        window.addEventListener('resize', () => {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => {
                if (this.lastState) this.update(this.lastState);
            }, 120);
        });
    }

    // ---------- 1. build the induced subtree ----------
    private buildModel(state: GameState): RNode {
        const answerId = state.answerId;

        // The nodes that MUST appear: root, every guess, the answer, every bought rank.
        const keyIds = new Set<number>([rootId, answerId]);
        for (const g of state.guesses) keyIds.add(g.guessId);
        for (const id of state.revealedIds) keyIds.add(id);

        // Union of every root->node path.
        const childSets = new Map<number, Set<number>>();
        for (const id of keyIds) {
            const path = ancestorsOf(id); // [id, parent, ..., root]
            for (let i = path.length - 1; i > 0; i--) {
                const parent = path[i];
                const child = path[i - 1];
                if (!childSets.has(parent)) childSets.set(parent, new Set());
                childSets.get(parent)!.add(child);
            }
        }

        // Collapse: drop any intermediate rank that neither splits nor was explicitly revealed.
        const build = (id: number): RNode[] => {
            const kids = [...(childSets.get(id) ?? [])].flatMap(build);
            const isKey = keyIds.has(id);
            if (!isKey && kids.length === 1) return kids;   // pass-through rank, hide it
            if (!isKey && kids.length === 0) return [];
            return [this.makeNode(id, kids, state)];
        };

        const built = build(rootId);
        const root = built[0];

        // Order children so the busy branches sit left and lone leaves right — keeps the
        // shape stable between guesses, which makes the animation readable.
        const subtreeLeaves = (n: RNode): number =>
            n.children.length === 0 ? 1 : n.children.reduce((s, c) => s + subtreeLeaves(c), 0);
        const sortRec = (n: RNode) => {
            n.children.sort((a, b) => subtreeLeaves(b) - subtreeLeaves(a) || a.label.localeCompare(b.label));
            n.children.forEach(sortRec);
        };
        sortRec(root);
        return root;
    }

    private makeNode(id: number, kids: RNode[], state: GameState): RNode {
        const taxon = nodeLookup[id];

        // COLOUR = HOW CLOSE THIS BOX IS TO THE ANSWER.
        // For any box we ask: how deep is the last ancestor it shares with the answer?
        //   - a clade on the answer's own line  -> that clade itself, so deeper = greener
        //   - a guess                           -> the clade it shares with the answer
        //   - a clade joining two wrong guesses -> whatever little it shares
        //   - the answer                        -> itself, fully green
        // So red means "a long way off" and green means "nearly there", which is exactly
        // the warmth the player is chasing.
        // Scale against the answer's PARENT rather than the answer, so the nearest group
        // you could possibly land on scores a full 1.0 and comes out pure green. (Guessing
        // the answer itself scores even higher and is simply clamped to 1.)
        const nearestGroup = Math.max(1, depthLookup[state.answerId] - 1);
        const shared = id === state.answerId ? state.answerId : findLCA(state.answerId, id);
        const closeness = Math.max(0, Math.min(1, depthLookup[shared] / nearestGroup));
        const isAnswer = id === state.answerId;
        const isGuess = kids.length === 0 && !isAnswer;

        let kind: Kind;
        let label: string;
        if (isAnswer) {
            kind = state.won ? 'answerRevealed' : 'answer';
            label = state.won
                ? (taxon.common && taxon.common !== taxon.scientific ? taxon.common : taxon.scientific)
                : '?';
        } else if (isGuess) {
            kind = 'guess';
            label = taxon.common && taxon.common !== taxon.scientific ? taxon.common : taxon.scientific;
        } else if (id === rootId) {
            kind = 'root';
            label = taxon.scientific;
        } else {
            kind = state.revealedIds.includes(id) ? 'revealed' : 'ancestor';
            label = taxon.scientific;
        }

        return {
            key: `n${id}`,
            label,
            full: label,
            title: `${taxon.scientific}${taxon.common && taxon.common !== taxon.scientific ? ' — ' + taxon.common : ''} (${taxon.rank})`,
            kind,
            taxonId: id,
            rank: taxon.rank,
            // Bands are labelled from the answer's OWN lineage, so a band says "at this
            // depth the answer is inside a Family". That leaks nothing: the only lineage
            // nodes drawn are ones already on screen (root, split points, ranks you paid
            // for), and their rank is already in the tooltip. What it does add is a
            // reading of the hint button — you can see which layer 3 guesses would buy.
            onAnswerPath: ancestorsOf(state.answerId).includes(id),
            closeness,
            children: kids,
            depth: 0,      // set in layout()
            leafCount: 0,  // set in layout()
            fill: '#000',  // set in layout(), once closeness is known
            textFill: '#fdf6ec',
            w: 0,          // set in layout(), once we know how dense the tree is
            x: 0,
            y: 0,
        };
    }

    // ---------- 2. layout ----------
    private layout(root: RNode): { minX: number; minY: number; maxX: number; maxY: number } {
        // structural depth (not taxonomic) keeps the drawing compact
        let maxDepth = 0;
        const leaves: RNode[] = [];
        const setDepth = (n: RNode, d: number) => {
            n.y = d;
            n.depth = d;
            maxDepth = Math.max(maxDepth, d);
            if (n.children.length === 0) leaves.push(n);
            n.children.forEach((c) => setDepth(c, d + 1));
        };
        setDepth(root, 0);

        // leaf counts drive branch thickness: the trunk is thick, dead ends are thin
        const countLeaves = (n: RNode): number => {
            n.leafCount = n.children.length === 0 ? 1 : n.children.reduce((s, c) => s + countLeaves(c), 0);
            return n.leafCount;
        };
        countLeaves(root);

        // each node's own colour (also used at both ends of its branch gradient)
        const paint = (n: RNode) => {
            if (n.kind === 'answerRevealed') {
                n.fill = THEME.wonFill;
                n.textFill = THEME.wonText;
            } else if (n.kind === 'answer') {
                n.fill = rampColor(1);           // the answer is by definition the greenest
                n.textFill = n.fill;
            } else if (n.kind === 'guess') {
                // classic/strata: this is the OUTLINE colour of a pale leaf box.
                // dig: this is the box itself — how much dirt is still on the bone.
                n.fill = THEME.fillLeaves ? rampColor(n.closeness) : rampColor(n.closeness, 2);
                n.textFill = THEME.fillLeaves ? textOn(n.closeness) : THEME.leafText;
            } else if (n.kind === 'root') {
                n.fill = rampColor(0, -8);       // deepest red: nothing is further away
                n.textFill = textOn(0, -8);
            } else {
                n.fill = rampColor(n.closeness);
                n.textFill = textOn(n.closeness);
            }
            n.children.forEach(paint);
        };
        paint(root);

        // 3a. density-aware labels: the busier the tree, the shorter the names
        //     (the full name always stays in the tooltip and in the card on the left)
        const maxChars = leaves.length <= 8 ? 99 : leaves.length <= 14 ? 20 : 16;
        const sizeAll = (n: RNode) => {
            n.label = n.full.length > maxChars ? n.full.slice(0, maxChars - 1) + '\u2026' : n.full;
            n.w = textWidth(n.label) + PAD_X * 2;
            n.children.forEach(sizeAll);
        };
        sizeAll(root);

        // 3b. tiered stagger + adaptive packing. Only leaves on the SAME tier can
        //     collide, so we space against that tier's previous label using its real
        //     width rather than reserving the widest label's width for everyone.
        const tiers = leaves.length <= 6 ? 1 : leaves.length <= 12 ? 2
                    : leaves.length <= 18 ? 3 : 4;
        const lastX = new Array<number>(tiers).fill(Number.NEGATIVE_INFINITY);
        const lastW = new Array<number>(tiers).fill(0);
        let cursor = 0;

        leaves.forEach((leaf, i) => {
            const tier = i % tiers;
            let x = cursor;
            if (lastX[tier] !== Number.NEGATIVE_INFINITY) {
                x = Math.max(x, lastX[tier] + (lastW[tier] + leaf.w) / 2 + GAP);
            }
            leaf.x = x;
            lastX[tier] = x;
            lastW[tier] = leaf.w;
            cursor = x + MIN_ADVANCE;
            leaf.y = leaf.y * ROW_H + tier * TIER_DY;
        });

        // depths -> pixels for the internal nodes (leaves were converted above)
        const toPixels = (n: RNode) => {
            if (n.children.length === 0) return;
            n.y = n.y * ROW_H;
            n.children.forEach(toPixels);
        };
        toPixels(root);

        // parents sit centred above their children
        const centreX = (n: RNode): number => {
            if (n.children.length === 0) return n.x;
            const xs = n.children.map(centreX);
            n.x = (Math.min(...xs) + Math.max(...xs)) / 2;
            return n.x;
        };
        centreX(root);

        // 3c. COLLISION RELAXATION.
        // Centring a parent over its children, and mixing staggered leaf tiers with the
        // rows below them, can still drop two labels on top of each other. So we push
        // apart every pair that overlaps vertically, re-centring parents between passes,
        // and finish with separation-only passes so the final result cannot collide.
        const all = this.flatten(root);
        for (let iter = 0; iter < 16; iter++) {
            let moved = false;
            for (let i = 0; i < all.length; i++) {
                for (let j = i + 1; j < all.length; j++) {
                    const a = all[i];
                    const b = all[j];
                    if (Math.abs(a.y - b.y) >= BOX_H + 6) continue;   // no vertical overlap
                    const need = (a.w + b.w) / 2 + GAP;
                    const d = b.x - a.x;
                    const ad = Math.abs(d);
                    if (ad >= need) continue;
                    const push = (need - ad) / 2 + 0.5;
                    const dir = d === 0 ? 1 : Math.sign(d);
                    a.x -= push * dir;
                    b.x += push * dir;
                    moved = true;
                }
            }
            if (iter < 11) centreX(root);
            else if (!moved) break;
        }

        // bounding box, label boxes included
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const bbox = (n: RNode) => {
            minX = Math.min(minX, n.x - n.w / 2);
            maxX = Math.max(maxX, n.x + n.w / 2);
            minY = Math.min(minY, n.y - BOX_H / 2);
            maxY = Math.max(maxY, n.y + BOX_H / 2);
            n.children.forEach(bbox);
        };
        bbox(root);
        // Turf sits above ground level, which is above the root box. Without this
        // the grass is drawn outside the viewBox and silently clipped away.
        if (THEME.grass) minY = Math.min(minY, -ROW_H / 2 - 24);

        return { minX, minY, maxX, maxY };
    }

    private flatten(root: RNode): RNode[] {
        const out: RNode[] = [];
        const walk = (n: RNode) => { out.push(n); n.children.forEach(walk); };
        walk(root);
        return out;
    }

    // ---------- public entry point ----------
    update(state: GameState, opts: { instant?: boolean } = {}): void {
        // Read the skin BEFORE the model is built: paint() runs inside layout() and
        // every colour it picks comes from THEME.
        THEME = THEMES[currentThemeName()];
        const model = this.buildModel(state);
        const box = this.layout(model);
        this.lastState = state;

        // Fit-to-viewBox: the viewBox IS the drawing's bounding box, so the browser
        // scales the picture to exactly fill the pane and it can never need a scrollbar.
        // Only the zoom-IN is clamped, so a two-node tree isn't blown up comically.
        // Measure the PANE, not the svg. On the scrolling path below the svg is
        // deliberately larger than its container, so asking the svg for its own
        // size would feed the previous frame's answer back into this one.
        const pane = this.svg.parentElement;
        const cw = (pane?.clientWidth || this.svg.clientWidth) || 900;
        const ch = (pane?.clientHeight || this.svg.clientHeight) || 640;
        let vw = (box.maxX - box.minX) + MARGIN * 2;
        let vh = (box.maxY - box.minY) + MARGIN * 2;
        const cx = (box.minX + box.maxX) / 2;
        const cy = (box.minY + box.maxY) / 2;
        if (Math.min(cw / vw, ch / vh) > MAX_ZOOM) {
            vw = Math.max(vw, cw / MAX_ZOOM);
            vh = Math.max(vh, ch / MAX_ZOOM);
        }
        this.svg.setAttribute('viewBox', `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`);
        this.view = { x: cx - vw / 2, y: cy - vh / 2, w: vw, h: vh };

        // LEGIBILITY FLOOR.
        //
        // Fit-to-viewBox guarantees the tree never scrolls, which is exactly right
        // on a desktop pane. On a 358px-wide phone it is the thing that ruins the
        // game: 30 boxes squeezed into that width rendered labels at 6.2 CSS px,
        // well under the ~11px iOS treats as a floor. The picture was perfect and
        // unreadable.
        //
        // So the no-scroll promise is now conditional. If fitting would push the
        // label text below MIN_LABEL_PX, we stop fitting, render at the smallest
        // scale that clears the floor, and let the pane scroll instead. A phone
        // user expects to scroll; they do not expect to squint.
        const fitScale = Math.min(cw / vw, ch / vh);
        const needed = MIN_LABEL_PX / TEXT_PX;
        if (fitScale < needed) {
            this.svg.style.width = `${Math.round(vw * needed)}px`;
            this.svg.style.height = `${Math.round(vh * needed)}px`;
            this.svg.dataset.scroll = 'on';
            // Open with the ROOT centred, not the drawing. Trees hang lopsidedly —
            // on a 320px phone, centring the bounding box still left Animalia off
            // the right edge, so the player opened onto blank dirt.
            if (pane) {
                const rootPx = (model.x - (cx - vw / 2)) * needed;
                requestAnimationFrame(() => {
                    pane.scrollLeft = Math.max(0, rootPx - pane.clientWidth / 2);
                    pane.scrollTop = 0;
                });
            }
        } else {
            this.svg.style.width = '';
            this.svg.style.height = '';
            delete this.svg.dataset.scroll;
        }

        this.draw(model, opts.instant === true);
    }

    // ---------- render + animate (Metazooa's exact scheme) ----------
    private draw(root: RNode, instant: boolean): void {
        this.defs.textContent = '';
        this.bandsG.textContent = '';
        this.edgesG.textContent = '';
        this.nodesG.textContent = '';
        if (THEME.bands) this.drawBands(root);

        // "instant" is used when restoring a game on page load: the tree is already
        // several levels deep, and replaying its whole history would just make the
        // player wait. Reduced-motion users get the same still rendering.
        const reduced = instant
            || (typeof window.matchMedia === 'function'
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

        // how deep does this tree go? -> how much delay can we afford per level
        let maxDepth = 0;
        const deepest = (n: RNode) => { maxDepth = Math.max(maxDepth, n.depth); n.children.forEach(deepest); };
        deepest(root);
        const step = maxDepth <= 1 ? STEP_S : Math.min(STEP_S, MAX_TOTAL_S / maxDepth);

        // The root is simply there from the start, exactly as in their markup.
        this.nodesG.appendChild(this.nodeEl(root, 0, reduced, true));

        const walk = (parent: RNode) => {
            for (const child of parent.children) {
                // A branch begins drawing when its parent's level is done, so all the
                // branches leaving the same ancestor draw simultaneously.
                const begin = parent.depth * step;
                this.edgesG.appendChild(this.edgeEl(parent, child, begin, reduced));
                // ...and the box at its far end appears the moment the branch lands.
                this.nodesG.appendChild(this.nodeEl(child, begin + step, reduced, false));
                walk(child);
            }
        };
        walk(root);

        // SMIL begin times are measured from the SVG document's own clock, which keeps
        // running between guesses. Without this reset, "begin=1.18s" would already be in
        // the past on the second guess and every branch would snap in at once.
        if (!reduced && typeof this.svg.setCurrentTime === 'function') {
            try { this.svg.setCurrentTime(0); } catch { /* older engines: ignore */ }
        }
    }

    // Lithology patterns, straight out of a soil-profile diagram: fine humus
    // speckle up top, pebbles through the soil horizons, angular clasts in the
    // weathered zone, packed cobbles in bedrock, turf on the surface. Each is a
    // single <pattern> reused by every bed that needs it, so the whole texture
    // layer costs a handful of defs and one extra rect per bed.
    private addPatterns(): void {
        this.defs.insertAdjacentHTML('beforeend', `
<pattern id="tv-grass" width="15" height="22" patternUnits="userSpaceOnUse">
  <path d="M1.5 22 C1 15 3 11 2.5 5 C5 11 5.5 16 5 22 Z" fill="#6b9c46"/>
  <path d="M6.5 22 C6 17 8 13 7.5 8 C10 13 10.5 17 10 22 Z" fill="#7cb050"/>
  <path d="M11 22 C10.5 16 12.5 12 12 7 C14.5 12 15 17 14.5 22 Z" fill="#5c8a3c"/>
</pattern>
<pattern id="tv-organic" width="13" height="13" patternUnits="userSpaceOnUse">
  <circle cx="3" cy="4" r="1.2" fill="rgba(0,0,0,.30)"/>
  <circle cx="9" cy="8" r="0.9" fill="rgba(0,0,0,.24)"/>
  <circle cx="6" cy="11.5" r="0.7" fill="rgba(255,255,255,.12)"/>
  <circle cx="11.5" cy="2" r="0.6" fill="rgba(0,0,0,.22)"/>
</pattern>
<pattern id="tv-topsoil" width="30" height="26" patternUnits="userSpaceOnUse">
  <circle cx="6" cy="7" r="2.6" fill="rgba(255,255,255,.11)"/>
  <circle cx="20" cy="15" r="3.1" fill="rgba(0,0,0,.15)"/>
  <circle cx="27" cy="4" r="1.6" fill="rgba(0,0,0,.12)"/>
  <circle cx="12" cy="21" r="1.9" fill="rgba(255,255,255,.09)"/>
  <circle cx="2" cy="18" r="1.2" fill="rgba(0,0,0,.12)"/>
</pattern>
<pattern id="tv-subsoil" width="34" height="30" patternUnits="userSpaceOnUse">
  <ellipse cx="8" cy="9" rx="4.2" ry="3.2" fill="rgba(0,0,0,.14)"/>
  <ellipse cx="24" cy="20" rx="5" ry="3.6" fill="rgba(255,255,255,.10)"/>
  <circle cx="30" cy="6" r="2" fill="rgba(0,0,0,.11)"/>
  <circle cx="14" cy="26" r="1.6" fill="rgba(0,0,0,.10)"/>
</pattern>
<pattern id="tv-weathered" width="38" height="32" patternUnits="userSpaceOnUse">
  <path d="M3 6 L12 3 L16 11 L7 14 Z" fill="rgba(0,0,0,.17)"/>
  <path d="M20 8 L31 5 L35 14 L24 17 Z" fill="rgba(255,255,255,.10)"/>
  <path d="M6 20 L17 18 L20 28 L9 30 Z" fill="rgba(255,255,255,.08)"/>
  <path d="M25 22 L36 20 L37 30 L27 31 Z" fill="rgba(0,0,0,.15)"/>
</pattern>
<pattern id="tv-bedrock" width="44" height="34" patternUnits="userSpaceOnUse">
  <path d="M2 4 L14 2 L18 12 L6 15 Z" fill="rgba(255,255,255,.13)" stroke="rgba(0,0,0,.22)"/>
  <path d="M21 3 L34 4 L36 14 L23 13 Z" fill="rgba(0,0,0,.16)" stroke="rgba(0,0,0,.22)"/>
  <path d="M4 19 L18 18 L20 31 L7 32 Z" fill="rgba(0,0,0,.14)" stroke="rgba(0,0,0,.22)"/>
  <path d="M24 17 L40 19 L41 31 L26 32 Z" fill="rgba(255,255,255,.11)" stroke="rgba(0,0,0,.22)"/>
</pattern>`);
    }

    // SEDIMENT LAYERS.
    //
    // The tree already has a vertical depth axis that means something — row 3 is a
    // Class, row 7 is a Family — and until now the page never said so. Rock strata
    // read downward as older; taxonomic depth reads downward as more specific. It is
    // the same axis twice, so the bands are not wallpaper: they are the axis labels
    // the drawing was missing.
    //
    // A band is labelled only where the ANSWER'S OWN lineage passes through that row,
    // which is at most one node per row, so a label is never ambiguous. Rows the
    // lineage skips stay unlabelled rather than guessing.
    private drawBands(root: RNode): void {
        const all = this.flatten(root);
        let maxDepth = 0;
        const rankAt = new Map<number, string>();
        for (const n of all) {
            maxDepth = Math.max(maxDepth, n.depth);
            if (n.onAnswerPath && !rankAt.has(n.depth)) rankAt.set(n.depth, n.rank);
        }

        const { x, y, w, h } = this.view;
        const bottom = y + h;
        // preserveAspectRatio="xMidYMid meet" letterboxes the viewBox inside the pane,
        // so anything drawn only to the viewBox's own edges leaves bare margins where
        // the letterbox is. Strata are meant to be the ground the tree sits on, so they
        // run well past it on every side; the SVG viewport clips the overhang for free.
        const bx = x - w;
        const bw = w * 3;
        const SURFACE = -ROW_H / 2;   // ground level: the top edge of the root's bed

        if (THEME.grass) this.addPatterns();

        for (let d = 0; d <= maxDepth; d++) {
            // The row itself sits at d * ROW_H, so its band is centred on that row.
            let top = d * ROW_H - ROW_H / 2;
            let end = (d + 1) * ROW_H - ROW_H / 2;
            // The organic layer STOPS at ground level rather than running upward —
            // above that line is open air with turf on it, not more soil.
            if (d === 0) top = SURFACE;
            if (d === maxDepth) end = Math.max(end, bottom + h);  // last layer runs to bedrock
            if (end <= y - h || top >= bottom + h) continue;

            const bedFill = THEME.bandColumn.length
                ? THEME.bandColumn[Math.min(d, THEME.bandColumn.length - 1)]
                : (d % 2 === 0 ? THEME.bandFill : '');
            if (bedFill) {
                const band = document.createElementNS(SVG_NS, 'rect');
                band.setAttribute('x', String(bx));
                band.setAttribute('y', String(top));
                band.setAttribute('width', String(bw));
                band.setAttribute('height', String(end - top));
                band.setAttribute('fill', bedFill);
                this.bandsG.appendChild(band);

                const tex = THEME.bandTexture[Math.min(d, THEME.bandTexture.length - 1)];
                if (tex) {
                    const grain = band.cloneNode(false) as SVGRectElement;
                    grain.setAttribute('fill', `url(#${tex})`);
                    this.bandsG.appendChild(grain);
                }
            }

            const rule = document.createElementNS(SVG_NS, 'line');
            rule.setAttribute('x1', String(bx));
            rule.setAttribute('x2', String(bx + bw));
            rule.setAttribute('y1', String(top));
            rule.setAttribute('y2', String(top));
            rule.setAttribute('stroke', THEME.bandEdge);
            rule.setAttribute('stroke-width', '1');
            this.bandsG.appendChild(rule);

            if (d === 0 && THEME.grass) {
                const turf = document.createElementNS(SVG_NS, 'rect');
                turf.setAttribute('x', String(bx));
                turf.setAttribute('y', String(SURFACE - 22));
                turf.setAttribute('width', String(bw));
                turf.setAttribute('height', '22');
                turf.setAttribute('fill', 'url(#tv-grass)');
                this.bandsG.appendChild(turf);

                const mat = document.createElementNS(SVG_NS, 'rect');
                mat.setAttribute('x', String(bx));
                mat.setAttribute('y', String(SURFACE - 3));
                mat.setAttribute('width', String(bw));
                mat.setAttribute('height', '4');
                mat.setAttribute('fill', '#4a3520');   // the root mat, grass meeting soil
                this.bandsG.appendChild(mat);
            }

            const rank = rankAt.get(d);
            if (rank && THEME.bandLabels) {
                // The first and last bands deliberately overrun the viewBox, so pin the
                // label to the visible edge rather than the band's true top — otherwise
                // the topmost rank scrolls off into the letterbox and vanishes.
                const label = document.createElementNS(SVG_NS, 'text');
                label.setAttribute('x', String(x + 12));
                label.setAttribute('y', String(Math.max(top, y) + 20));
                label.setAttribute('class', 'tv-band');
                label.setAttribute('fill', THEME.bandText);
                label.textContent = rank.toUpperCase();
                this.bandsG.appendChild(label);
            }
        }
    }

    // one branch: a cubic curve that drops from parent to child, drawn on by dashoffset
    private edgeEl(parent: RNode, child: RNode, begin: number, reduced: boolean): SVGPathElement {
        const y1 = parent.y + BOX_H / 2;
        const y2 = child.y - BOX_H / 2;
        const mid = (y1 + y2) / 2;

        // Same curve Metazooa uses: both control points sit on the midline, which gives
        // the branch its soft S-bend instead of a diagonal.
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', `M${parent.x},${y1} C${parent.x},${mid} ${child.x},${mid} ${child.x},${y2}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');

        // Branch colour fades from the parent's colour into the child's.
        const id = `br${++this.gradSeq}`;
        const grad = document.createElementNS(SVG_NS, 'linearGradient');
        grad.setAttribute('id', id);
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        grad.setAttribute('x1', String(parent.x));
        grad.setAttribute('y1', String(y1));
        grad.setAttribute('x2', String(child.x));
        grad.setAttribute('y2', String(y2));
        const a = document.createElementNS(SVG_NS, 'stop');
        a.setAttribute('offset', '0');
        a.setAttribute('stop-color', parent.fill);
        const b = document.createElementNS(SVG_NS, 'stop');
        b.setAttribute('offset', '1');
        b.setAttribute('stop-color', child.fill);
        grad.appendChild(a);
        grad.appendChild(b);
        this.defs.appendChild(grad);
        path.setAttribute('stroke', `url(#${id})`);

        // Thick trunk, thin dead ends. Metazooa's own widths were 1.5, 3.7, 4.8, 5.9 for
        // subtrees holding 1, 3, 4 and 5 leaves -> width = 1.5 + 1.1 x (leaves - 1).
        path.setAttribute('stroke-width', (1.5 + 1.1 * (child.leafCount - 1)).toFixed(1));

        this.edgesG.appendChild(path);   // must be in the DOM before it can be measured
        let len = 0;
        try { len = path.getTotalLength(); } catch { len = Math.abs(y2 - y1) + Math.abs(child.x - parent.x); }
        if (!len || !isFinite(len)) len = Math.abs(y2 - y1) + Math.abs(child.x - parent.x);

        if (reduced) return path;

        path.setAttribute('stroke-dasharray', `${len} ${len}`);
        path.setAttribute('stroke-dashoffset', String(len));
        const anim = document.createElementNS(SVG_NS, 'animate');
        anim.setAttribute('attributeName', 'stroke-dashoffset');
        anim.setAttribute('from', String(len));
        anim.setAttribute('to', '0');
        anim.setAttribute('dur', `${EDGE_S}s`);
        anim.setAttribute('begin', `${begin.toFixed(2)}s`);
        anim.setAttribute('fill', 'freeze');
        anim.setAttribute('calcMode', 'spline');
        anim.setAttribute('keySplines', '0.33 0 0.15 1');   // ease-out, so it lands softly
        anim.setAttribute('keyTimes', '0;1');
        path.appendChild(anim);
        return path;
    }

    // one labelled box, fading in the moment its branch arrives
    // Bring the tree into view on a stacked (phone) layout.
    //
    // On a wide screen the tree sits beside the input and a guess is visible the
    // instant it lands. On a phone the panes stack, so the tree is below the fold
    // and a guess appears somewhere the player cannot see — they have to scroll
    // down to find out what happened, every single turn.
    //
    // Returns whether it actually scrolled, so the caller can decide whether to
    // drop the soft keyboard: leaving it up would cover the thing we just
    // scrolled to. Does nothing on a wide screen, where this would be a jolt for
    // no reason.
    revealOnNarrow(): boolean {
        if (!window.matchMedia('(max-width: 900px)').matches) return false;
        const target = this.svg.closest('.tree-frame') ?? this.svg;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // update() has just re-laid-out the SVG and it may have grown a row. Wait
        // one frame so we scroll to where the tree ends up, not where it was.
        requestAnimationFrame(() => {
            target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        });
        return true;
    }

    // A small excavation flag, planted on the answer once it has been found.
    //
    // Deliberately NOT drawn on the hidden "?" box: marking the thing you are
    // hunting before you have found it turns a discovery into a signpost. The
    // flag is the reward, so it appears only at the moment the animal is dug up.
    //
    // Drawn in the answer colours rather than a new constant, so it inherits any
    // theme automatically, and kept to ~11px: the row above sits ROW_H (80) away
    // and MARGIN (26) clears the top of the drawing, so it can neither collide
    // nor be clipped.
    private answerFlag(w: number): SVGGElement {
        const g = document.createElementNS(SVG_NS, 'g');
        // Planted at the top-RIGHT corner, not centred: the branch line from the
        // parent clade comes down into the middle of the box's top edge, and a
        // centred flag sits directly on top of it.
        g.setAttribute('transform', `translate(${w / 2 - 7},${-BOX_H / 2 - 2})`);
        // Never steal the click: the box underneath owns it, and on the hidden
        // answer there is deliberately no click to steal.
        g.setAttribute('style', 'pointer-events:none');

        const pole = document.createElementNS(SVG_NS, 'line');
        pole.setAttribute('x1', '0');
        pole.setAttribute('y1', '0');
        pole.setAttribute('x2', '0');
        pole.setAttribute('y2', '-11');
        pole.setAttribute('stroke', THEME.wonStroke);
        pole.setAttribute('stroke-width', '1.6');
        pole.setAttribute('stroke-linecap', 'round');

        const pennant = document.createElementNS(SVG_NS, 'path');
        pennant.setAttribute('d', 'M0,-11 L7.5,-8.2 L0,-5.4 Z');
        pennant.setAttribute('stroke', THEME.wonStroke);
        pennant.setAttribute('stroke-width', '1.4');
        pennant.setAttribute('stroke-linejoin', 'round');
        pennant.setAttribute('fill', THEME.wonFill);

        g.appendChild(pole);
        g.appendChild(pennant);
        return g;
    }

    private nodeEl(node: RNode, begin: number, reduced: boolean, isRoot: boolean): SVGGElement {
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('transform', `translate(${node.x},${node.y})`);
        g.setAttribute('data-kind', node.kind);

        const isLeaf = node.children.length === 0;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(-node.w / 2));
        rect.setAttribute('y', String(-BOX_H / 2));
        rect.setAttribute('width', String(node.w));
        rect.setAttribute('height', String(BOX_H));
        rect.setAttribute('rx', isLeaf ? '3' : '5');   // Metazooa: soft on clades
        rect.setAttribute('stroke-width', '2');
        if (THEME.shadow) rect.setAttribute('style', THEME.shadow);

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('class', 'tv-text');
        text.setAttribute('style', 'user-select:none; pointer-events:none');
        text.textContent = node.label;

        // Filled clade boxes with light text; white leaf boxes outlined in their colour.
        switch (node.kind) {
            case 'root':
            case 'ancestor':
                rect.setAttribute('fill', node.fill);
                rect.setAttribute('stroke', THEME.boneStroke || node.fill);
                text.setAttribute('fill', node.textFill);
                break;
            case 'revealed':
                rect.setAttribute('fill', node.fill);
                rect.setAttribute('stroke', THEME.revealedStroke);
                rect.setAttribute('stroke-dasharray', '5 3');
                text.setAttribute('fill', node.textFill);
                break;
            case 'guess':
                rect.setAttribute('fill', THEME.fillLeaves ? node.fill : THEME.leafFill);
                rect.setAttribute('stroke', THEME.fillLeaves ? (THEME.boneStroke || node.fill) : node.fill);
                text.setAttribute('fill', THEME.fillLeaves ? node.textFill : THEME.leafText);
                break;
            case 'answer':
                // still in the ground: an empty socket cut into the matrix
                rect.setAttribute('fill', THEME.fillLeaves ? 'none' : THEME.leafFill);
                rect.setAttribute('stroke', THEME.fillLeaves ? (THEME.boneStroke || node.fill) : node.fill);
                rect.setAttribute('stroke-dasharray', '5 3');
                text.setAttribute('fill', THEME.fillLeaves ? (THEME.boneStroke || node.fill) : node.fill);
                break;
            case 'answerRevealed':
                rect.setAttribute('fill', THEME.wonFill);
                rect.setAttribute('stroke', THEME.wonStroke);
                text.setAttribute('fill', THEME.wonText);
                break;
        }

        const title = document.createElementNS(SVG_NS, 'title');
        title.textContent = node.title;

        g.appendChild(rect);
        g.appendChild(text);
        g.appendChild(title);
        if (node.kind === 'answerRevealed') {
            g.appendChild(this.answerFlag(node.w));
        }

        // Every clade and every animal can be clicked to read about it. The one
        // exception is the hidden answer: clicking "?" must not give the game away.
        if (node.kind !== 'answer') {
            g.style.cursor = 'pointer';
            g.setAttribute('tabindex', '0');
            g.setAttribute('role', 'button');
            const fire = () => this.onSelect?.(node.taxonId);
            g.addEventListener('click', fire);
            g.addEventListener('keydown', (ev) => {
                const k = (ev as KeyboardEvent).key;
                if (k === 'Enter' || k === ' ') { ev.preventDefault(); fire(); }
            });
        } else {
            g.style.cursor = 'default';
        }

        if (isRoot || reduced) {
            g.setAttribute('opacity', '1');
            return g;
        }
        g.setAttribute('opacity', '0');
        const anim = document.createElementNS(SVG_NS, 'animate');
        anim.setAttribute('attributeName', 'opacity');
        anim.setAttribute('from', '0');
        anim.setAttribute('to', '1');
        anim.setAttribute('dur', `${POP_S}s`);
        anim.setAttribute('begin', `${begin.toFixed(2)}s`);
        anim.setAttribute('fill', 'freeze');
        g.appendChild(anim);
        return g;
    }
}
