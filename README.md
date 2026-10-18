# Logistica Sanchez — il pallet espresso

Website of Logistica Sanchez, a pallet logistics hub in Seregno (MB): express pallet
shipping across Italy in 24–72h, groupage, full loads and warehousing.

It is a **plain static site**: HTML, one CSS file and a few small JavaScript modules,
with no framework and no build step. What is in `public/` is exactly what gets
published, so the site can be deployed by dragging `public/` into Netlify, with no
environment variables. The quote and contact forms are switched off for now (see
*Forms*): quote requests go through WhatsApp, email and phone.

## Structure

```
public/                  ← the website (Netlify publish directory)
  index.html             home
  servizi/               services overview + 4 service pages
  zone/                  coverage hub (map, CAP checker) + 15 local pages (Seregno, 12
                         Lombard provinces, Torino, Verona)
  tracking/              shipment tracking
  preventivo/            quote request via WhatsApp / email / phone (message prefilled)
  contatti/  chi-siamo/  faq/  blog/ (+7 articles)  privacy/  cookie/
  404.html
  css/main.css           design system (tokens, components, pages)
  js/main.js             core UI; loads the widgets below only where used
  js/config.js           contacts + tracking integration settings
  js/eta.js              CAP → region → delivery time
  js/tracking.js  js/quote-links.js  js/coverage.js  js/map.js
  img/                   logo (SVG), photos (AVIF/WebP/JPG), icons.svg sprite,
                         pallet drawings, Italy map, Open Graph images
  fonts/                 Barlow + Barlow Condensed, self-hosted and subset
  _headers  _redirects   Netlify security/caching headers and 301s
  robots.txt  sitemap.xml  site.webmanifest  .well-known/security.txt
partials/                shared head, header, footer and CTA band
tools/sync.mjs           keeps partials + sitemap in sync, checks SEO basics
tools/pallets.py         regenerates the isometric pallet drawings
site.config.json         production URL used by the sync tool
netlify/functions/form.mjs  POST /api/form: emails the forms with Amazon SES (unused while forms are off)
package.json             dependency of the function (@aws-sdk/client-sesv2)
netlify.toml             tells Netlify to publish public/ and where the function is
```

## Run it locally

Pages use root-relative paths (`/css/main.css`), so open them through a local server
rather than double-clicking the files:

```bash
npx serve public          # or: python3 -m http.server 8080 -d public
```

That is the whole site: nothing else needs to run.

## Editing

- **Page content**: edit the HTML file of that page in `public/`.
- **Header, footer, `<head>` or CTA band**: edit the file in `partials/`, then run

  ```bash
  node tools/sync.mjs
  ```

  The tool copies each partial into every page (between `<!-- partial:name -->`
  markers), marks the current page in the menus, rebuilds `sitemap.xml` and reports
  problems: missing titles, descriptions or canonicals, pages with more than one
  `<h1>`, broken internal links, missing images or icons, invalid JSON-LD.
  `node tools/sync.mjs --check` does the same without writing (useful in CI).
- **New page**: copy a similar page into a new folder (`public/new-page/index.html`),
  update `<title>`, description, canonical, Open Graph tags and JSON-LD, set
  `<body data-page="…">`, then run the sync tool.
- **Home hero photos**: the photo on the right is `img/photos/hero-hub-{520,800,1200}`
  in `.avif`, `.webp` and `.jpg`; the background photo is `img/photos/hero-bg.*`, under a
  navy overlay. To drop the background photo, remove the `<picture>` inside
  `<div class="hero-bg has-photo">` in `index.html` and the `has-photo` class: the grid
  pattern comes back. `is-soft` blurs it slightly (the current one is low resolution).
