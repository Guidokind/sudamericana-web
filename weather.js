:root {
  --ink: #17120f;
  --ink-soft: #4e4944;
  --paper: #f6f3ed;
  --paper-2: #fffdf8;
  --green: #426f45;
  --green-dark: #2f5733;
  --red: #dd1838;
  --line: rgba(23, 18, 15, 0.12);
  --shadow: 0 24px 60px rgba(26, 22, 18, 0.11);
  --radius-xl: 32px;
  --radius-lg: 22px;
  --radius-md: 16px;
  --max: 1180px;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--ink);
  background:
    radial-gradient(circle at 85% 6%, rgba(66, 111, 69, 0.12), transparent 32rem),
    radial-gradient(circle at 4% 34%, rgba(221, 24, 56, 0.06), transparent 24rem),
    var(--paper);
  min-height: 100vh;
}

a { color: inherit; }
button, input, textarea, select { font: inherit; }
img { max-width: 100%; display: block; }

.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  transform: translateY(-150%);
  background: var(--ink);
  color: white;
  padding: 10px 14px;
  border-radius: 10px;
  z-index: 1000;
}
.skip-link:focus { transform: none; }

.site-shell { width: min(calc(100% - 32px), var(--max)); margin-inline: auto; }

.site-header {
  position: sticky;
  top: 0;
  z-index: 50;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  background: rgba(246, 243, 237, 0.82);
  border-bottom: 1px solid rgba(23, 18, 15, 0.08);
}

.nav-wrap {
  min-height: 86px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.brand { display: flex; align-items: center; text-decoration: none; min-width: 180px; }
.brand img { width: 210px; max-height: 64px; object-fit: contain; object-position: left center; }

.main-nav { display: flex; align-items: center; gap: 8px; }
.main-nav a {
  text-decoration: none;
  color: var(--ink-soft);
  padding: 10px 13px;
  border-radius: 12px;
  font-weight: 650;
  font-size: 0.94rem;
  transition: .2s ease;
}
.main-nav a:hover, .main-nav a[aria-current="page"] { color: var(--ink); background: rgba(255,255,255,.74); }

/* Home button visually references a small aircraft hangar. */
.main-nav .hangar-nav {
  position: relative;
  min-width: 68px;
  padding: 22px 12px 8px;
  text-align: center;
  background: transparent !important;
}
.main-nav .hangar-nav::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 4px;
  width: 42px;
  height: 24px;
  transform: translateX(-50%);
  border: 2px solid currentColor;
  border-bottom: 0;
  border-radius: 22px 22px 2px 2px;
  opacity: .8;
}
.main-nav .hangar-nav::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 14px;
  width: 2px;
  height: 14px;
  background: currentColor;
  box-shadow: -10px 3px 0 -0.5px currentColor, 10px 3px 0 -0.5px currentColor;
  transform: translateX(-50%);
  opacity: .72;
}

.menu-toggle {
  display: none;
  width: 46px;
  height: 46px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255,255,255,.75);
  color: var(--ink);
}

.hero {
  padding: 72px 0 56px;
  display: grid;
  grid-template-columns: minmax(0, 1.04fr) minmax(360px, .96fr);
  gap: 52px;
  align-items: center;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-transform: uppercase;
  letter-spacing: .16em;
  font-size: .75rem;
  font-weight: 800;
  color: var(--green-dark);
}
.eyebrow::before { content: ""; width: 28px; height: 2px; background: var(--red); }

h1, h2, h3 { margin-top: 0; line-height: 1.02; letter-spacing: -.035em; }
h1 { font-size: clamp(3.1rem, 7.5vw, 7rem); margin-bottom: 24px; }
h2 { font-size: clamp(2.15rem, 4vw, 4rem); margin-bottom: 18px; }
h3 { font-size: 1.35rem; }
.lead { font-size: clamp(1.08rem, 2vw, 1.32rem); line-height: 1.6; color: var(--ink-soft); max-width: 680px; }

.hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 32px; }
.btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 18px;
  border: 1px solid transparent;
  border-radius: 14px;
  text-decoration: none;
  font-weight: 800;
  cursor: pointer;
  transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
}
.btn:hover { transform: translateY(-2px); }
.btn-primary { background: var(--ink); color: white; box-shadow: 0 14px 30px rgba(23,18,15,.16); }
.btn-secondary { border-color: var(--line); background: rgba(255,255,255,.7); color: var(--ink); }
.btn-green { background: var(--green); color: white; }

.hangar-stage {
  position: relative;
  min-height: 510px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-xl);
  overflow: hidden;
  background:
    linear-gradient(to bottom, #dce7e7 0 43%, #c3bba9 43% 46%, #a79980 46% 100%);
  box-shadow: var(--shadow);
  isolation: isolate;
}
.hangar-stage::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 70% 14%, rgba(255,255,255,.78), transparent 26%),
    linear-gradient(120deg, transparent 0 50%, rgba(255,255,255,.14) 50% 53%, transparent 53% 100%);
  pointer-events: none;
}

.hangar {
  position: relative;
  width: min(82%, 430px);
  aspect-ratio: 1.38;
  background: #31332f;
  border-radius: 50% 50% 7px 7px / 44% 44% 7px 7px;
  box-shadow: 0 28px 50px rgba(20, 20, 18, .28);
  overflow: hidden;
  border: 10px solid #e7e0d4;
}
.hangar-interior {
  position: absolute;
  inset: 12px;
  border-radius: 50% 50% 2px 2px / 44% 44% 2px 2px;
  background:
    radial-gradient(circle at 50% 84%, rgba(255,255,255,.2), transparent 28%),
    linear-gradient(#232420, #090a09);
  display: grid;
  place-items: end center;
  padding-bottom: 45px;
}
.plane-mark {
  width: 72%;
  height: 70px;
  position: relative;
  filter: drop-shadow(0 14px 10px rgba(0,0,0,.35));
  opacity: .95;
}
.plane-mark::before {
  content: "";
  position: absolute;
  width: 76%;
  height: 12px;
  left: 12%;
  top: 26px;
  background: #f4f0e8;
  border-radius: 60% 58% 42% 42%;
}
.plane-mark::after {
  content: "";
  position: absolute;
  width: 100%;
  height: 10px;
  left: 0;
  top: 26px;
  background: #f4f0e8;
  clip-path: polygon(0 44%, 39% 22%, 48% 0, 52% 0, 61% 22%, 100% 44%, 60% 62%, 52% 100%, 48% 100%, 40% 62%);
}

.hangar-door {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50.3%;
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,.08) 0 1px, transparent 1px 22px),
    linear-gradient(180deg, #4c5048, #2f312d);
  border: 1px solid rgba(255,255,255,.08);
  transition: transform .7s cubic-bezier(.2,.8,.2,1);
  z-index: 4;
}
.hangar-door.left { left: 0; transform-origin: left; }
.hangar-door.right { right: 0; transform-origin: right; }
.hangar.open .hangar-door.left, .hangar:hover .hangar-door.left { transform: translateX(-96%); }
.hangar.open .hangar-door.right, .hangar:hover .hangar-door.right { transform: translateX(96%); }

.hangar-button {
  position: absolute;
  left: 50%;
  bottom: 34px;
  transform: translateX(-50%);
  z-index: 5;
  min-width: 180px;
  background: rgba(255,255,255,.91);
  border: 0;
  box-shadow: 0 14px 28px rgba(20,20,18,.2);
}
.hangar-button:hover { transform: translate(-50%, -2px); }

.metrics {
  margin: 20px 0 72px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: rgba(255,255,255,.62);
}
.metric { padding: 26px; }
.metric + .metric { border-left: 1px solid var(--line); }
.metric strong { display: block; font-size: 1.35rem; margin-bottom: 5px; }
.metric span { color: var(--ink-soft); line-height: 1.45; }

