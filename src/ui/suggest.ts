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

    const popup = document.createElement('div');
    popup.className = 'suggest-popup';
    popup.hidden = true;
    wrap.appendChild(popup);

    const list = document.createElement('ul');
    list.className = 'suggest';
    list.id = 'guess-suggest';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    popup.appendChild(list);

    // Mobile browsers can hide native scrollbars even when the list overflows.
    // Keep a visible thumb alongside the native scrolling list.
    const scrollbar = document.createElement('div');
    scrollbar.className = 'suggest-scrollbar';
    scrollbar.setAttribute('aria-hidden', 'true');
    scrollbar.hidden = true;
    const thumb = document.createElement('div');
    thumb.className = 'suggest-scroll-thumb';
    scrollbar.appendChild(thumb);
    popup.appendChild(scrollbar);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', list.id);
    // The browser's own history dropdown would cover ours.
    input.setAttribute('autocomplete', 'off');
    input.removeAttribute('list');

    let shown: Indexed[] = [];
    let active = -1;
    let keepOpenOnBlur = false;
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    let gesture: {
        pointerId: number; row: Element | null; x: number; y: number;
        scrollTop: number; moved: boolean;
    } | null = null;
    let drag: { pointerId: number; offset: number } | null = null;

    const syncScrollbar = () => {
        if (list.hidden) return;
        const overflowing = list.scrollHeight > list.clientHeight + 1;
        scrollbar.hidden = !overflowing;
        popup.classList.toggle('is-scrollable', overflowing);
        if (!overflowing) return;
        const height = scrollbar.clientHeight;
        const thumbHeight = Math.min(height, Math.max(24, height * list.clientHeight / list.scrollHeight));
        const maxScroll = list.scrollHeight - list.clientHeight;
        const progress = Math.max(0, Math.min(1, list.scrollTop / maxScroll));
        thumb.style.height = `${thumbHeight}px`;
        thumb.style.transform = `translateY(${progress * (height - thumbHeight)}px)`;
    };

    const close = () => {
        clearTimeout(blurTimer);
        popup.hidden = true;
        list.hidden = true;
        list.innerHTML = '';
        shown = [];
        active = -1;
        keepOpenOnBlur = false;
        gesture = null;
        drag = null;
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
        // Focusing a field blurred by a touch can render the list again.
        input.focus({ preventScroll: true });
        close();
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
        popup.hidden = false;
        list.scrollTop = 0;
        gesture = null;
        input.setAttribute('aria-expanded', 'true');
        setActive(-1);
        syncScrollbar();
    };

    input.addEventListener('input', render);
    input.addEventListener('focus', () => {
        clearTimeout(blurTimer);
        keepOpenOnBlur = false;
        render();
    });

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

    // Let touch gestures scroll normally. Only a completed click/tap picks a row;
    // movement, native scrolling and pointer cancellation all disqualify a tap.
    list.addEventListener('pointerdown', (ev) => {
        clearTimeout(blurTimer);
        keepOpenOnBlur = true;
        const row = (ev.target as Element).closest('li');
        gesture = {
            pointerId: ev.pointerId, row, x: ev.clientX, y: ev.clientY,
            scrollTop: list.scrollTop, moved: !ev.isPrimary || ev.button !== 0,
        };
        // Keep the input focused for mouse clicks without preventing touch pans.
        if (ev.pointerType === 'mouse' && row && ev.button === 0) ev.preventDefault();
    });
    list.addEventListener('pointermove', (ev) => {
        if (gesture?.pointerId !== ev.pointerId) return;
        if (Math.hypot(ev.clientX - gesture.x, ev.clientY - gesture.y) > 10) gesture.moved = true;
    });
    list.addEventListener('pointercancel', () => {
        if (gesture) gesture.moved = true;
    });
    list.addEventListener('scroll', () => {
        if (gesture && list.scrollTop !== gesture.scrollTop) gesture.moved = true;
        syncScrollbar();
    }, { passive: true });
    list.addEventListener('click', (ev) => {
        const li = (ev.target as Element).closest('li');
        if (!li || ev.button !== 0) return;
        // detail=0 is keyboard/assistive activation, which has no pointer gesture.
        if (ev.detail !== 0 && (!gesture || gesture.moved || gesture.row !== li
            || list.scrollTop !== gesture.scrollTop)) return;
        pick([...list.children].indexOf(li));
    });

    const dragScrollbar = (clientY: number) => {
        if (!drag) return;
        const travel = scrollbar.clientHeight - thumb.getBoundingClientRect().height;
        if (travel <= 0) return;
        const top = clientY - scrollbar.getBoundingClientRect().top - drag.offset;
        list.scrollTop = Math.max(0, Math.min(1, top / travel)) * (list.scrollHeight - list.clientHeight);
        syncScrollbar();
    };
    scrollbar.addEventListener('pointerdown', (ev) => {
        if (!ev.isPrimary || ev.button !== 0) return;
        ev.preventDefault();
        clearTimeout(blurTimer);
        keepOpenOnBlur = true;
        gesture = null;
        const bounds = thumb.getBoundingClientRect();
        drag = {
            pointerId: ev.pointerId,
            offset: ev.target === thumb ? ev.clientY - bounds.top : bounds.height / 2,
        };
        scrollbar.setPointerCapture(ev.pointerId);
        dragScrollbar(ev.clientY);
    });
    scrollbar.addEventListener('pointermove', (ev) => {
        if (drag?.pointerId === ev.pointerId) dragScrollbar(ev.clientY);
    });
    const endDrag = (ev: PointerEvent) => {
        if (drag?.pointerId !== ev.pointerId) return;
        drag = null;
        if (scrollbar.hasPointerCapture(ev.pointerId)) scrollbar.releasePointerCapture(ev.pointerId);
    };
    scrollbar.addEventListener('pointerup', endDrag);
    scrollbar.addEventListener('pointercancel', endDrag);
    scrollbar.addEventListener('lostpointercapture', () => { drag = null; });
    new ResizeObserver(syncScrollbar).observe(list);

    input.addEventListener('blur', () => {
        blurTimer = setTimeout(() => { if (!keepOpenOnBlur) close(); }, 120);
    });
    // A touch may blur the input while the user is still browsing the list.
    // Close on an actual outside interaction, not midway through that swipe.
    document.addEventListener('pointerdown', (ev) => {
        if (!wrap.contains(ev.target as Node)) close();
    });
    document.addEventListener('focusin', (ev) => {
        if (!wrap.contains(ev.target as Node)) close();
    });

    // A submitted guess clears the field programmatically, which fires no input
    // event — so close from the form instead of waiting for one that never comes.
    input.form?.addEventListener('submit', close);
}
