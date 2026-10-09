import type { GameState } from '../game/gameState';
import type { ExtraHintKind, ExtraHintRecord } from '../game/hintTypes';
import { clueVersion, currentClue } from '../game/animalClues';
import { nodeLookup } from '../data/loadTree';
import { track } from '../analytics';
import { focusWithoutSuggestions } from './suggest';

export const BOOK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14"/><path d="M6 9h3m-3 4h3m6-4h3m-3 4h3"/></svg>';
const NAME_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 8a4 4 0 0 1 8 0c0 3-4 3-4 6"/><circle cx="12" cy="18" r=".85" fill="currentColor" stroke="none"/></svg>';
const TREE_ICON = '<svg viewBox="0 0 100 64" fill="none" aria-hidden="true"><g class="milestone-branch"><path d="M50 16v15M22 44V31h56v13"/><rect x="35" y="2" width="30" height="14" rx="3"/><rect x="7" y="44" width="30" height="14" rx="3"/><rect x="63" y="44" width="30" height="14" rx="3"/></g></svg>';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const label = (kind: ExtraHintKind) => kind === 'factual' ? 'Factual Hint' : 'Name Clue';
const choices = (prefix: string) => (['factual', 'name'] as const).map(kind => `
  <div class="extra-choice">
    <button type="button" class="extra-hint ${kind}" id="${prefix}-${kind}" aria-describedby="${prefix}-${kind}-reason">
      <span class="extra-icon">${kind === 'factual' ? BOOK_ICON : NAME_ICON}</span>
      <span class="extra-label">${label(kind)}</span>
      <span class="extra-price"></span>
    </button>
    <p class="extra-reason" id="${prefix}-${kind}-reason"></p>
  </div>`).join('');

/** One controller per active mode; all rule decisions stay in GameState. */
export class HintUI {
    private getState: () => GameState;
    private changed: () => void;
    private section: HTMLElement;
    private dialog: HTMLDialogElement;
    private cooldownUntil = 0;
    private lastState: GameState | null = null;
    private observer: MutationObserver;

