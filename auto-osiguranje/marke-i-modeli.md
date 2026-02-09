---
layout: post
title: "Katalog Vozila | Premium Izračun Osiguranja"
permalink: /auto-osiguranje/modeli/
---

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap" rel="stylesheet">

<style>
    :root {
        --bg-dark: #0a0a0a;
        --accent-blue: #0071e3;
        --card-bg: rgba(255, 255, 255, 0.04);
        --card-border: rgba(255, 255, 255, 0.08);
        --text-main: #f5f5f7;
        --text-dim: #86868b;
    }

    .hub-container {
        font-family: 'Inter', -apple-system, sans-serif;
        background-color: var(--bg-dark);
        color: var(--text-main);
        padding: 80px 20px;
        max-width: 1200px;
        margin: 0 auto;
    }

    .hero-section {
        text-align: center;
        margin-bottom: 80px;
    }

    .hero-section h1 {
        font-size: clamp(2.5rem, 8vw, 4.5rem);
        font-weight: 800;
        letter-spacing: -0.02em;
        background: linear-gradient(180deg, #fff 0%, #86868b 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 24px;
    }

    .hero-section p {
        font-size: 1.25rem;
        color: var(--text-dim);
        max-width: 600px;
        margin: 0 auto;
        line-height: 1.6;
    }

    .model-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 20px;
    }

    .model-card {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 24px;
        padding: 30px;
        text-decoration: none;
        transition: all 0.4s cubic-bezier(0.2, 0, 0, 1);
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-height: 160px;
    }

    .model-card:hover {
        background: rgba(255, 255, 255, 0.07);
        border-color: rgba(255, 255, 255, 0.2);
        transform: translateY(-5px);
    }

    .model-card h2 {
        color: #fff;
        font-size: 1.4rem;
        font-weight: 600;
        margin: 0;
    }

    .model-card p {
        color: var(--text-dim);
        font-size: 0.85rem;
        margin: 10px 0 0 0;
        line-height: 1.4;
    }

    .badge {
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--accent-blue);
        font-weight: 700;
        margin-bottom: 8px;
        display: block;
    }

    .brand-group {
        margin-top: 80px;
    }

    .brand-title {
        font-size: 0.8rem;
        color: var(--text-dim);
        text-transform: uppercase;
        letter-spacing: 0.15em;
        margin-bottom: 25px;
        border-bottom: 1px solid var(--card-border);
        padding-bottom: 12px;
    }
</style>

<div class="hub-container">
    <header class="hero-section">
        <span class="badge" style="color: #fff; opacity: 0.5;">Automotive Intelligence</span>
        <h1>Pronađite svoj model.</h1>
        <p>Analiza troškova osiguranja i tehničkih specifikacija za najpopularnija vozila u Hrvatskoj.</p>
    </header>

    <div class="brand-group">
        <h3 class="brand-title">German Precision</h3>
        <div class="model-grid">
            <a href="{{ '/auto-osiguranje/vw-golf-7/' | relative_url }}" class="model-card">
                <div><span class="badge">Volkswagen</span><h2>Golf 7</h2><p>Najtraženiji kompakt i kW specifikacije.</p></div>
            </a>
            <a href="{{ '/auto-osiguranje/vw-passat/' | relative_url }}" class="model-card">
                <div><span class="badge">Volkswagen</span><h2>Passat</h2><p>Osiguranje za limuzine i karavane.</p></div>
            </a>
            <a href="{{ '/auto-osiguranje/skoda-octavia/' | relative_url }}" class="model-card">
                <div><span class="badge">Škoda</span><h2>Octavia</h2><p>Analiza troškova za obiteljski favorit.</p></div>
            </a>
            <a href="{{ '/auto-osiguranje/bmw-serija-3/' | relative_url }}" class="model-card">
                <div><span class="badge">BMW</span><h2>Serija 3</h2><p>Premium kasko i troškovi održavanja.</p></div>
            </a>
            <a href="{{ '/auto-osiguranje/audi-a4/' | relative_url }}" class="model-card">
                <div><span class="badge">Audi</span><h2>A4</h2><p>Usporedba polica za njemački premium.</p></div>
            </a>
            <a href="{{ '/auto-osiguranje/opel-astra/' | relative_url }}" class="model-card">
                <div><span class="badge">Opel</span><h2>Astra</h2><p>Povoljno osiguranje za njemački klasik.</p></div>
            </a>
        </div>
    </div>

    <div class="brand-group">
        <h3 class="brand-title">Asian Innovation</h3>
        <div class="model-grid">
            <a href="{{ '/auto-osiguranje/toyota-yaris/' | relative_url }}" class="model-card">
                <div><span class="badge">Toyota</span><h2>Yaris</h2><p>Eko-popusti za hibridne modele.</p></div>
            </a>
            <a href="{{ '/auto-osiguranje/suzuki-vitara/' | relative_url }}" class="model-card">
                <div><span class="badge">Suzuki</span><h2>Vitara</h2><p>Najprodavaniji SUV i trošak police.</p></div>
            </a>
            <a href="{{ '/auto-osiguranje/mazda-cx-5/' | relative_url }}" class="model-card">
                <div><span class="badge">Mazda</span><h2>CX-5</h2><p>Zaštita Skyactiv tehnologije i dizajna.</p></div>
            </a>
            <a href="{{ '/auto-osiguranje/hyundai-i30/' | relative_url }}" class="model-card">
                <div><span class="badge">Hyundai</span><h2>i30</h2><p>Pouzdano osiguranje za gradski kompakt.</p></div>
            </a>
            <a href="{{ '/auto-osiguranje/kia-sportage/' | relative_url }}" class="model-card">
                <div><span class="badge">Kia</span><h2>Sportage</h2><p>Popularni SUV i kasko pogodnosti.</p></div>
            </a>
        </div>
    </div>

    <div class="brand-group">
        <h3 class="brand-title">European Style</h3>
        <div class="model-grid">
            <a href="{{ '/auto-osiguranje/renault-clio/' | relative_url }}" class="model-card">
                <div><span class="badge">Renault</span><h2>Clio</h2><p>Minimalni troškovi za gradsku vožnju.</p></div>
            </a>
            <a href="{{ '/auto-osiguranje/peugeot-208/' | relative_url }}" class="model-card">
                <div><span class="badge">Peugeot</span><h2>208</h2><p>Moderni dizajn i specifičnosti osiguranja.</p></div>
            </a>
            <a href="{{ '/auto-osiguranje/fiat-500/' | relative_url }}" class="model-card">
                <div><span class="badge">Fiat</span><h2>500</h2><p>Ikona stila uz najpovoljnije premije.</p></div>
            </a>
            <a href="{{ '/auto-osiguranje/dacia-duster/' | relative_url }}" class="model-card">
                <div><span class="badge">Dacia</span><h2>Duster</h2><p>Robusna zaštita uz minimalnu cijenu.</p></div>
            </a>
        </div>
    </div>

</div>
