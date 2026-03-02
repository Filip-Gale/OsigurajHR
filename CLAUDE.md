# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (Ruby gems)
bundle install

# Run local development server (http://localhost:4000)
bundle exec jekyll serve

# Build static site to _site/
bundle exec jekyll build
```

The site is deployed on GitHub Pages — pushing to the main branch triggers automatic deployment.

## Architecture

This is a **Jekyll 3.10.0** static site for **Osiguraj.hr**, a Croatian car insurance comparison and lead generation platform. The site is written entirely in Croatian.

### Jekyll Collections (defined in `_config.yml`)

Three collections generate SEO-targeted city pages:

| Collection | Directory | Layout | URL pattern |
|---|---|---|---|
| Blog posts | `_posts/` | `post` | `/blog/:title/` |
| Technical inspection guides | `_tehnicki_pregled/` | `tehnicki-layout` | `/tehnicki-pregled/:filename/` |
| Registration guides | `_registracija/` | `registracija-layout` | `/registracija/:filename/` |

### Static Page Directory

`auto-osiguranje/` contains city-specific insurance pages (e.g., `zagreb.md`, `split.md`) using the `grad` layout. These are plain files, not a Jekyll collection — each has an explicit `permalink` in its front matter.

### Layouts (`_layouts/`)

- **`grad.html`** — City insurance pages. Purple background (`#573cf9`), yellow highlights (`#ffbc27`). Uses `page.title`, `page.description`, `page.grad_ime` front matter.
- **`tehnicki-layout.html`** — Technical inspection pages. Includes an embedded JS cost calculator (`izracunaj()`) that estimates registration fees from vehicle type and kW. Uses `page.grad`, `page.opis` front matter. Has Zagreb-specific FAQ JSON-LD when `page.grad == "Zagreb"`.
- **`registracija-layout.html`** — Registration guide pages. Uses `page.grad`, `page.stp_lokacije_opis` front matter. Content can embed inline HTML and page-specific JS calculators.
- **`post.html`** — Minimal blog post layout, just renders `{{ content }}`.

### Includes (`_includes/`)

- **`nav.html`** — Logo + phone number. The homepage JS hides the nav and shows a sticky CTA button after 650px scroll.
- **`footer.html`** — Three-column footer. Contains hidden 1px-height SEO links to `/tehnicki-pregled/` and `/registracija/` index pages.
- **`wapp.html`** — Fixed WhatsApp CTA button (`wa.me/38598813221`), present on every page.

### Homepage Lead Form (`index.html`)

The homepage form submits to **web3forms.com** (`access_key: 3cf56deb-78e0-4c88-8bc2-d73a20b78a80`). On submit, JavaScript:
1. Constructs formatted field labels (e.g., "Fizička osoba" instead of raw value)
2. Formats Croatian phone numbers to international format (`09x` → `3859x`)
3. Generates a WhatsApp deep-link with vehicle plate and driver age pre-filled as a message
4. Sends custom `FormData` via `fetch` to web3forms API

Age input is hidden when "Pravna osoba" (legal entity) is selected.

### CSS

- `css/style.css` — Global utility classes (`.background-purple`, `.text-yellow`, `.round`, `.width-container-1000`, `.row-pc`, `.fade-in`, etc.)
- `css/index.css` — Homepage-specific styles
- `css/post.css` — Shared by `post`, `grad`, `tehnicki-layout`, and `registracija-layout`
- `css/nav.css`, `css/footer.css`, `css/wapp.css` — Component-specific styles

Each layout and include injects a `<head>` tag with its own `<link>` to load its CSS — this is the pattern used throughout (not a central `<head>` partial).

### SEO Strategy

The site targets local search keywords through three sets of city pages (auto-osiguranje, tehnicki-pregled, registracija), all linking to `/izracunaj-cijenu/` as the conversion page. JSON-LD structured data is embedded in the homepage (`InsuranceAgency`, `FAQPage`, `WebSite` schemas) and in `tehnicki-layout` pages (`Service` schema per city).
