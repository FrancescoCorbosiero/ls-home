/**
 * Shipment tracking widget.
 *  - /tracking/?code=XXX runs a search on load (shareable links)
 *  - the code is sent to the backend (POST {codice}) and the status it answers is shown
 *  - unknown code or backend unreachable -> one-tap request of the status via WhatsApp / email / phone
 * Recent codes are remembered on this device only (localStorage).
 */
import { BUSINESS, TRACKING, waLink, mailLink, escapeHtml as h, icon } from './config.js';

/* Tracking states of the backend: enumeration "statoTracking" (GET /mono/api/enumeration/statoTracking),
   the same ids, names and labels the CMS uses to set them. trace/state answers one of them in "status".
   title: what the customer reads; step: label in the progress bar (NON_GESTITO comes before the bar). */
const STATES = [
  { id: 0, name: 'NON_GESTITO', label: 'Non gestito', title: 'In attesa di presa in carico', icon: 'clipboard-list' },
  { id: 1, name: 'PRESA', label: 'Presa in carico', title: 'Presa in carico', step: 'Presa in carico', icon: 'package-check' },
  { id: 2, name: 'TRANSITO', label: 'Transito', title: 'In transito', step: 'In transito', icon: 'truck' },
  { id: 3, name: 'TERMINAL_DEST', label: 'Terminal destinatario', title: 'Arrivata al terminal di destinazione', step: 'Terminal di destinazione', icon: 'warehouse' },
  { id: 4, name: 'ASSEGNATO', label: 'Assegnato', title: 'Affidata al mezzo per la consegna', step: 'In consegna', icon: 'navigation' },
  { id: 5, name: 'CONSEGNATO', label: 'Consegnato', title: 'Consegnata', step: 'Consegnata', icon: 'circle-check' },
];
const STEPS = STATES.filter((st) => st.step);
const keyOf = (v) =>
  String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/[\s-]+/g, '_');
/** Finds a state by id (0–5), name ("TRANSITO") or backend label ("Terminal destinatario"). */
const findState = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const k = keyOf(value);
  return STATES.find((st) => String(st.id) === k || st.name === k || keyOf(st.label) === k) ?? null;
};
// Codes are sent exactly as typed (minus spaces): the backend decides what is valid.
const CODE_RE = /^[^\s<>"'`]{1,64}$/;
const RECENT_KEY = 'ls_recent_codes';

function readRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((c) => CODE_RE.test(c)).slice(0, 4);
  } catch {
    return [];
  }
}
function saveRecent(code) {
  try {
    const list = [code, ...readRecent().filter((c) => c !== code)].slice(0, 4);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

/** Backend answer {status} -> shipment object. */
function normalize(code, data) {
  const obj = typeof data === 'string' || typeof data === 'number' ? { status: data } : data && typeof data === 'object' ? data : {};
  let value = obj.status;
  if (value && typeof value === 'object') value = value.name ?? value.label ?? value.id; // the whole enum entry
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const state = findState(raw);
  // A status we do not know yet is still shown, as the backend wrote it.
  const label = state ? null : raw === raw.toUpperCase() ? raw.charAt(0) + raw.slice(1).toLowerCase().replace(/_/g, ' ') : raw;
  return { code, state, label };
}

function renderShipment(s) {
  const { state } = s;
  const title = state ? state.title : s.label;
  const ico = state ? state.icon : 'package-search';
  const delivered = state?.name === 'CONSEGNATO';
  const reached = state ? STEPS.indexOf(state) : -1;
  const progress = STEPS.map((st, i) => {
    const cls = i < reached ? 'is-done' : i === reached ? 'is-current' : '';
    return `<li class="${cls}"${i === reached ? ' aria-current="step"' : ''}>${h(st.step)}</li>`;
  }).join('');
  const shareUrl = `${location.origin}/tracking/?code=${encodeURIComponent(s.code)}`;
  return `
    <div class="track-head">
      <div>
        <p class="track-code">Spedizione ${h(s.code)}</p>
        <p class="track-state${delivered ? ' is-delivered' : ''}">${icon(ico)}${h(title)}</p>
      </div>
    </div>
    ${state ? `<ol class="progress" role="list" aria-label="Avanzamento della spedizione">${progress}</ol>` : ''}
    <div class="track-actions">
      <button class="btn btn-secondary btn-sm" type="button" data-copy="${h(shareUrl)}">${icon('copy')}<span>Copia il link</span></button>
      <a class="btn btn-secondary btn-sm" href="${h(waLink(`Ciao ${BUSINESS.name}, ho una domanda sulla spedizione ${s.code}.`))}" target="_blank" rel="noopener">${icon('whatsapp', 'icon icon-wa')}Hai bisogno di aiuto?</a>
    </div>`;
}

function renderAsk(code, reason) {
  const intro =
    reason === 'notfound'
      ? `Non troviamo la spedizione <strong>${h(code)}</strong> nel sistema: controlla il codice sul documento di trasporto oppure chiedi direttamente a noi.`
      : reason === 'unhandled'
        ? `Non ci sono ancora aggiornamenti per la spedizione <strong>${h(code)}</strong>. Se l'hai prenotata da poco è normale; altrimenti controlla il codice sul documento di trasporto oppure chiedi direttamente a noi.`
      : `Il servizio di tracciamento non risponde in questo momento. Puoi chiederci lo stato della spedizione <strong>${h(code)}</strong> con un tocco.`;
  const text = `Ciao ${BUSINESS.name}, vorrei lo stato della spedizione ${code}. Grazie!`;
  return `
    <div class="track-head">
      <div>
        <p class="track-code">Spedizione ${h(code)}</p>
        <p class="track-state">${icon('headset')}Ricevi lo stato aggiornato</p>
      </div>
    </div>
    <p class="mt-s">${intro}</p>
    <div class="track-actions">
      <a class="btn btn-wa" href="${h(waLink(text))}" target="_blank" rel="noopener">${icon('whatsapp')}Chiedi su WhatsApp</a>
      <a class="btn btn-secondary" href="${h(mailLink(`Stato spedizione ${code}`, text))}">${icon('mail')}Scrivi una email</a>
      <a class="btn btn-secondary" href="tel:${h(BUSINESS.phone)}">${icon('phone')}${h(BUSINESS.phoneDisplay)}</a>
    </div>
    <p class="note mt-s mb-0">${h(BUSINESS.hours)}. Fuori orario ti rispondiamo appena possibile.</p>`;
}

async function fetchShipment(code) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TRACKING.timeoutMs);
  try {
    const res = await fetch(TRACKING.endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ codice: code }),
    });
    // The backend answers an error status for unknown codes (it has no dedicated 404).
    if (!res.ok) return { notFound: true };
    return { data: normalize(code, await res.json()) };
  } finally {
    clearTimeout(timer);
  }
}

