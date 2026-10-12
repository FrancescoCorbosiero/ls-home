/**
 * Shipment tracking widget.
 *  - /tracking/?code=XXX runs a search on load (shareable links)
 *  - TRACKING.endpoint set   -> fetch JSON from the client portal and draw the timeline
 *  - TRACKING.portalUrl set  -> redirect to the portal page
 *  - neither                 -> one-tap request of the status via WhatsApp / email / phone
 * Recent codes are remembered on this device only (localStorage).
 */
import { BUSINESS, TRACKING, waLink, mailLink, escapeHtml as h, icon } from './config.js';

const STEPS = [
  ['created', 'Presa in carico'],
  ['picked_up', 'Ritirata'],
  ['in_transit', 'In viaggio'],
  ['out_for_delivery', 'In consegna'],
  ['delivered', 'Consegnata'],
];
const STATE = {
  created: ['Spedizione presa in carico', 'clipboard-list'],
  picked_up: ['Merce ritirata', 'package-check'],
  in_transit: ['In viaggio verso la destinazione', 'truck'],
  out_for_delivery: ['In consegna oggi', 'navigation'],
  delivered: ['Consegnata', 'circle-check'],
  exception: ['Serve un tuo riscontro', 'triangle-alert'],
};
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{3,29}$/;
const RECENT_KEY = 'ls_recent_codes';

const fmtDateTime = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDate = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const asDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

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

function demoShipment() {
  const now = Date.now();
  const ago = (hours) => new Date(now - hours * 3600e3).toISOString();
  const eta = new Date(now + 24 * 3600e3);
  if (eta.getDay() === 0) eta.setDate(eta.getDate() + 1);
  if (eta.getDay() === 6) eta.setDate(eta.getDate() + 2);
  return {
    code: TRACKING.demoCode,
    status: 'in_transit',
    origin: 'Seregno (MB)',
    destination: 'Bologna (BO)',
    pallets: 2,
    eta: eta.toISOString().slice(0, 10),
    updatedAt: ago(1),
    events: [
      { time: ago(1), status: 'in_transit', location: 'Hub di Seregno (MB)', note: 'Partita verso la destinazione' },
      { time: ago(5), status: 'picked_up', location: 'Monza (MB)', note: 'Ritirati 2 pallet EUR 120×80' },
      { time: ago(26), status: 'created', location: 'Online', note: 'Spedizione presa in carico' },
    ],
  };
}

