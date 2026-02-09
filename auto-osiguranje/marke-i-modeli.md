---
layout: post
title: "Katalog Vozila | Premium Izračun Osiguranja"
---

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap" rel="stylesheet">

<style>
    :root {
        --bg-dark: #0a0a0a;
        --accent-blue: #0071e3; /* Apple Blue */
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
        margin-bottom: 100px;
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
        gap: 24px;
    }

    .model-card {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 24px;
        padding: 32px;
        text-decoration: none;
        transition: all 0.4s cubic-bezier(0.2, 0, 0, 1);
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-height: 180px;
    }

    .model-card:hover {
        background: rgba(255, 255, 255, 0.07);
        border-color: rgba(255, 255, 255, 0.2);
        transform: translateY(-8px);
    }

    .model-card h2 {
        color: #fff;
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0;
        letter-spacing: -0.01em;
    }

    .model-card p {
        color: var(--text-dim);
        font-size: 0.9rem;
        margin: 12px 0 0 0;
        line-height: 1.5;
    }

    .badge {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--accent-blue);
        font-weight: 700;
        margin-bottom: 8px;
        display: block;
    }

    .arrow-icon {
        position: absolute;
        bottom: 32px;
        right: 32px;
        opacity: 0;
        transform: translateX(-10px);
        transition: all 0.4s ease;
        color: var(--accent-blue);
    }

    .model-card:hover .arrow-icon {
        opacity: 1;
        transform: translateX(0);
    }

    /* Sekcije po brandovima */
    .brand-group {
        margin-top: 120px;
    }

    .brand-title {
        font-size: 0.9rem;
        color: var(--text-dim);
        text-transform: uppercase;
        letter-spacing: 0.2em;
        margin-bottom: 32px;
        border-bottom: 1px solid var(--card-border);
        padding-bottom: 16px;
    }

    @media (max-width: 768px) {
        .hub-container { padding: 40px 16px; }
        .hero-section h1 { font-size: 2.8rem; }
    }
</style>

<div class="hub-container">
    <header class="hero-section">
        <span class="badge" style="color: #fff; opacity: 0.6;">Intelligence in Motion</span>
        <h1>Pronađite svoje vozilo.</h1>
        <p>Precizni izračuni osiguranja temeljeni na specifikacijama modela, snazi motora i tržišnoj dinamici za 2026. godinu.</p>
    </header>

    <div class="brand-group">
        <h3 class="brand-title">German Precision</h3>
        <div class="model-grid">
            
            <a href="{{ '/auto-osiguranje/vw-golf-7/' | relative_url }}" class="model-card">
                <div>
                    <span class="badge">Volkswagen</span>
                    <h2>Golf 7</h2>
                    <p>Analiza kW razreda i kasko pokrića za najtraženiji kompakt.</p>
                </div>
                <span class="arrow-icon">→</span>
            </a>

            <a href="{{ '/auto-osiguranje/vw-passat/' | relative_url }}" class="model-card">
                <div>
                    <span class="badge">Volkswagen</span>
                    <h2>Passat</h2>
                    <p>Sve o osiguranju Business i Variant izvedbi.</p>
                </div>
                <span class="arrow-icon">→</span>
            </a>

            <a href="{{ '/auto-osiguranje/bmw-serija-3/' | relative_url }}" class="model-card">
                <div>
                    <span class="badge">Bayerische Motoren Werke</span>
                    <h2>Serija 3</h2>
                    <p>Premium zaštita za G20 i starije generacije.</p>
                </div>
                <span class="arrow-icon">→</span>
            </a>

        </div>
    </div>

    <div class="brand-group">
        <h3 class="brand-title">Asian Innovation</h3>
        <div class="model-grid">
            
            <a href="{{ '/auto-osiguranje/suzuki-vitara/' | relative_url }}" class="model-card">
                <div>
                    <span class="badge">Suzuki</span>
                    <h2>Vitara Hybrid</h2>
                    <p>Eko-popusti i specifičnosti 4WD osiguranja.</p>
                </div>
                <span class="arrow-icon">→</span>
            </a>

            <a href="{{ '/auto-osiguranje/toyota-yaris/' | relative_url }}" class="model-card">
                <div>
                    <span class="badge">Toyota</span>
                    <h2>Yaris</h2>
                    <p>Najniže stope za vodeći hibridni sustav na tržištu.</p>
                </div>
                <span class="arrow-icon">→</span>
            </a>

            <a href="{{ '/auto-osiguranje/mazda-cx-5/' | relative_url }}" class="model-card">
                <div>
                    <span class="badge">Mazda</span>
                    <h2>CX-5</h2>
                    <p>Skyactiv tehnologija i zaštita Kodo dizajna.</p>
                </div>
                <span class="arrow-icon">→</span>
            </a>

        </div>
    </div>
    
    </div>