function setup(root) {
  const form = root.querySelector('form');
  const input = form?.querySelector('input[name="code"]');
  const out = root.querySelector('[data-track-result]');
  const err = root.querySelector('[data-track-error]');
  const recentEl = root.querySelector('[data-track-recent]');
  if (!form || !input || !out) return;
  form.noValidate = true;

  const renderRecent = () => {
    if (!recentEl) return;
    const list = readRecent();
    recentEl.innerHTML = list.length
      ? `<span>Ricerche recenti:</span>${list.map((c) => `<button type="button" data-try="${h(c)}">${h(c)}</button>`).join('')}`
      : '';
  };

  const run = async (raw, { updateUrl = true } = {}) => {
    const code = String(raw || '').replace(/\s+/g, '');
    input.value = code;
    if (!CODE_RE.test(code)) {
      if (err) err.textContent = code ? 'Il codice contiene caratteri non validi: controllalo sul documento di trasporto.' : 'Inserisci il codice della spedizione.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    if (err) err.textContent = '';
    input.setAttribute('aria-invalid', 'false');
    if (updateUrl) history.replaceState(null, '', `${location.pathname}?code=${encodeURIComponent(code)}`);

    out.innerHTML = `<p class="track-state">${icon('loader-circle', 'icon spin')}Ricerca in corso…</p>`;
    try {
      const { data, notFound } = await fetchShipment(code);
      // The backend answers "Non gestito" both for unknown codes and for shipments not yet
      // handled (ls@migration OrderController.trackingState): show a neutral message, not a state.
      const unhandled = data?.state?.name === 'NON_GESTITO';
      out.innerHTML = notFound || !data ? renderAsk(code, 'notfound') : unhandled ? renderAsk(code, 'unhandled') : renderShipment(data);
      if (data && !unhandled) saveRecent(code);
    } catch {
      out.innerHTML = renderAsk(code, 'error');
    }
    renderRecent();
    out.focus({ preventScroll: true });
    out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(input.value);
  });
  root.addEventListener('click', async (e) => {
    const tryBtn = e.target.closest('[data-try]');
    if (tryBtn) {
      run(tryBtn.dataset.try);
      return;
    }
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.copy);
        const span = copyBtn.querySelector('span');
        if (span) {
          span.textContent = 'Link copiato';
          setTimeout(() => (span.textContent = 'Copia il link'), 2000);
        }
      } catch {
        /* clipboard unavailable */
      }
    }
  });

  renderRecent();
  const initial = new URLSearchParams(location.search).get('code');
  if (initial) run(initial, { updateUrl: false });
}

export default function init(nodes) {
  nodes.forEach(setup);
}
