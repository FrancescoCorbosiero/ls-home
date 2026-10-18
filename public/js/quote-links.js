/**
 * Quote request without a form: WhatsApp and email links with the request already written.
 * Data chosen elsewhere on the site travels in the URL and is added to the messages:
 * /preventivo/?servizio=groupage&da=20831&a=40121&pallet=2&tipo=eur
 * Without JavaScript the links still work, with the empty template.
 */
import { BUSINESS, waLink, mailLink, escapeHtml as h } from './config.js';

const LABELS = {
  servizio: { pallet: 'Spedizione pallet espresso', groupage: 'Groupage / collettame', completo: 'Carico completo', magazzino: 'Magazzino e logistica' },
  tipo: { eur: 'EPAL 120×80 cm', industriale: 'Industriale 120×100 cm', mezzo: 'Mezzo pallet 80×60 cm', quarto: 'Quarto di pallet 60×40 cm' },
};
const CAP_RE = /^\d{5}$/;

function rowsFromUrl() {
  const q = new URLSearchParams(location.search);
  const pallets = /^\d{1,2}$/.test(q.get('pallet') || '') ? Number(q.get('pallet')) : 0;
  const tipo = LABELS.tipo[q.get('tipo')];
  return [
    ['Servizio', LABELS.servizio[q.get('servizio')]],
    ['CAP di ritiro', CAP_RE.test(q.get('da') || '') && q.get('da')],
    ['CAP di consegna', CAP_RE.test(q.get('a') || '') && q.get('a')],
    ['Pallet', [pallets && `${pallets} ×`, tipo || (pallets && 'pallet')].filter(Boolean).join(' ')],
  ].filter(([, v]) => v);
}

function template(rows) {
  const known = new Set(rows.map(([k]) => k));
  const todo = [
    !known.has('CAP di ritiro') && 'CAP e località di ritiro',
    !known.has('CAP di consegna') && 'CAP e località di consegna',
    !known.has('Pallet') && 'Numero e formato dei pallet',
    'Peso totale (kg) e altezza (cm)',
    'Data di ritiro desiderata',
    'Servizi accessori',
    'Nome, azienda e telefono',
  ].filter(Boolean);
  return [...rows.map(([k, v]) => `${k}: ${v}`), ...todo.map((k) => `${k}: `)].join('\n');
}

function setup(root) {
  const rows = rowsFromUrl();
  if (!rows.length) return;
  const summary = root.querySelector('[data-quote-summary]');
  const list = root.querySelector('[data-quote-rows]');
  if (summary && list) {
    list.innerHTML = rows.map(([k, v]) => `<div><dt>${h(k)}</dt><dd>${h(v)}</dd></div>`).join('');
    summary.hidden = false;
  }
  const body = template(rows);
  const wa = waLink(`Ciao ${BUSINESS.name}, vorrei un preventivo per una spedizione:\n${body}`);
  const mail = mailLink('Richiesta di preventivo', `Buongiorno,\nvorrei un preventivo per questa spedizione:\n\n${body}\n\nGrazie`);
  for (const a of root.querySelectorAll('[data-quote-wa]')) a.href = wa;
  for (const a of root.querySelectorAll('[data-quote-mail]')) a.href = mail;
}

export default function init(nodes) {
  nodes.forEach(setup);
}