    constructor(getState: () => GameState, changed: () => void) {
        this.getState = getState;
        this.changed = changed;
        this.section = document.getElementById('extra-hints')!;
        this.section.innerHTML = `<div class="extra-heading"><span>Extra hints unlocked</span><small class="extra-allowance"></small></div>
          <div class="extra-choices">${choices('extra')}</div>
          <div class="hint-journal" aria-live="polite" aria-atomic="false"></div>`;
        this.dialog = document.createElement('dialog');
        this.dialog.className = 'milestone-dialog modal-card';
        this.dialog.setAttribute('aria-labelledby', 'milestone-title');
        this.dialog.setAttribute('aria-describedby', 'milestone-progress milestone-unlocks milestone-description');
        this.dialog.setAttribute('aria-modal', 'true');
        this.dialog.innerHTML = `<button type="button" class="milestone-close modal-close" aria-label="Close celebration">×</button>
          <div class="milestone-emblem">${TREE_ICON}</div>
          <p class="milestone-eyebrow"></p>
          <h2 id="milestone-title" tabindex="-1">You found the last Clade!</h2>
          <h3 id="milestone-progress">New Hints unlocked!</h3>
          <ul id="milestone-unlocks" class="milestone-unlocks">
            <li class="milestone-unlock factual"><span class="milestone-unlock-icon">${BOOK_ICON}</span><strong>Factual Hints</strong></li>
            <li class="milestone-unlock name"><span class="milestone-unlock-icon">${NAME_ICON}</span><strong>Name Clues</strong></li>
          </ul>
          <p id="milestone-description">First hint is <strong>FREE!</strong></p>
          <button type="button" class="milestone-continue share-btn">Continue playing</button>`;
        document.body.append(this.dialog);
        this.dialog.addEventListener('keydown', e => {
            if (e.key !== 'Tab') return;
            const buttons = [...this.dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            // Explicit cycling also works with Safari's default keyboard setting,
            // which otherwise skips some button controls when Tab is pressed.
            e.preventDefault();
            const next = index < 0 ? (e.shiftKey ? buttons.length - 1 : 0)
                : (index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
        });
        this.dialog.querySelectorAll('.milestone-close, .milestone-continue').forEach(b => b.addEventListener('click', () => this.dialog.close()));
        this.dialog.addEventListener('click', e => {
            if (e.target === this.dialog) {
                const r = this.dialog.getBoundingClientRect();
                if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.dialog.close();
            }
        });
        this.dialog.addEventListener('close', () => {
            document.body.classList.remove('milestone-open');
            const input = document.getElementById('guess-input') as HTMLInputElement | null;
            if (!this.getState().over && input) focusWithoutSuggestions(input);
        });
        for (const kind of ['factual', 'name'] as const) {
            document.getElementById(`extra-${kind}`)!.addEventListener('click', () => this.purchase(kind));
        }
        // A pending milestone waits for existing app dialogs to close.
        this.observer = new MutationObserver(() => this.maybeCelebrate());
        for (const el of document.querySelectorAll('#modal, #howto')) {
            this.observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        }
    }

    private purchase(kind: ExtraHintKind): void {
        if (Date.now() < this.cooldownUntil) return;
        const state = this.getState();
        const receipt = state.useExtraHint(kind, state.extraHints.length);
        if (!receipt) { this.refresh(); return; }
        this.cooldownUntil = Date.now() + 650;
        track(`hint-${kind}-used`);
        this.changed();
        this.refresh();
        window.setTimeout(() => this.refresh(), 660);
    }

    private hintText(state: GameState, hint: ExtraHintRecord): string {
        if (hint.type === 'name') return state.revealedName ?? '';
        if (clueVersion() === 'unavailable') return 'This saved fact could not be loaded. Its original cost is preserved.';
        if (hint.version !== clueVersion()) return 'This saved fact has been retired after a content update. Its original cost is preserved.';
        return currentClue(state.answerId, hint.id)?.text
            ?? 'This saved fact is currently unavailable. Its original cost is preserved.';
    }

    refresh(): void {
        const state = this.getState();
        if (this.lastState !== state) {
            if (this.dialog.open) this.dialog.close();
            this.cooldownUntil = 0;
            this.lastState = state;
        }
        this.section.hidden = !state.reachedFinalClade && state.extraHints.length === 0;
        const price = state.extraHintPrice === 0 ? 'Free'
            : `Exchange ${state.extraHintPrice} ${state.extraHintPrice === 1 ? 'guess' : 'guesses'}`;
        const allowance = state.extraHintPrice === 0 ? 'Your first hint is free—choose either type.' : 'Each additional hint costs 1 guess.';
        this.section.querySelector('.extra-allowance')!.textContent = allowance;
        for (const kind of ['factual', 'name'] as const) {
            const reason = state.extraHintUnavailable(kind);
            const button = document.getElementById(`extra-${kind}`) as HTMLButtonElement;
            button.disabled = Boolean(reason) || Date.now() < this.cooldownUntil;
            button.querySelector('.extra-price')!.textContent = price;
            document.getElementById(`extra-${kind}-reason`)!.textContent = reason ?? '';
        }
        // Keep the journal independent of the clade-description card.
        const facts = state.extraHints.filter(h => h.type === 'factual');
        const journal = facts.map(h => `<p class="journal-fact"><span>${BOOK_ICON} Factual Hint</span>${escape(this.hintText(state, h))}</p>`);
        if (state.revealedName) journal.push(`<p class="journal-name"><span>${NAME_ICON} Name Clue</span><strong>${escape(state.revealedName)}</strong></p>`);
        const journalEl = this.section.querySelector('.hint-journal')!;
        const html = journal.join('');
        if (journalEl.innerHTML !== html) journalEl.innerHTML = html;
        if (state.over && this.dialog.open) this.dialog.close();
        this.maybeCelebrate();
    }

    private maybeCelebrate(): void {
        const state = this.getState();
        if (state.over || !state.reachedFinalClade || state.milestoneShown || this.dialog.open
            || document.querySelector('.modal.open')) return;
        const clade = nodeLookup[state.bestKnownId()];
        this.dialog.querySelector('.milestone-eyebrow')!.textContent = clade.scientific;
        this.dialog.showModal();
        // Start at the reward heading, not an off-screen footer on short phones.
        (this.dialog.querySelector('#milestone-title') as HTMLElement).focus({ preventScroll: true });
        this.dialog.scrollTop = 0;
        document.body.classList.add('milestone-open');
        state.milestoneShown = true;
        track('final-clade-reached');
        this.changed();
    }
}
