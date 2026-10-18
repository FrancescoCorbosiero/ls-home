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
 * Tracking: the backend API the current production site already calls. It is called with
 * POST {"codice": "<code>"} and answers {"status": "<tracking state>"}; any non-2xx
 * answer means the code is unknown (see README, "Backend (tracking)"). Its origin must be
 * listed in "connect-src" in public/_headers, and the backend must allow CORS from the
 * site's origin.
 */
export const TRACKING = {
  endpoint: 'https://app.logisticasanchez.com/mono/api/order/trace/state',
  timeoutMs: 8000,
};

export const waLink = (text) => `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(text)}`;
export const mailLink = (subject, body = '') =>
  `mailto:${BUSINESS.email}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" aria-hidden="true"><use href="/img/icons.svg#i-${name}"/></svg>`;