.section { padding: 76px 0; }
.section-soft { background: rgba(255,255,255,.46); border-block: 1px solid var(--line); }
.section-head { display: flex; justify-content: space-between; align-items: end; gap: 28px; margin-bottom: 34px; }
.section-head p { max-width: 600px; color: var(--ink-soft); line-height: 1.65; margin: 0; }

.card-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.service-card {
  min-height: 270px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,.74);
  transition: transform .2s ease, box-shadow .2s ease;
}
.service-card:hover { transform: translateY(-5px); box-shadow: 0 18px 42px rgba(23,18,15,.08); }
.service-icon {
  width: 52px;
  height: 52px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  background: rgba(66,111,69,.12);
  color: var(--green-dark);
  font-size: 1.5rem;
}
.service-card p { color: var(--ink-soft); line-height: 1.55; margin-bottom: 0; }

.page-hero { padding: 68px 0 34px; }
.page-hero h1 { font-size: clamp(3rem, 6.8vw, 6rem); max-width: 1000px; }
.page-hero .lead { max-width: 760px; }

.detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
.detail-card {
  position: relative;
  min-height: 310px;
  overflow: hidden;
  border-radius: var(--radius-xl);
  padding: 30px;
  background: var(--paper-2);
  border: 1px solid var(--line);
}
.detail-card::after {
  content: attr(data-num);
  position: absolute;
  right: 20px;
  bottom: -18px;
  font-size: 7rem;
  font-weight: 900;
  letter-spacing: -.08em;
  color: rgba(66,111,69,.08);
}
.detail-card p, .detail-card li { color: var(--ink-soft); line-height: 1.6; }
.detail-card ul { padding-left: 18px; }

.weather-layout { display: grid; grid-template-columns: 1fr 1.7fr; gap: 22px; align-items: start; }
.weather-panel, .forecast-panel, .quote-panel {
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  background: rgba(255,255,255,.76);
  box-shadow: 0 20px 50px rgba(23,18,15,.06);
}
.weather-panel { padding: 28px; position: sticky; top: 112px; }
.forecast-panel { padding: 28px; }
.search-row { display: flex; gap: 10px; }
.input, .textarea, .select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255,255,255,.9);
  color: var(--ink);
  padding: 13px 14px;
  outline: none;
}
.input:focus, .textarea:focus, .select:focus { border-color: rgba(66,111,69,.6); box-shadow: 0 0 0 4px rgba(66,111,69,.1); }
.textarea { min-height: 128px; resize: vertical; }

.current-weather { margin-top: 24px; }
.weather-big { font-size: 4.3rem; font-weight: 900; letter-spacing: -.07em; }
.weather-meta { color: var(--ink-soft); }
.weather-chips { display: grid; grid-template-columns: repeat(2,1fr); gap: 10px; margin-top: 22px; }
.weather-chip { padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: rgba(246,243,237,.6); }
.weather-chip small { display: block; color: var(--ink-soft); margin-bottom: 3px; }
.weather-chip strong { font-size: 1.12rem; }

