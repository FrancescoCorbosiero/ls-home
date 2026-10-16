/**
 * Quote and contact forms -> email to the office, sent with Amazon SES.
 *
 * POST /api/form, url-encoded (the forms' own encoding); the field "form-name" says which
 * form it is: "preventivo" or "contatti".
 *  - sent by fetch() with "Accept: application/json" -> JSON {ok: true} or {ok: false, error}
 *  - plain form post (JavaScript off)                -> 303 to /grazie/, or a short error page
 * The customer's address goes in Reply-To: answering the email writes straight to them.
 *
 * Environment variables (Netlify UI, scope "Functions"; Netlify reserves the AWS_ prefix):
 *   SES_REGION             region of the verified SES identity, e.g. eu-north-1
 *   SES_ACCESS_KEY_ID      IAM user that may only send these emails (policy in the README)
 *   SES_SECRET_ACCESS_KEY
 *   MAIL_FROM              verified sender, e.g. "Sito Logistica Sanchez <sito@logisticasanchez.com>"
 *   MAIL_TO                where requests arrive; more addresses separated by commas
 */
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

export const config = { path: '/api/form', method: 'POST' };

const SITE = 'logisticasanchez.com';
const MAX_BODY = 20_000; // characters; a filled-in quote request is about 1 000

const LABELS = {
  servizio: { pallet: 'Spedizione pallet espresso', groupage: 'Groupage / collettame', completo: 'Carico completo', magazzino: 'Magazzino e logistica' },
  tipo_pallet: { eur: 'EPAL 120×80 cm', industriale: 'Industriale 120×100 cm', mezzo: 'Mezzo pallet 80×60 cm', quarto: 'Quarto di pallet 60×40 cm', altro: 'Altro / fuori misura' },
  destinatario: { azienda: 'Azienda', privato: 'Privato' },
  contatto_preferito: { email: 'Email', telefono: 'Telefono', whatsapp: 'WhatsApp' },
};
const EXTRAS = ['Sponda idraulica', 'Consegna su appuntamento', 'Preavviso al destinatario', 'Merce fragile o non sovrapponibile'];

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const PHONE_RE = /^[0-9+\s().\/-]{6,20}$/;
const CAP_RE = /^\d{5}$/;

class InvalidForm extends Error {}

/** Reads one field: trimmed, normalised line breaks, capped length. */
const reader = (data) => (name, max = 200) => String(data.get(name) ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const oneLine = (s) => s.replace(/\s+/g, ' ').trim();

function check(ok, field) {
  if (!ok) throw new InvalidForm(field);
}
function number(value, min, max, field, { optional = false } = {}) {
  if (optional && value === '') return '';
  const n = Number(value.replace(',', '.'));
  check(Number.isFinite(n) && n >= min && n <= max, field);
  return String(n);
}

function contact(get) {
  const c = {
    nome: oneLine(get('nome', 100)),
    email: get('email', 254),
    telefono: oneLine(get('telefono', 30)),
  };
  check(c.nome, 'nome');
  check(EMAIL_RE.test(c.email), 'email');
  check(!c.telefono || PHONE_RE.test(c.telefono), 'telefono');
  check(get('privacy') === 'accettata', 'privacy');
  return c;
}

const dateIt = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
};

