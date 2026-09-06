// gameState.ts — the referee. Holds the secret answer, the guesses, and the hints.
// It never touches the DOM.

import { nodeLookup, nameLookup, normaliseName, ancestorsOf, rootId, depthLookup } from '../data/loadTree';
import type { DinoNode } from '../data/loadTree';
import { lcaInfo } from './lca';
import type { LcaInfo } from './lca';

export const MAX_GUESSES = 20;
export const HINT_COST = 3;

export interface GuessRecord {
    guessId: number;
    guessNode: DinoNode;
    info: LcaInfo;
    order: number;
}

export type GuessOutcome =
    | { status: 'unknown' }
    | { status: 'duplicate'; record: GuessRecord }
    | { status: 'over' }
    | { status: 'ok'; record: GuessRecord }
    | { status: 'win'; record: GuessRecord }
    | { status: 'lose'; record: GuessRecord };

// Endless mode plays by different numbers: a shorter budget per animal, and hints
// that are capped rather than paid for. Rather than fork the referee, the rules it
// enforces are handed in.
export interface Rules {
    maxGuesses: number;
    hintCost: number;    // guesses deducted per hint; 0 = free
    maxHints: number;    // how many hints are available at all
}

export const DAILY_RULES: Rules = {
    maxGuesses: MAX_GUESSES,
    hintCost: HINT_COST,
    maxHints: Infinity,   // the guess cost is the limit
};

export const ENDLESS_RULES: Rules = {
    maxGuesses: 10,
    hintCost: 0,          // free — the cap below is the limit instead
    maxHints: 3,
};

export class GameState {
    readonly answerId: number;
    readonly rules: Rules;
    readonly guesses: GuessRecord[] = [];
    readonly revealedIds: number[] = [];   // ranks bought with hints
    won = false;

    private byId = new Map<number, GuessRecord>();

    constructor(answerId: number, rules: Rules = DAILY_RULES) {
        this.answerId = answerId;
        this.rules = rules;
    }

    get answerNode(): DinoNode {
        return nodeLookup[this.answerId];
    }

    // A hint costs whatever the current rules say it costs (0 in endless).
    get guessesUsed(): number {
        return this.guesses.length + this.revealedIds.length * this.rules.hintCost;
    }

    get remaining(): number {
        return Math.max(0, this.rules.maxGuesses - this.guessesUsed);
    }

    get hintsLeft(): number {
        return Math.max(0, this.rules.maxHints - this.revealedIds.length);
    }

    get lost(): boolean {
        return !this.won && this.remaining <= 0;
    }

    get over(): boolean {
        return this.won || this.lost;
    }

    resolve(rawName: string): number | null {
        const id = nameLookup[normaliseName(rawName)];
        return id === undefined ? null : id;
    }

    private makeRecord(guessId: number): GuessRecord {
        return {
            guessId,
            guessNode: nodeLookup[guessId],
            info: lcaInfo(this.answerId, guessId),
            order: this.guesses.length + 1,
        };
    }

    // The deepest ancestor of the answer the player has uncovered so far
    // (from guesses AND hints). Starts at the root.
    bestKnownId(): number {
        let best = rootId;
        const consider = (id: number) => {
            if (depthLookup[id] > depthLookup[best]) best = id;
        };
        for (const g of this.guesses) if (g.guessId !== this.answerId) consider(g.info.lcaId);
        for (const id of this.revealedIds) consider(id);
        return best;
    }

    // The next rank down the answer's lineage — what a hint would reveal.
    // Returns null if the only thing left to reveal IS the answer.
    nextHintId(): number | null {
        const lineage = ancestorsOf(this.answerId).reverse(); // [root, ..., answer]
        const best = this.bestKnownId();
        const idx = lineage.indexOf(best);
        if (idx === -1 || idx + 1 >= lineage.length) return null;
        const next = lineage[idx + 1];
        return next === this.answerId ? null : next;
    }

    // A hint must leave at least one guess behind, so we need MORE than it costs.
    // With a free hint (cost 0) that check passes trivially and the cap does the work.
    canHint(): boolean {
        return !this.over
            && this.remaining > this.rules.hintCost
            && this.hintsLeft > 0
            && this.nextHintId() !== null;
    }

    useHint(): number | null {
        if (!this.canHint()) return null;
        const id = this.nextHintId();
        if (id === null) return null;
        this.revealedIds.push(id);
        return id;
    }

    submitGuess(rawName: string): GuessOutcome {
        if (this.over) return { status: 'over' };

        const guessId = this.resolve(rawName);
        if (guessId === null) return { status: 'unknown' };

        const existing = this.byId.get(guessId);
        if (existing) return { status: 'duplicate', record: existing };

        const record = this.makeRecord(guessId);
        this.guesses.push(record);
        this.byId.set(guessId, record);

        if (guessId === this.answerId) {
            this.won = true;
            return { status: 'win', record };
        }
        if (this.remaining <= 0) return { status: 'lose', record };
        return { status: 'ok', record };
    }

    // Rebuild from saved ids when restoring today's game.
    restore(guessIds: number[], revealedIds: number[]): void {
        for (const id of revealedIds) {
            if (nodeLookup[id] !== undefined) this.revealedIds.push(id);
        }
        for (const id of guessIds) {
            if (this.byId.has(id) || nodeLookup[id] === undefined) continue;
            const record = this.makeRecord(id);
            this.guesses.push(record);
            this.byId.set(id, record);
            if (id === this.answerId) this.won = true;
        }
    }
}