.spray-status { margin-top: 18px; padding: 15px 16px; border-radius: 16px; font-weight: 750; line-height: 1.45; }
.spray-status.good { background: rgba(66,111,69,.12); color: var(--green-dark); }
.spray-status.caution { background: rgba(207,136,15,.13); color: #7d5510; }
.spray-status.bad { background: rgba(221,24,56,.1); color: #9d1630; }

.forecast-list { display: grid; gap: 10px; }
.forecast-row {
  display: grid;
  grid-template-columns: minmax(120px, 1.2fr) repeat(4, minmax(74px, .7fr));
  align-items: center;
  gap: 10px;
  padding: 14px 0;
  border-bottom: 1px solid var(--line);
}
.forecast-row:last-child { border-bottom: 0; }
.forecast-row small { color: var(--ink-soft); }

.quote-layout { display: grid; grid-template-columns: .85fr 1.15fr; gap: 24px; align-items: start; }
.quote-copy { padding: 20px 0; }
.quote-panel { padding: 28px; }
.form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; }
.field { display: grid; gap: 7px; }
.field label { font-weight: 750; font-size: .92rem; }
.field.full { grid-column: 1 / -1; }
.form-note { color: var(--ink-soft); font-size: .9rem; line-height: 1.5; }
.form-status { min-height: 24px; margin-top: 14px; font-weight: 700; }

.cta-strip {
  margin: 72px auto;
  padding: 34px;
  border-radius: var(--radius-xl);
  background: var(--ink);
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.cta-strip h2 { margin-bottom: 8px; font-size: clamp(2rem, 4vw, 3.4rem); }
.cta-strip p { margin: 0; color: rgba(255,255,255,.72); }
.cta-strip .btn { background: white; color: var(--ink); white-space: nowrap; }

.site-footer { padding: 28px 0 38px; color: var(--ink-soft); }
.footer-wrap { display: flex; justify-content: space-between; gap: 20px; align-items: center; border-top: 1px solid var(--line); padding-top: 24px; }
.footer-wrap img { width: 150px; max-height: 56px; object-fit: contain; object-position: left center; opacity: .82; }
.footer-links { display: flex; flex-wrap: wrap; gap: 16px; }
.footer-links a { text-decoration: none; }

.reveal { opacity: 0; transform: translateY(16px); transition: .6s ease; }
.reveal.visible { opacity: 1; transform: none; }

@media (max-width: 960px) {
  .menu-toggle { display: inline-grid; place-items: center; }
  .main-nav {
    display: none;
    position: absolute;
    left: 16px;
    right: 16px;
    top: 78px;
    padding: 12px;
    flex-direction: column;
    align-items: stretch;
    border: 1px solid var(--line);
    border-radius: 18px;
    background: rgba(255,253,248,.98);
    box-shadow: var(--shadow);
  }
  .main-nav.open { display: flex; }
  .main-nav .hangar-nav { padding-top: 10px; text-align: left; }
  .main-nav .hangar-nav::before, .main-nav .hangar-nav::after { display: none; }
  .hero { grid-template-columns: 1fr; padding-top: 48px; }
  .hangar-stage { min-height: 460px; }
  .card-grid { grid-template-columns: repeat(2, 1fr); }
  .weather-layout, .quote-layout { grid-template-columns: 1fr; }
  .weather-panel { position: static; }
}

@media (max-width: 640px) {
  .site-shell { width: min(calc(100% - 22px), var(--max)); }
  .nav-wrap { min-height: 74px; }
  .brand img { width: 174px; }
  .hero { gap: 34px; padding-top: 34px; }
  h1 { font-size: clamp(2.75rem, 14vw, 4.5rem); }
  .hangar-stage { min-height: 370px; border-radius: 24px; }
  .hangar { width: 88%; }
  .metrics { grid-template-columns: 1fr; }
  .metric + .metric { border-left: 0; border-top: 1px solid var(--line); }
  .section { padding: 56px 0; }
  .section-head { display: block; }
  .card-grid, .detail-grid { grid-template-columns: 1fr; }
  .service-card { min-height: 220px; }
  .search-row { flex-direction: column; }
  .weather-chips { grid-template-columns: 1fr 1fr; }
  .forecast-row { grid-template-columns: 1.1fr .8fr .8fr; }
  .forecast-row > :nth-child(4), .forecast-row > :nth-child(5) { display: none; }
  .form-grid { grid-template-columns: 1fr; }
  .field.full { grid-column: auto; }
  .cta-strip { display: block; padding: 28px 22px; }
  .cta-strip .btn { margin-top: 22px; width: 100%; }
  .footer-wrap { align-items: flex-start; flex-direction: column; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; }
  .reveal { opacity: 1; transform: none; }
}
