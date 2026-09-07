// installPrompt.ts — "add it to your home screen", asked once, at the right moment.
//
// A daily game lives or dies on people coming back tomorrow, and this one has no
// accounts, no email list and no push notifications. The home screen icon is the
// only channel there is for a second visit, so it is worth asking for. Once.
//
// Two rules shape everything below.
//
// WHEN: after a finished game, never on arrival. Someone who has not played yet
// has no reason to say yes, and asking anyway spends the single ask along with
// some goodwill. Someone who has just seen the end screen is already looking at
// the countdown wondering when the next animal lands — "one tap away tomorrow"
// answers the question they are already asking.
//
// WHERE: after the end-game modal closes, never inside it. That modal exists to
// get the result shared, which is why the support link was deliberately kept out
// of it. Sharing brings new players; installing retains one. At launch sharing
// wins that trade, so nothing goes beside the share button.

import { track } from '../analytics';

const KEY = 'dinozoa.install.v1';

type InstallEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// Chrome fires this once, early, and it cannot be asked for again — so it has to
// be captured at module load, long before any game is finished. preventDefault
// suppresses Chrome's own mini-infobar so the moment is ours to choose.
let deferred: InstallEvent | null = null;
window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    deferred = ev as InstallEvent;
});

// A localStorage that throws — private mode, blocked site data — reads as
// "already asked". Staying quiet is a better failure here than nagging on
// every single reload.
function asked(): boolean {
    try { return localStorage.getItem(KEY) !== null; } catch { return true; }
}

function remember(outcome: string): void {
    try { localStorage.setItem(KEY, outcome); } catch { /* nothing sensible to do */ }
}

function installed(): boolean {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    // iOS does not report display-mode for home screen launches; it has its own
    // non-standard flag instead.
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// Apple has never shipped beforeinstallprompt, so on iOS the only route is
// telling the player where the button is. Every iOS browser is WebKit, so this
// covers Chrome and Firefox on iPhone too. iPadOS 13+ claims to be a Mac, hence
// the touch-point test.
function isIOS(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

// The iOS share glyph, drawn rather than named: "tap Share" means nothing to
// someone who has never noticed which icon that is.
const SHARE_GLYPH =
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">' +
    '<path d="M12 3.2v10.4M12 3.2 8.9 6.3M12 3.2l3.1 3.1" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M7.6 10.4H5.4a1.2 1.2 0 0 0-1.2 1.2v7.2a1.2 1.2 0 0 0 1.2 1.2h13.2a1.2 1.2 0 0 0 ' +
    '1.2-1.2v-7.2a1.2 1.2 0 0 0-1.2-1.2h-2.2" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function eligible(): boolean {
    if (asked() || installed()) return false;
    // Phones and small tablets only: the home screen is where this pays off.
    if (!window.matchMedia('(max-width: 900px)').matches) return false;
    // With neither Chrome's event nor an iOS share sheet to point at, there is no
    // instruction we could honestly give — so say nothing.
    return deferred !== null || isIOS();
}

function show(): void {
    const android = deferred !== null;
    const strip = document.createElement('div');
    strip.className = 'install-strip';
    strip.setAttribute('role', 'dialog');
    strip.setAttribute('aria-label', 'Add Dinozoa to your home screen');
    strip.innerHTML =
        '<div class="install-text"><strong>Play tomorrow in one tap</strong>' +
        (android
            ? '<span>Add Dinozoa to your home screen.</span>'
            : `<span>Tap ${SHARE_GLYPH} then <b>Add to Home Screen</b>.</span>`) +
        '</div>' +
        (android ? '<button type="button" class="install-add">Add</button>' : '') +
        '<button type="button" class="install-close" aria-label="Not now">&times;</button>';

    document.body.appendChild(strip);
    requestAnimationFrame(() => strip.classList.add('in'));

    // Asked once, whatever happens next. A daily game that nags is a deleted one.
    remember('shown');
    track('install-prompt-shown');

    const close = (why: 'accepted' | 'dismissed') => {
        track(`install-prompt-${why}`);
        strip.classList.remove('in');
        setTimeout(() => strip.remove(), 300);
    };

    (strip.querySelector('.install-close') as HTMLButtonElement).onclick =
        () => close('dismissed');

    const add = strip.querySelector('.install-add') as HTMLButtonElement | null;
    if (add) {
        add.onclick = async () => {
            const ev = deferred;
            deferred = null;              // the event is single-use
            if (!ev) { close('dismissed'); return; }
            await ev.prompt();
            const { outcome } = await ev.userChoice;
            close(outcome === 'accepted' ? 'accepted' : 'dismissed');
        };
    }
}

/**
 * Arm the offer. Safe to call at any point around the end of a game: it waits for
 * the given modal to be opened and then closed again before showing anything, so
 * it cannot land on top of the end screen no matter when it is called.
 */
export function offerInstallAfterModal(modal: HTMLElement): void {
    if (!eligible()) return;
    let wasOpen = modal.classList.contains('open');
    const obs = new MutationObserver(() => {
        if (modal.classList.contains('open')) { wasOpen = true; return; }
        if (!wasOpen) return;             // never opened yet — keep waiting
        obs.disconnect();
        // Re-check: the player may have installed it from the browser menu while
        // the end screen was up.
        if (eligible()) show();
    });
    obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
}