function renderShipment(s, { demo = false } = {}) {
  const status = STATE[s.status] ? s.status : 'in_transit';
  const [title, ico] = STATE[status];
  const reached = STEPS.findIndex(([k]) => k === status);
  const progress = STEPS.map(([key, label], i) => {
    const cls = status === 'exception' ? '' : i < reached ? 'is-done' : i === reached ? 'is-current' : '';
    return `<li class="${cls}"${i === reached ? ' aria-current="step"' : ''}>${h(label)}</li>`;
  }).join('');
  const eta = asDate(s.eta);
  const updated = asDate(s.updatedAt);
  const meta = [
    ['Partenza', s.origin],
    ['Destinazione', s.destination],
    ['Colli', s.pallets ? `${s.pallets} pallet` : null],
    [status === 'delivered' ? 'Consegnata' : 'Consegna prevista', eta ? fmtDate.format(eta) : null],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><dt>${h(k)}</dt><dd>${h(v)}</dd></div>`)
    .join('');
  const events = (Array.isArray(s.events) ? s.events : [])
    .map((ev) => {
      const t = asDate(ev.time);
      const label = STATE[ev.status]?.[0] ?? ev.status ?? '';
      return `<li><time${t ? ` datetime="${h(t.toISOString())}"` : ''}>${t ? h(fmtDateTime.format(t)) : ''}</time><strong>${h(ev.note || label)}</strong>${ev.location ? `<span>${h(ev.location)}</span>` : ''}</li>`;
    })
    .join('');
  const shareUrl = `${location.origin}/tracking/?code=${encodeURIComponent(s.code)}`;
  return `
    <div class="track-head">
      <div>
        <p class="track-code">Spedizione ${h(s.code)}${demo ? ' · <span class="badge">Esempio dimostrativo</span>' : ''}</p>
        <p class="track-state${status === 'delivered' ? ' is-delivered' : status === 'exception' ? ' is-exception' : ''}">${icon(ico)}${h(title)}</p>
      </div>
      ${updated ? `<p class="muted mb-0">Ultimo aggiornamento:<br><strong>${h(fmtDateTime.format(updated))}</strong></p>` : ''}
    </div>
    ${status === 'exception' ? '' : `<ol class="progress" role="list" aria-label="Avanzamento della spedizione">${progress}</ol>`}
    ${meta ? `<dl class="track-meta">${meta}</dl>` : ''}
    ${events ? `<h3 class="h4">Cronologia</h3><ol class="events" reversed>${events}</ol>` : ''}
    <div class="track-actions">
      ${s.pod ? `<a class="btn btn-primary btn-sm" href="${h(s.pod)}" target="_blank" rel="noopener">${icon('file-check')}Scarica la prova di consegna</a>` : ''}
      <button class="btn btn-secondary btn-sm" type="button" data-copy="${h(shareUrl)}">${icon('copy')}<span>Copia il link</span></button>
      <a class="btn btn-secondary btn-sm" href="${h(waLink(`Ciao ${BUSINESS.name}, ho una domanda sulla spedizione ${s.code}.`))}" target="_blank" rel="noopener">${icon('whatsapp', 'icon icon-wa')}Hai bisogno di aiuto?</a>
    </div>`;
}

function renderAsk(code, reason) {
  const intro =
    reason === 'notfound'
      ? `Non troviamo la spedizione <strong>${h(code)}</strong> nel sistema: controlla il codice sul documento di trasporto oppure chiedi direttamente a noi.`
      : reason === 'error'
        ? `Il servizio di tracciamento non risponde in questo momento. Puoi chiederci lo stato della spedizione <strong>${h(code)}</strong> con un tocco.`
        : `Invia il codice con un tocco: ti rispondiamo con lo <strong>stato aggiornato</strong> e la <strong>finestra di consegna prevista</strong>.`;
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
    <p class="note mt-s mb-0">${h(BUSINESS.hours)}. Fuori orario ti rispondiamo appena possibile. Vuoi vedere come appare il tracciamento? Prova il codice <button class="linklike" type="button" data-try="${h(TRACKING.demoCode)}">${h(TRACKING.demoCode)}</button>.</p>`;
}

async function fetchShipment(code) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TRACKING.timeoutMs);
  try {
    const res = await fetch(TRACKING.endpoint.replace('{code}', encodeURIComponent(code)), {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { data: await res.json() };
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
    const code = String(raw || '').toUpperCase().replace(/\s+/g, '');
    input.value = code;
    if (!CODE_RE.test(code)) {
      if (err) err.textContent = code ? 'Il codice contiene caratteri non validi: usa lettere, numeri e trattini.' : 'Inserisci il codice della spedizione.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    if (err) err.textContent = '';
    input.setAttribute('aria-invalid', 'false');
    if (updateUrl) history.replaceState(null, '', `${location.pathname}?code=${encodeURIComponent(code)}`);

    if (code === TRACKING.demoCode) {
      out.innerHTML = renderShipment(demoShipment(), { demo: true });
    } else if (TRACKING.endpoint) {
      out.innerHTML = `<p class="track-state">${icon('loader-circle', 'icon spin')}Ricerca in corso…</p>`;
      try {
        const { data, notFound } = await fetchShipment(code);
        out.innerHTML = notFound || !data ? renderAsk(code, 'notfound') : renderShipment({ code, ...data });
        if (data) saveRecent(code);
      } catch {
        out.innerHTML = renderAsk(code, 'error');
      }
    } else if (TRACKING.portalUrl) {
      saveRecent(code);
      location.href = TRACKING.portalUrl.replace('{code}', encodeURIComponent(code));
      return;
    } else {
      saveRecent(code);
      out.innerHTML = renderAsk(code);
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