- **Icons**: the sprite is `public/img/icons.svg` ([Lucide](https://lucide.dev)
  icons). To add one, copy the icon's inner SVG into a new `<symbol id="i-name">` and
  use it with `<svg class="icon"><use href="/img/icons.svg#i-name"/></svg>`.
- **Delivery times**: the zones (24/48/72h) live in `public/js/eta.js`; also update
  the legend text in `index.html` and `zone/index.html` and the `data-zone`
  attributes in `img/italia-copertura.svg` if they change.

## Deploy on Netlify

1. Either drag and drop the `public/` folder in *Deploys*, or connect the repository
   (Netlify reads `netlify.toml` and publishes `public/`). Both work: `_headers` and
   `_redirects` live inside `public/`, and no environment variable is needed while the
   forms are off. Netlify Forms are not used: leave form detection off.
2. **Domain**: canonical URLs, sitemap and structured data use
   `https://logisticasanchez.com` (no `www`, like the current production site). Make
   it the primary domain in Netlify, so `www` redirects to it. Keep it that way: the
   backend only accepts browser calls (CORS) from the origins in its `ALLOWED_ORIGINS`
   setting (the backend repository lists `https://logisticasanchez.com`, `www` and
   `app.`), so tracking does not work from a `*.netlify.app` preview address. To change
   the domain, run `node tools/sync.mjs --domain https://your-domain.it`, commit the
   result, and ask for the new origin to be allowed on the backend.

## Backend (tracking)

The site talks to the Logistica Sanchez backend (`https://app.logisticasanchez.com`,
the same one used by the order portal and the CMS) for one thing: shipment tracking.
It is the call the current production site makes:

```
POST https://app.logisticasanchez.com/mono/api/order/trace/state
Content-Type: application/json

{ "codice": "<code typed by the customer>" }
```

The answer is `{ "status": … }` with one of the tracking states of the backend
(enumeration `statoTracking`, `GET /mono/api/enumeration/statoTracking`, the same the
CMS uses to set them); a non-2xx answer (e.g. 400 for an empty code) is treated as "unknown
code".

| id | name | label in the CMS | shown on the site | progress bar |
|---|---|---|---|---|
| 0 | `NON_GESTITO` | Non gestito | neutral "no updates yet" message (also the answer for unknown codes) | — |
| 1 | `PRESA` | Presa in carico | Presa in carico | step 1 |
| 2 | `TRANSITO` | Transito | In transito | step 2 |
| 3 | `TERMINAL_DEST` | Terminal destinatario | Arrivata al terminal di destinazione | step 3 |
| 4 | `ASSEGNATO` | Assegnato | Affidata al mezzo per la consegna | step 4 |
| 5 | `CONSEGNATO` | Consegnato | Consegnata | step 5 |

`status` is recognised by id, name or label. A state the site does not know yet is
still shown, as the backend wrote it, without the progress bar. The backend answers
`200 {"status": "Non gestito"}` both for unknown codes and for shipments not yet handled
(and 400 for an empty code), so for `NON_GESTITO` the page shows a neutral "no updates yet"
message with the contact buttons instead of a state. The states live in
`STATES` in `public/js/tracking.js`; keep them, and the legend on `/tracking/`, in step
with the backend enumeration. The code is sent exactly as typed, minus spaces.
Settings live in `TRACKING` in `public/js/config.js`; the backend origin is allowed in
`connect-src` in `public/_headers`.

The site uses only `status`: it does not depend on any field or endpoint the backend
does not offer today.

Orders are placed on the order portal (`https://ordini.logisticasanchez.com`), linked
from the header, footer and home page. Quote and contact requests do not go through the
backend.

## Forms (Amazon SES) — currently off

The forms are hidden for now (commit `91f33ee`): `/preventivo/` offers WhatsApp,
email and phone, with the request prefilled by `js/quote-links.js`, and `/contatti/`
lists the channels. The function `netlify/functions/form.mjs` is still in the
repository but no page calls it. To bring the forms back, run
`git revert 91f33ee`, deploy by connecting the repository (drag and drop does not
publish functions) and set the variables below. What follows describes them as they
work when switched on.

Both forms (`preventivo`, `contatti`) post to `/api/form`, handled by
`netlify/functions/form.mjs`. It checks the fields again on the server, drops spam
caught by the honeypot field, and sends one email to the office with Amazon SES. The
email has the request laid out by section and buttons to answer by email, phone or
WhatsApp; its Reply-To is the customer, so answering the email writes to them.
Without JavaScript the forms post to the same URL and land on `/grazie/`.

Set these in Netlify, *Site configuration → Environment variables*, with the
*Functions* scope (Netlify reserves names starting with `AWS_`, hence the `SES_` ones;
variables written in `netlify.toml` do not reach functions):

| Variable | Example |
|---|---|
| `SES_REGION` | `eu-north-1` (the region where the SES identity is verified) |
| `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY` | keys of an IAM user used only for this |
| `MAIL_FROM` | `Sito Logistica Sanchez <sito@logisticasanchez.com>` |
| `MAIL_TO` | `logisticasanchezmb@gmail.com` (more addresses separated by commas) |

On the AWS side:

1. In SES, verify the domain `logisticasanchez.com` (DKIM records in the DNS) so that
   `MAIL_FROM` can use it. Avoid a `@gmail.com` sender: mail sent through SES "from"
   Gmail fails the DMARC checks and is likely to end up in spam.
2. While the SES account is in the sandbox it only sends to verified addresses: verify
   the `MAIL_TO` address too. That is enough, because the function only ever writes to
   the office, never to the customer.
3. Give the IAM user only this permission (account id and addresses to adjust); the
   conditions mean that leaked keys could only send mail to the office:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": "ses:SendEmail",
       "Resource": "*",
       "Condition": {
         "StringEquals": { "ses:FromAddress": "sito@logisticasanchez.com" },
         "ForAllValues:StringEquals": { "ses:Recipients": ["logisticasanchezmb@gmail.com"] }
       }
     }]
   }
   ```

If an email does not arrive, the reason is in the function log (*Logs → Functions →
form* in Netlify); the visitor sees a message with the email and WhatsApp contacts.

## SEO

The local SEO plan (Google Business Profile, reviews, directories, what to measure and
what to check with the owner) is in `docs/seo-locale.md`, in Italian.

Every page has a unique title and description, canonical URL, Open Graph/Twitter card
with its own image, visible breadcrumbs and JSON-LD: `LocalBusiness` + `WebSite` on
all pages, plus `Service`, `FAQPage`, `BlogPosting`, `BreadcrumbList` where relevant.
`sitemap.xml` and `robots.txt` are generated/kept in sync. Pages prerender on hover
in Chromium browsers (Speculation Rules). Old URLs (`about.html`, `service.html`,
`contact.html`, `tracking.html`…) redirect with a 301, and the anchors of the
previous home page (`/#chisiamo`, `/#contattaci`, `/#tracking`) open the matching
page. Paths under `/mono/` are passed on to the backend (`_redirects`, a Netlify
proxy): the links and the logo in the e-mails the backend sends use
`https://logisticasanchez.com/mono/…` when its `EMAIL_ORIGIN` is the apex, its default.

## Before going live

- [ ] Review the service copy: delivery zones, warehousing, accessory services
      (tail lift, appointments, extra insurance) and the towns listed on local pages
      describe a typical pallet hub — keep only what Logistica Sanchez actually offers.
- [ ] Make `logisticasanchez.com` the primary domain (see *Deploy*).
- [ ] Look up a real shipment code on `/tracking/` from the published site and check
      that the status shows up (this proves CORS and the CSP are right).
- [ ] Open `https://logisticasanchez.com/mono/img/logistica-sanchez-logo.jpg` on the
      published site: it must show the logo of the backend's e-mails, not a 404 (the
      e-mail links take the same route).
- [ ] Submit `sitemap.xml` to Google Search Console and link the site from the Google
      Business Profile.
- [ ] Replace the stock truck photo on *Carico completo* (`img/photos/road-convoy-*`)
      with a real one when available — same file names, or update the `<picture>` tag.

## Credits

Fonts: Barlow and Barlow Condensed (SIL Open Font License, see `public/fonts/`). Icons: Lucide
(ISC License). Regional boundaries of the coverage map: ISTAT, via openpolis.