/* Each form: validates the fields and returns the email as subject + sections of [label, value]. */
const FORMS = {
  preventivo(get, data) {
    const c = contact(get);
    const servizio = get('servizio');
    const tipo = get('tipo_pallet');
    const destinatario = get('destinatario');
    const preferito = get('contatto_preferito');
    const ritiroCap = get('ritiro_cap', 5);
    const consegnaCap = get('consegna_cap', 5);
    check(LABELS.servizio[servizio], 'servizio');
    check(CAP_RE.test(ritiroCap), 'ritiro_cap');
    check(CAP_RE.test(consegnaCap), 'consegna_cap');
    const ritiroLocalita = oneLine(get('ritiro_localita', 80));
    const consegnaLocalita = oneLine(get('consegna_localita', 80));
    check(ritiroLocalita, 'ritiro_localita');
    check(consegnaLocalita, 'consegna_localita');
    const ritiro = `${ritiroCap} ${ritiroLocalita}`;
    const consegna = `${consegnaCap} ${consegnaLocalita}`;
    check(LABELS.destinatario[destinatario], 'destinatario');
    check(LABELS.tipo_pallet[tipo], 'tipo_pallet');
    const numero = number(get('numero', 6), 1, 99, 'numero');
    const peso = number(get('peso', 8), 1, 40000, 'peso');
    const altezza = number(get('altezza', 6), 10, 300, 'altezza', { optional: true });
    check(c.telefono, 'telefono');
    check(LABELS.contatto_preferito[preferito], 'contatto_preferito');
    const extras = data.getAll('servizi_extra[]').filter((v) => EXTRAS.includes(v));
    const service = LABELS.servizio[servizio];
    return {
      subject: `Richiesta di preventivo: ${service}, ${ritiro} → ${consegna}`,
      title: 'Nuova richiesta di preventivo',
      contact: c,
      preferred: preferito,
      sections: [
        ['Spedizione', [
          ['Servizio', service],
          ['Data di ritiro', dateIt(get('data_ritiro', 10)) || 'Da concordare'],
          ['Ritiro', ritiro],
          ['Consegna', consegna],
          ['Destinatario', LABELS.destinatario[destinatario]],
        ]],
        ['Merce', [
          ['Quantità', `${numero} × ${LABELS.tipo_pallet[tipo]}`],
          ['Peso totale', `${peso} kg`],
          ['Altezza', altezza && `${altezza} cm`],
          ['Descrizione', oneLine(get('descrizione_merce', 200))],
          ['Servizi extra', extras.join(', ')],
        ]],
        ['Cliente', [
          ['Nome', c.nome],
          ['Azienda', oneLine(get('azienda', 120))],
          ['Email', c.email],
          ['Telefono', c.telefono],
          ['Preferisce', LABELS.contatto_preferito[preferito]],
          ['Note', get('note', 3000)],
        ]],
      ],
    };
  },

  contatti(get) {
    const c = contact(get);
    const messaggio = get('messaggio', 5000);
    check(messaggio.length >= 10, 'messaggio');
    const oggetto = oneLine(get('oggetto', 100));
    return {
      subject: `Messaggio dal sito: ${oggetto || 'contatto'} (${c.nome})`,
      title: 'Nuovo messaggio dal sito',
      contact: c,
      sections: [
        ['Messaggio', [
          ['Oggetto', oggetto],
          ['Testo', messaggio],
        ]],
        ['Cliente', [
          ['Nome', c.nome],
          ['Email', c.email],
          ['Telefono', c.telefono],
        ]],
      ],
    };
  },
};

const esc = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** WhatsApp link for Italian mobile numbers (3xx…), or when the customer asked for WhatsApp. */
function whatsapp(phone, preferred) {
  let digits = phone.replace(/\D/g, '').replace(/^00/, '');
  if (/^3\d{8,9}$/.test(digits)) digits = `39${digits}`;
  return /^393\d{8,9}$/.test(digits) || (preferred === 'whatsapp' && digits.length >= 8) ? `https://wa.me/${digits}` : '';
}

function compose(form, name) {
  const sent = new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' });
  const footer = `Inviato dal modulo «${name}» di ${SITE} il ${sent}. Rispondi a questa email per scrivere direttamente al cliente.`;
  const sections = form.sections.map(([heading, rows]) => [heading, rows.filter(([, v]) => v)]).filter(([, rows]) => rows.length);

  const text = [
    form.title,
    '',
    ...sections.flatMap(([heading, rows]) => [heading.toUpperCase(), ...rows.map(([k, v]) => (v.includes('\n') ? `${k}:\n${v}` : `${k}: ${v}`)), '']),
    footer,
  ].join('\n');

  const { email, telefono } = form.contact;
  const wa = telefono ? whatsapp(telefono, form.preferred) : '';
  const button = (href, label) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 16px;border-radius:8px;background:#0b2239;color:#ffffff;font-weight:700;text-decoration:none">${esc(label)}</a>`;
  const actions = [
    button(`mailto:${email}`, 'Rispondi via email'),
    telefono && button(`tel:${telefono.replace(/[^\d+]/g, '')}`, `Chiama ${telefono}`),
    wa && button(wa, 'Scrivi su WhatsApp'),
  ].filter(Boolean).join('');
  const table = sections
    .map(
      ([heading, rows]) => `
      <h2 style="margin:24px 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5b6b7b">${esc(heading)}</h2>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px">${rows
        .map(
          ([k, v]) => `
        <tr><td style="padding:6px 12px 6px 0;width:140px;vertical-align:top;color:#5b6b7b">${esc(k)}</td><td style="padding:6px 0;vertical-align:top;color:#0b2239;white-space:pre-wrap">${esc(v)}</td></tr>`,
        )
        .join('')}
      </table>`,
    )
    .join('');
  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>${esc(form.title)}</title></head>
<body style="margin:0;padding:24px;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#0b2239">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px 28px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#5b6b7b">Logistica Sanchez · sito web</p>
    <h1 style="margin:0 0 16px;font-size:22px">${esc(form.title)}</h1>
    <div>${actions}</div>${table}
    <p style="margin:24px 0 0;font-size:12px;color:#5b6b7b">${esc(footer)}</p>
  </div>
</body></html>`;

  return { subject: oneLine(form.subject).slice(0, 200), text, html, replyTo: email };
}

let client;
/** Sends one email with SES. `ses` is only passed by tests. */
export async function sendWithSes({ subject, text, html, replyTo }, ses) {
  const env = process.env;
  const missing = ['SES_REGION', 'SES_ACCESS_KEY_ID', 'SES_SECRET_ACCESS_KEY', 'MAIL_FROM', 'MAIL_TO'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Amazon SES is not configured, missing: ${missing.join(', ')}`);
  ses ??= client ??= new SESv2Client({
    region: env.SES_REGION,
    credentials: { accessKeyId: env.SES_ACCESS_KEY_ID, secretAccessKey: env.SES_SECRET_ACCESS_KEY },
  });
  const utf8 = (Data) => ({ Data, Charset: 'UTF-8' });
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: env.MAIL_FROM,
      Destination: { ToAddresses: env.MAIL_TO.split(',').map((s) => s.trim()).filter(Boolean) },
      ReplyToAddresses: [replyTo],
      Content: { Simple: { Subject: utf8(subject), Body: { Text: utf8(text), Html: utf8(html) } } },
    }),
  );
}

