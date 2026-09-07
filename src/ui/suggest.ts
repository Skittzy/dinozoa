// suggest.ts — the guess autocomplete, drawn by us instead of by the browser.
//
// WHY THIS EXISTS AT ALL
//
// This replaces <datalist>. That element worked on desktop and did nothing useful
// on a phone: iOS Safari implements it only partially and does not show the list,
// and since every iOS browser is WebKit underneath, Chrome and Firefox on an
// iPhone behave identically. On a game where you have to type genus names, that
// left roughly 40% of visitors typing "Tyrannosaurus" blind.
//
// It could not be fixed from the page. A datalist's dropdown is browser chrome —
// rendered outside the document, unstylable, and impossible to open from script.
// You can verify that in ten seconds: open the old build, type until the list
// appears, and try to find it in the element inspector. It is not in the tree.
// The only route is to stop asking the browser for a list and draw a real one.
//
// WHAT IT DOES THAT DATALIST COULD NOT
//
//   - shows the common name beside the genus, dimmed
//   - highlights the part you have actually typed
//   - ranks prefix matches above matches buried mid-word
//
// Matching normalisation is IMPORTED from loadTree rather than rewritten here.
// Two copies of "how do we fold T. rex, t-rex and T Rex together" would drift, and
// this project has been bitten by a duplicated scoring rule before.

import { normaliseName } from '../data/loadTree';

export interface SuggestEntry {
    /** What lands in the input when this row is picked. */
    value: string;
    /** Primary text — the genus, or the slang someone typed. */
    main: string;
    /** Dimmed trailing text: a common name, or the genus a slang maps to. */
    hint?: string;
}

// No cap: every match is listed, the way the browser's own dropdown listed them.
// One innerHTML write of a few hundred rows is a single parse and costs well under
// a frame, so the honest constraint is the scroll box's height, not a magic number
// that hides animals someone was halfway through typing.

interface Indexed extends SuggestEntry { nMain: string; nHint: string }

// Lower is better. -1 means no match at all.
function rank(e: Indexed, q: string): number {
    if (e.nMain.startsWith(q)) return 0;
    if (e.nHint && e.nHint.startsWith(q)) return 1;
    // A prefix of any later word, so "rex" finds "Tyrannosaurus rex".
    if (e.nMain.includes(' ' + q)) return 2;
    if (e.nHint && e.nHint.includes(' ' + q)) return 3;
    if (e.nMain.includes(q)) return 4;
    if (e.nHint && e.nHint.includes(q)) return 5;
    return -1;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESCAPES[c]);

// Bold the typed run inside a label. Matched on the RAW text, not the normalised
// one: normalising rewrites characters, so an index into it would not line up with
// what is on screen. If the raw text does not contain the query verbatim (say the
// match came through a folded dot) the row simply renders unhighlighted, which is
// a much better failure than a highlight sitting over the wrong letters.
function mark(text: string, typed: string): string {
    if (!typed) return esc(text);
    const i = text.toLowerCase().indexOf(typed.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<b>' + esc(text.slice(i, i + typed.length))
        + '</b>' + esc(text.slice(i + typed.length));
}

/**
 * Wire an autocomplete onto a text input. Safe to call once per page; it takes
 * over the input's parent layout by wrapping it, so the list can be positioned
 * against the input rather than against the whole row (which includes the Guess
 * button and would make the list too wide).
 */
export function attachSuggest(input: HTMLInputElement, entries: SuggestEntry[]): void {
    const items: Indexed[] = entries.map((e) => ({
        ...e,
        nMain: normaliseName(e.main),
        nHint: e.hint ? normaliseName(e.hint) : '',
    }));
    // Shown when the field is focused but empty, so it offers the whole list the
    // moment it is tapped — the same thing an empty datalist did.
    const alphabetical = [...items].sort((a, b) => a.nMain.localeCompare(b.nMain));

    const wrap = document.createElement('div');
    wrap.className = 'suggest-wrap';
    input.parentNode!.insertBefore(wrap, input);
    wrap.appendChild(input);

    const list = document.createElement('ul');
    list.className = 'suggest';
    list.id = 'guess-suggest';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrap.appendChild(list);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', list.id);
    // The browser's own history dropdown would cover ours.
    input.setAttribute('autocomplete', 'off');
    input.removeAttribute('list');

    let shown: Indexed[] = [];
    let active = -1;

    const close = () => {
        list.hidden = true;
        list.innerHTML = '';
        shown = [];
        active = -1;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
    };

    const setActive = (i: number) => {
        active = i;
        [...list.children].forEach((li, n) => {
            const on = n === i;
            li.classList.toggle('on', on);
            li.setAttribute('aria-selected', String(on));
        });
        if (i >= 0) {
            input.setAttribute('aria-activedescendant', `suggest-${i}`);
            (list.children[i] as HTMLElement).scrollIntoView({ block: 'nearest' });
        } else {
            input.removeAttribute('aria-activedescendant');
        }
    };

    const pick = (i: number) => {
        const e = shown[i];
        if (!e) return;
        input.value = e.value;
        close();
        input.focus();
    };

    const render = () => {
        const typed = input.value.trim();
        const q = normaliseName(typed);

        if (!q) {
            // Focused with nothing typed: offer the lot, alphabetically, exactly as
            // clicking an empty field used to.
            shown = alphabetical;
        } else {
            shown = items
                .map((e) => ({ e, r: rank(e, q) }))
                .filter((x) => x.r >= 0)
                .sort((a, b) => a.r - b.r || a.e.nMain.length - b.e.nMain.length)
                .map((x) => x.e);
        }

        if (!shown.length) { close(); return; }

        list.innerHTML = shown.map((e, i) =>
            `<li role="option" id="suggest-${i}" aria-selected="false">` +
            `<span class="s-main">${mark(e.main, typed)}</span>` +
            (e.hint ? `<span class="s-hint">${mark(e.hint, typed)}</span>` : '') +
            `</li>`).join('');
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        setActive(-1);
    };

    input.addEventListener('input', render);
    input.addEventListener('focus', render);

    input.addEventListener('keydown', (ev) => {
        if (list.hidden) return;
        switch (ev.key) {
            case 'ArrowDown':
                ev.preventDefault();
                setActive(active + 1 >= shown.length ? 0 : active + 1);
                break;
            case 'ArrowUp':
                ev.preventDefault();
                setActive(active <= 0 ? shown.length - 1 : active - 1);
                break;
            case 'Enter':
                // Only swallow the Enter if a row is actually highlighted —
                // otherwise this is someone submitting what they typed.
                if (active >= 0) { ev.preventDefault(); pick(active); }
                else close();
                break;
            case 'Escape':
                ev.preventDefault();
                close();
                break;
            case 'Tab':
                close();
                break;
        }
    });

    // pointerdown, not click: the input blurs before a click completes, and a
    // blur-driven close would remove the row out from under the finger. Cancelling
    // the default here also stops the field losing focus in the first place.
    list.addEventListener('pointerdown', (ev) => {
        const li = (ev.target as HTMLElement).closest('li');
        if (!li) return;
        ev.preventDefault();
        pick([...list.children].indexOf(li));
    });

    input.addEventListener('blur', () => setTimeout(close, 120));

    // A submitted guess clears the field programmatically, which fires no input
    // event — so close from the form instead of waiting for one that never comes.
    input.form?.addEventListener('submit', close);
}
