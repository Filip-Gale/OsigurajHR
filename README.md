# Osiguraj.hr

Web stranica za usporedbu i ugovaranje auto osiguranja u Hrvatskoj. Korisnici unose registracijsku oznaku vozila i kontakt podatke, a agent ih kontaktira s personaliziranim ponudama.

**Live:** [osiguraj.hr](https://www.osiguraj.hr)

## Tech stack

- [Jekyll](https://jekyllrb.com/) 3.10.0 — statički generator stranica
- GitHub Pages — hosting i deployment
- [web3forms.com](https://web3forms.com/) — obrada lead forme
- Google Tag Manager — analitika

## Pokretanje lokalno

```bash
bundle install
bundle exec jekyll serve
```

Stranica je dostupna na `http://localhost:4000`.

## Struktura

```
_posts/               # Blog članci ("Mala škola osiguranja")
_tehnicki_pregled/    # Vodiči za tehnički pregled po gradovima
_registracija/        # Vodiči za registraciju vozila po gradovima
auto-osiguranje/      # Stranice auto osiguranja po gradovima
_layouts/             # Jekyll layouti (grad, post, tehnicki-layout, registracija-layout)
_includes/            # Komponente (nav, footer, wapp)
css/                  # Stilovi
img/                  # Slike
```

## Deployment

Svaki push na `main` granu automatski deploya stranicu putem GitHub Pages.