const json = (status, body) => Response.json(body, { status });
const errorPage = (status, message, back) =>
  new Response(
    `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invio non riuscito – Logistica Sanchez</title><link rel="stylesheet" href="/css/main.css"></head>
<body><main class="section"><div class="container container-narrow prose"><h1>Invio non riuscito</h1><p>${esc(message)}</p>
<p>Puoi anche scriverci a <a href="mailto:logisticasanchezmb@gmail.com">logisticasanchezmb@gmail.com</a>, su <a href="https://wa.me/393292396962">WhatsApp</a> o chiamarci al <a href="tel:+393292396962">+39 329 239 6962</a>.</p>
<p><a class="btn btn-primary" href="${back}">Torna al modulo</a></p></div></main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

/** The whole request -> response logic; `send` is replaced in tests. */
export async function handleForm(req, send = sendWithSes) {
  const wantsJson = (req.headers.get('accept') || '').includes('application/json');
  let back = '/';
  const fail = (status, error, message) => (wantsJson ? json(status, { ok: false, error }) : errorPage(status, message, back));
  const done = () => (wantsJson ? json(200, { ok: true }) : new Response(null, { status: 303, headers: { Location: '/grazie/' } }));

  if (Number(req.headers.get('content-length') || 0) > MAX_BODY) return fail(413, 'too_large', 'Il messaggio è troppo lungo.');
  const type = req.headers.get('content-type') || '';
  let data;
  try {
    if (type.includes('multipart/form-data')) data = await req.formData();
    else {
      const body = await req.text();
      if (body.length > MAX_BODY) return fail(413, 'too_large', 'Il messaggio è troppo lungo.');
      data = new URLSearchParams(body);
    }
  } catch {
    return fail(400, 'bad_request', 'Il modulo non è stato ricevuto correttamente.');
  }

  const get = reader(data);
  // Honeypot: people never see this field, bots fill it in. Pretend it worked.
  if (get('bot-field')) return done();

  const name = get('form-name', 40);
  const build = Object.hasOwn(FORMS, name) ? FORMS[name] : null;
  if (!build) return fail(400, 'unknown_form', 'Il modulo non è stato riconosciuto.');
  back = `/${name}/`;

  let message;
  try {
    message = compose(build(get, data), name === 'preventivo' ? 'Preventivo' : 'Contatti');
  } catch (err) {
    if (err instanceof InvalidForm) return fail(422, `invalid:${err.message}`, 'Alcuni campi non sono compilati correttamente: torna al modulo e controllali.');
    throw err;
  }

  try {
    await send(message);
  } catch (err) {
    console.error('[form] email not sent:', err);
    return fail(502, 'send_failed', 'Non siamo riusciti a inoltrare la richiesta. Riprova tra poco.');
  }
  return done();
}

export default (req) => handleForm(req);
