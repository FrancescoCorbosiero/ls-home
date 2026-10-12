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
 * Tracking integration. Leave both empty to use the built-in "ask us" flow
 * (the visitor sends the code via WhatsApp/email/phone in one tap).
 *
 * endpoint:  JSON API of the client portal, "{code}" is replaced, e.g.
 *            "https://portale.example.it/api/tracking/{code}"
 *            Expected response — see README ("Tracking: formato JSON").
 * portalUrl: alternatively, a portal page that shows the shipment; the visitor
 *            is redirected there, e.g. "https://portale.example.it/tracking?code={code}"
 * demoCode:  code that renders a sample timeline (labelled as an example).
 * If the endpoint lives on another domain, add it to "connect-src" in
 * public/_headers (Content-Security-Policy) and allow CORS on the portal.
 */
export const TRACKING = {
  endpoint: '',
  portalUrl: '',
  demoCode: 'LS-DEMO',
  timeoutMs: 8000,
};

export const waLink = (text) => `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(text)}`;
export const mailLink = (subject, body = '') =>
  `mailto:${BUSINESS.email}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" aria-hidden="true"><use href="/img/icons.svg#i-${name}"/></svg>`;
