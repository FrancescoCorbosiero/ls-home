/**
 * Logistica Sanchez — site configuration shared by the widgets.
 * Contact details also appear in the HTML (header/footer partials): keep them in sync.
 */
export const BUSINESS = {
  name: 'Logistica Sanchez',
  phone: '+393292396962',
  phoneDisplay: '+39\u00A0329\u00A0239\u00A06962',
  whatsapp: '393292396962',
  email: 'logisticasanchezmb@gmail.com',
  hours: 'Lun–Ven 8:00–18:00, Sab 8:00–12:00',
};

/**
 * Tracking integration.
 *
 * endpoint:  backend tracking API. It is called with POST {"codice": "<code>"} and
 *            answers {"status": "<status label>"}; any non-2xx answer means the
 *            code is unknown. This is the same call the current production site
 *            makes (see README, "Tracking"). The backend also accepts the richer
 *            JSON described in the README (events, eta, pod…), drawn as a timeline.
 *            Its origin must be listed in "connect-src" in public/_headers, and
 *            the backend must allow CORS from the site's origin.
 * portalUrl: alternatively, a portal page that shows the shipment; the visitor
 *            is redirected there, e.g. "https://portale.example.it/tracking?code={code}"
 * Leave both empty to use the "ask us" flow (code sent via WhatsApp/email/phone).
 * demoCode:  code that renders a sample timeline (labelled as an example); empty
 *            in production so customers never see invented data.
 */
export const TRACKING = {
  endpoint: 'https://app.logisticasanchez.com/mono/api/order/trace/state',
  portalUrl: '',
  demoCode: '',
  timeoutMs: 8000,
};

export const waLink = (text) => `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(text)}`;
export const mailLink = (subject, body = '') =>
  `mailto:${BUSINESS.email}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" aria-hidden="true"><use href="/img/icons.svg#i-${name}"/></svg>`;
