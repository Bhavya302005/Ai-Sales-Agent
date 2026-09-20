# Hirevia — Complete Design System Reference

> **Purpose:** A single, authoritative reference document for every design decision in the Hirevia UI. Use this to replicate the exact visual language on any new project with zero guesswork.

---

## 1. Design Philosophy

The Hirevia design system is modeled after **Grovia (grovia.framer.ai)** — a premium, editorial SaaS aesthetic. The rules are:

- **Warm neutral backgrounds**, never pure white or cold grey.  
- **Ink-black text** on warm paper, never generic `#333`.  
- **One accent color**: a vivid red glow (`#e83043`) reserved for dark surfaces only — never used on light backgrounds directly.  
- **Typography is tight** — all headings use `letter-spacing: -0.04em` to `-0.05em`.  
- **Buttons have personality** — pill-shaped with a circular arrow icon inside the dark/yellow variants.  
- **Cards float** — every card uses an asymmetric warm shadow (not a flat box-shadow).  
- **Sections breathe** — generous `clamp()` padding so the layout never feels cramped.

---

## 2. Color Tokens

```css
:root {
  /* Backgrounds */
  --bg:         #f4f2ee;
  --bg-2:       #f0ece6;
  --card:       #ffffff;

  /* Text */
  --ink:        #000000;
  --muted:      #605f5f;
  --muted-2:    #8b8985;

  /* Lines */
  --line:       #e6e6e6;
  --line-warm:  #e1d8c6;

  /* Accent Palette */
  --yellow:        #fef7af;
  --yellow-strong: #fecd1a;
  --coral:         #f7a49e;
  --cyan:          #84e6f6;
  --mint:          #c8ecd4;
  --lilac:         #d9d3f7;

  /* Dark Surface */
  --dark:   #17191b;
  --dark-2: #1f2225;
  --glow:   #e83043;

  /* Border Radii */
  --r-pill: 100px;
  --r-lg:   28px;
  --r-md:   20px;
  --r-sm:   12px;

  /* Shadows */
  --shadow-card:  -2.46px 12.28px 25px rgba(104, 99, 80, 0.15);
  --shadow-nav:    0 1px 20px rgba(224, 215, 198, 0.55);
  --shadow-float:  0 4px 40px rgba(225, 216, 198, 0.5);
  --shadow-sm:     0 2px 8px rgba(0,0,0,0.04), 0 0 1px rgba(0,0,0,0.06);
  --shadow-md:     0 8px 28px rgba(0,0,0,0.07), 0 2px 6px rgba(0,0,0,0.04);
  --shadow-lg:     0 20px 48px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.05);

  /* Easing */
  --ease:     cubic-bezier(0.44, 0, 0.56, 1);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);

  /* Max Width */
  --maxw: 1150px;
}
```

---

## 3. The Red Glow — Signature Pattern

> This is the most critical pattern. Never substitute it.

```css
background: radial-gradient(
  circle at 100% 0%,
  rgba(232, 48, 67, 0.35) 0%,
  rgba(232, 48, 67, 0.05) 50%,
  transparent 70%
), #17191b;
```

**Where this is used:**
- Nav side-toggle active thumb
- Dark section `::before` pseudo-element (42% opacity variant)
- Upgrade card in Dashboard sidebar
- `.btn-dark:hover` background
- Tab visual dark panel `::after` (bottom-right position)
- Onboarding AI gradient (`--ai-gradient`, 20% opacity variant)

---

## 4. Typography

### Font Stack

```css
font-family: "Albert Sans", system-ui, -apple-system, sans-serif;
font-family: "Fragment Mono", ui-monospace, monospace;  /* eyebrows, counters */
```

**Google Fonts import:**
```html
<link href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600;700;800&family=Fragment+Mono&display=swap" rel="stylesheet">
```

### Type Scale

| Element | Size | Weight | Letter-spacing |
|---|---|---|---|
| `h1` | `clamp(38px, 6.2vw, 62px)` | 400 | `-0.045em` |
| `h2` | `clamp(32px, 4.4vw, 46px)` | 400 | `-0.042em` |
| `h3` | `clamp(22px, 2.4vw, 28px)` | 400 | `-0.035em` |
| Body | `16px / 1.55` | 400 | normal |
| Hero lede | `17px` | 400 | normal |
| `.eyebrow` | `11px` / `10.5px` | 400 | `+0.08em` |
| Nav links | `14.5px` | 400 | normal |
| Buttons | `15px` | 500 | `-0.01em` |
| Pill-tags | `10.5px` | 400 | normal |

**Rule:** All `h1–h4` have `font-weight: 400` and `margin: 0`. The design uses size and spacing for hierarchy, not bold weight.

---

## 5. Global Layout

### Body

```css
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: "Albert Sans", system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

/* Subtle vertical stripe texture */
body::before {
  content: "";
  position: fixed; inset: 0;
  pointer-events: none; z-index: 0;
  background-image: repeating-linear-gradient(
    90deg,
    rgba(0,0,0,0.016) 0px, rgba(0,0,0,0.016) 1px,
    transparent 1px, transparent 96px
  );
}
```

### Global Zoom & Content Wrapper

```css
html { zoom: 0.9; }
html, body, #root { margin: 0; padding: 0; min-height: calc(100vh / 0.9); width: 100%; }

.wrap {
  width: min(100% - 40px, var(--maxw));
  margin-inline: auto;
  position: relative; z-index: 1;
}
```

### Section Rhythm

```css
section { padding: clamp(48px, 5.5vw, 84px) 0; position: relative; }
html { scroll-behavior: smooth; scroll-padding-top: 110px; }
```

---

## 6. Buttons

### Base

```css
.btn {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 11px 12px 11px 22px;  /* asymmetric for circular arrow */
  border-radius: var(--r-pill);
  font-size: 15px; font-weight: 500; letter-spacing: -0.01em;
  transition: transform 0.35s var(--ease), background 0.3s var(--ease),
              box-shadow 0.35s var(--ease), color 0.3s var(--ease);
  white-space: nowrap;
}
.btn .arrow {
  width: 26px; height: 26px; border-radius: 50%;
  display: grid; place-items: center;
  transition: transform 0.4s var(--ease-out), background 0.3s var(--ease);
}
.btn .arrow svg { width: 12px; height: 12px; }
```

### `.btn-dark` — Primary

```css
.btn-dark { background: var(--ink); color: #fff; }
.btn-dark .arrow { background: #fff; color: var(--ink); }
.btn-dark:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(0,0,0,0.18);
  background: radial-gradient(circle at 100% 0%, rgba(232,48,67,0.35) 0%, rgba(232,48,67,0.05) 50%, transparent 70%), #17191b;
  color: #ffffff;
}
.btn-dark:hover .arrow { transform: translateX(4px); }
```

### `.btn-ghost` — Secondary

```css
.btn-ghost { background: transparent; color: var(--ink); border: 1px solid rgba(0,0,0,0.18); padding: 11px 24px; }
.btn-ghost:hover { background: rgba(0,0,0,0.05); transform: translateY(-2px); }
```

### `.btn-yellow` — Pricing CTA

```css
.btn-yellow { background: var(--yellow); color: var(--ink); }
.btn-yellow .arrow { background: var(--ink); color: var(--yellow); }
.btn-yellow:hover { background: var(--yellow-strong); transform: translateY(-2px); }
.btn-yellow:hover .arrow { transform: translateX(4px); }
```

### `.btn-light` — On dark surfaces

```css
.btn-light { background: #fff; color: var(--ink); }
.btn-light .arrow { background: var(--ink); color: #fff; }
.btn-light:hover { transform: translateY(-2px); box-shadow: var(--shadow-card); }
.btn-light:hover .arrow { transform: translateX(4px); }
```

### Small Size

```css
.btn.sm { padding: 7px 16px; font-size: 13px; }
.btn.sm:has(.arrow) { padding: 7px 10px 7px 16px; }
.btn.sm .arrow { width: 22px; height: 22px; }
```

---

## 7. Navigation Bar

The landing page uses a **floating pill navbar** (fixed, top: 18px) with a detached role-toggle pill to its right.

```css
.nav-outer {
  position: fixed; top: 18px; left: 0; right: 0; z-index: 90;
  display: flex; align-items: center; justify-content: center;
  gap: 10px; padding: 0 24px;
  pointer-events: none;
}

.nav {
  pointer-events: auto;
  width: auto;       /* shrink-wraps content */
  height: 58px;
  background: #fff;
  border-radius: 100px;
  box-shadow: 0 2px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 32px;
  gap: 48px;
  transition: box-shadow 0.4s var(--ease);
}
.nav.scrolled { box-shadow: 0 6px 30px rgba(104,99,80,0.18); }

.nav-brand {
  display: flex; align-items: center; gap: 10px;
  font-size: 17px; font-weight: 500; letter-spacing: -0.03em;
  color: var(--ink); text-decoration: none; white-space: nowrap; flex-shrink: 0;
}

.nav-links { display: flex; align-items: center; gap: 28px; flex: 1; justify-content: center; font-size: 14.5px; }
.nav-links a { color: var(--ink); opacity: 0.7; transition: opacity 0.2s; text-decoration: none; position: relative; }
.nav-links a::after {
  content: ""; position: absolute; left: 0; bottom: -3px;
  height: 1px; width: 100%; background: currentColor;
  transform: scaleX(0); transform-origin: right;
  transition: transform 0.3s var(--ease-out);
}
.nav-links a:hover { opacity: 1; }
.nav-links a:hover::after { transform: scaleX(1); transform-origin: left; }
```

---

## 8. Role Toggle Pill

Floats to the right of the main nav pill. Switches context between "I'm job hunting" / "I'm hiring".

```css
.nav-side-toggle {
  position: relative; display: flex; align-items: center;
  background: #f2f1ee; border-radius: var(--r-pill);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06);
  padding: 4px; gap: 0;
}

/* Active thumb — RED GLOW pattern */
.nav-side-toggle-thumb {
  position: absolute; top: 4px; left: 4px;
  height: calc(100% - 8px); width: calc(50% - 4px);
  background: radial-gradient(circle at 100% 0%, rgba(232,48,67,0.35) 0%, rgba(232,48,67,0.05) 50%, transparent 70%), #17191b;
  border-radius: var(--r-pill);
  box-shadow: 0 4px 14px rgba(0,0,0,0.22), inset 0 1px 1px rgba(255,255,255,0.15);
  transition: transform 0.35s var(--ease-out); pointer-events: none;
}
.nav-side-toggle[data-active="recruiter"] .nav-side-toggle-thumb {
  transform: translateX(calc(100% + 1px));
}

/* Buttons — FIXED 155px width for perfect 50% thumb alignment */
.nav-side-toggle-btn {
  position: relative; z-index: 1;
  width: 155px;           /* DO NOT CHANGE */
  padding: 16px 0 17px;  /* DO NOT CHANGE */
  font-size: 15px; font-weight: 400; letter-spacing: -0.01em;
  color: var(--muted); cursor: pointer;
  border-radius: var(--r-pill); white-space: nowrap; text-align: center;
  transition: color 0.25s var(--ease); line-height: 1;
}
.nav-side-toggle-btn.active { color: #fff; }
```

---

## 9. Dark Section (`.dark-sec`)

Used for Pricing and Contact. Applied inside `.wrap` as a rounded dark block.

```css
.dark-sec {
  background: var(--dark);
  color: #fff; border-radius: 36px;
  padding: clamp(44px, 6vw, 76px);
  position: relative; overflow: hidden;
  margin: clamp(40px, 6vw, 80px) 0;
}
/* Top-right red glow orb */
.dark-sec::before {
  content: ""; position: absolute;
  width: 620px; height: 620px; border-radius: 50%;
  background: radial-gradient(circle, rgba(232,48,67,0.42), rgba(232,48,67,0.05) 55%, transparent 72%);
  top: -280px; right: -180px;
}
.dark-sec > * { position: relative; z-index: 1; }
.dark-sec h2, .dark-sec h3 { color: #fff; }
.dark-sec p { color: rgba(255,255,255,0.66); }
```

---

## 10. Cards

### Standard White Card

```css
background: #fff;
border-radius: 22px;
box-shadow: var(--shadow-card);  /* -2.46px 12.28px 25px rgba(104,99,80,0.15) */
border: 1px solid rgba(0,0,0,0.04);
padding: 18px;
```

### Step Cards

```css
.step { background: #fff; border-radius: var(--r-lg); padding: 22px; box-shadow: var(--shadow-card); }
.step:hover { transform: translateY(-6px); box-shadow: -3px 18px 34px rgba(104,99,80,0.2); }
```

### Step Art Gradient Backgrounds

```css
.step-art.a { background: linear-gradient(150deg, #fff5c9, #ffe08a); }  /* warm yellow */
.step-art.b { background: linear-gradient(150deg, #d8f6fb, #a9e6f4); }  /* cyan */
.step-art.c { background: linear-gradient(150deg, #ffe3e0, #f9b9b4); }  /* coral */
```

### Glassmorphism Card (Pricing panel)

```css
.plan-card {
  background: rgba(255,255,255,0.055);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: var(--r-lg); padding: 30px;
  backdrop-filter: blur(6px);
}
```

---

## 11. Pill Tags

```css
.pill-tag { font-size: 10.5px; padding: 3px 9px; border-radius: 20px; background: var(--bg-2); color: var(--muted); }
.pill-tag.green  { background: var(--mint);   color: #1d5c37; }
.pill-tag.blue   { background: var(--cyan);   color: #0d4d59; }
.pill-tag.yellow { background: var(--yellow); color: #6b5a00; }
.pill-tag.coral  { background: var(--coral);  color: #6d2320; }
```

---

## 12. Hero Section

```css
.hero { padding-top: 148px; padding-bottom: 40px; }

.hero-grid {
  display: grid; grid-template-columns: 1fr 1.05fr;
  gap: 40px; align-items: center;
}
.hero h1 { margin: 22px 0 18px; max-width: 12ch; }
.hero .lede { font-size: 17px; max-width: 46ch; }
.hero-cta { display: flex; gap: 12px; margin-top: 32px; flex-wrap: wrap; }

/* Art area with floating cards */
.hero-art { position: relative; height: 470px; }
.hero-card-main {
  position: absolute; top: 0; left: 0; width: 82%;
  animation: floatA 9s ease-in-out infinite;
}
.hero-card-float {
  position: absolute; bottom: 8px; right: 0; width: 62%;
  animation: floatB 11s ease-in-out infinite;
}
@keyframes floatA { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
@keyframes floatB { 0%,100% { transform: translateY(0); } 50% { transform: translateY(11px); } }
```

---

## 13. Mockup Primitives

```css
/* Table Row */
.mock-row {
  display: flex; align-items: center; gap: 11px;
  padding: 10px 12px; border-radius: 14px;
  transition: background 0.3s var(--ease);
}
.mock-row.hl { background: var(--yellow); }

/* Avatar */
.av { width: 32px; height: 32px; border-radius: 50%; flex: none; }
/* Avatar gradient pairs for demo data:
   gold-salmon: linear-gradient(135deg, #ffd76e, #f7a49e)
   cyan-blue:   linear-gradient(135deg, #84e6f6, #8fb7ff)
   mint-green:  linear-gradient(135deg, #c8ecd4, #9fd8b6) */

/* Stat display */
.stat-big { font-size: 26px; letter-spacing: -0.04em; }

/* Bar chart */
.bars { display: flex; align-items: flex-end; gap: 12px; height: 96px; margin-top: 12px; }
.bars .col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; }
.bars i { display: block; border-radius: 4px; background: var(--yellow-strong); }
```

---

## 14. Eyebrow Labels

```css
.eyebrow {
  font-family: "Fragment Mono", ui-monospace, monospace;
  font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-2);              /* on light sections */
  /* color: rgba(255,255,255,0.5);   on dark sections */
}
```

---

## 15. Pricing Section

```css
.pricing-grid { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 52px; align-items: start; }

.plan-btn {
  display: flex; align-items: center; gap: 14px; width: 100%;
  padding: 16px 18px; border-radius: 18px; text-align: left;
  border: 1px solid rgba(255,255,255,0.12);
  transition: background 0.4s var(--ease), border-color 0.4s var(--ease), transform 0.4s var(--ease-out);
}
.plan-btn:hover { background: rgba(255,255,255,0.06); transform: translateX(3px); }
.plan-btn[aria-selected="true"] { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.3); }
.plan-btn b { font-weight: 500; font-size: 17px; letter-spacing: -0.03em; }
.plan-btn small { color: rgba(255,255,255,0.55); font-size: 12.5px; }
.plan-btn .most { margin-left: auto; font-size: 10.5px; background: var(--yellow); color: #5f5100; padding: 4px 10px; border-radius: 20px; }

.plan-card .price { display: flex; align-items: baseline; gap: 6px; }
.plan-card .price h3 { font-size: 46px; letter-spacing: -0.05em; }
.plan-card .price span { color: rgba(255,255,255,0.55); font-size: 14px; }

.plan-feats li { color: rgba(255,255,255,0.78); font-size: 14.5px; }
.plan-feats svg { color: var(--yellow-strong); width: 17px; height: 17px; }
```

---

## 16. FAQ Section

```css
.faq-grid { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 56px; align-items: start; }
.faq-item { background: rgba(255,255,255,0.45); border-radius: 16px; }

.faq-q {
  width: 100%; display: flex; align-items: center; gap: 16px;
  padding: 24px 28px; text-align: left;
  font-size: 17px; letter-spacing: -0.025em; color: var(--ink);
}
.faq-q .ico {
  margin-left: auto; font-size: 24px; font-weight: 300; color: var(--muted-2);
  transition: transform 0.45s var(--ease-out), color 0.35s var(--ease);
}
.faq-item.open .faq-q .ico { transform: rotate(45deg); color: var(--ink); }

/* CSS grid trick for smooth height animation */
.faq-a { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.45s var(--ease-out); }
.faq-item.open .faq-a { grid-template-rows: 1fr; }
.faq-a > div { overflow: hidden; }
.faq-a p { padding: 0 28px 24px; font-size: 15px; max-width: 62ch; }
```

---

## 17. Contact Section

```css
.contact-grid { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 52px; }

.form label { font-size: 12.5px; color: rgba(255,255,255,0.55); display: block; margin-bottom: 6px; }
.form input, .form textarea {
  width: 100%;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 14px; padding: 13px 16px;
  color: #fff; font: inherit; font-size: 15px;
  transition: border-color 0.3s var(--ease), background 0.3s var(--ease);
}
.form input::placeholder, .form textarea::placeholder { color: rgba(255,255,255,0.32); }
.form input:focus, .form textarea:focus {
  outline: none;
  border-color: rgba(255,255,255,0.42);
  background: rgba(255,255,255,0.11);
}
.form textarea { min-height: 118px; resize: vertical; }
```

---

## 18. Steps Section

```css
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.step .num { font-family: "Fragment Mono", monospace; font-size: 12px; color: var(--muted-2); }
.step h3 { margin: 12px 0 8px; font-size: 22px; }
.step p { font-size: 14.5px; }

.step-art { height: 148px; border-radius: 18px; margin-top: 18px; overflow: hidden; display: grid; place-items: center; }

.mini-card { background: #fff; border-radius: 12px; padding: 11px 13px; box-shadow: 0 6px 18px rgba(0,0,0,0.08); width: 78%; }
.mini-line { height: 7px; border-radius: 4px; background: #efece7; margin-top: 7px; }
.mini-line.s { width: 60%; }
.mini-btn { margin-top: 10px; background: var(--ink); color: #fff; font-size: 10.5px; padding: 6px 0; border-radius: 8px; text-align: center; }
```

---

## 19. Dashboard Shell & Sidebar

```css
.shell {
  display: flex; min-height: calc(100vh / 0.9);
  background: var(--bg); font-family: "Albert Sans", system-ui, sans-serif;
  font-size: 15px; -webkit-font-smoothing: antialiased; color: var(--ink);
}

.sidebar {
  width: 260px; flex: none;
  background: var(--card); border-radius: 16px;
  box-shadow: var(--shadow-sm); padding: 24px 12px 20px;
  margin: 18px 0 18px 18px;
  display: flex; flex-direction: column;
  position: sticky; top: 18px;
  height: calc((100vh / 0.9) - 36px);
  transition: width 0.35s var(--ease-out), padding 0.35s var(--ease-out);
}
.sidebar.collapsed { width: 64px; }

/* Nav items */
.nav-item {
  display: flex; align-items: center; gap: 12px;
  padding: 0 11px; height: 40px; border-radius: 12px;
  font-size: 14px; color: var(--muted);
  transition: background 0.2s, color 0.2s;
}
.nav-item:hover { color: var(--ink); background: var(--bg-2); }
.nav-item.active { color: var(--ink); background: var(--yellow); font-weight: 500; }

/* Upgrade card — RED GLOW pattern */
.upgrade-card {
  border-radius: 16px; padding: 18px; margin: 12px 0 4px;
  background: radial-gradient(circle at 100% 0%, rgba(232,48,67,0.35) 0%, rgba(232,48,67,0.05) 50%, transparent 70%), var(--dark);
  border: 1px solid rgba(255,255,255,0.09);
}
.sidebar.collapsed .upgrade-card { opacity: 0; max-height: 0; margin: 0; pointer-events: none; }

/* Content area */
.content { flex: 1; min-width: 0; padding: 18px 24px 40px; }
```

---

## 20. Marquee Strip

```css
.marquee {
  overflow: hidden; padding: 26px 0 6px;
  mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
}
.marquee-track {
  display: flex; gap: 62px; width: max-content;
  animation: slide 32s linear infinite;
}
.marquee:hover .marquee-track { animation-play-state: paused; }
@keyframes slide { to { transform: translateX(-50%); } }

.logo-item {
  display: flex; align-items: center; gap: 10px;
  font-size: 25px; letter-spacing: -0.04em;
  color: rgba(0,0,0,0.26); white-space: nowrap;
}
```

---

## 21. Scroll Reveal Animations

```css
.rv { opacity: 0; transform: translateY(22px); transition: opacity 0.75s var(--ease), transform 0.75s var(--ease); }
.rv.in { opacity: 1; transform: none; }
.rv-d1 { transition-delay: 0.08s; }
.rv-d2 { transition-delay: 0.16s; }
.rv-d3 { transition-delay: 0.24s; }

/* Hero entrance */
.hero-in {
  opacity: 0; transform: translateY(18px);
  animation: heroUp 0.9s var(--ease-out) forwards;
}
@keyframes heroUp { to { opacity: 1; transform: none; } }

/* Animation delay utilities */
.d0 { animation-delay: 0.05s; }
.d1 { animation-delay: 0.15s; }
.d2 { animation-delay: 0.25s; }
.d3 { animation-delay: 0.35s; }
.d4 { animation-delay: 0.45s; }
.d5 { animation-delay: 0.60s; }
```

---

## 22. Responsive Breakpoints

```css
@media (max-width: 1000px) {
  .hero-grid, .pricing-grid, .faq-grid, .contact-grid { grid-template-columns: 1fr; }
  .steps, .stories, .quotes { grid-template-columns: 1fr 1fr; }
  .hero-art { min-height: 360px; margin-top: 20px; }
}

@media (max-width: 720px) {
  .nav-links { display: none; }
  .steps, .int-grid { grid-template-columns: 1fr 1fr; }
  .stories, .quotes { grid-template-columns: 1fr; }
  .dark-sec { border-radius: 26px; }
}

@media (max-width: 560px) {
  .steps, .stats, .kpis, .foot-grid { grid-template-columns: 1fr; }
  .hero-card-float { position: static !important; width: 100% !important; margin-top: 14px; }
  .hero-art { height: auto !important; min-height: 0; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
```

---

## 23. Testimonials

```css
.quotes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: start; }
.quote { background: #fff; border-radius: var(--r-lg); padding: 26px; box-shadow: var(--shadow-card); transition: transform 0.5s var(--ease-out); }
.quote:nth-child(2) { margin-top: 34px; }  /* stagger */
.quote:nth-child(3) { margin-top: 14px; }
.quote:hover { transform: translateY(-5px); }
.quote .mark { font-size: 52px; line-height: 0.6; color: var(--yellow-strong); }
```

---

## 24. Stats Grid

```css
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; text-align: center; }
.stat b { display: block; font-size: clamp(34px, 4.6vw, 52px); font-weight: 400; letter-spacing: -0.05em; }
.stat small { color: var(--muted); font-size: 14px; }
```

---

## 25. Tab Feature Panels

```css
.tabs {
  display: inline-flex; gap: 4px;
  background: rgba(255,255,255,0.72); border: 1px solid rgba(0,0,0,0.06);
  border-radius: var(--r-pill); padding: 5px; margin-bottom: 32px;
}
.tabs button { padding: 10px 18px; border-radius: var(--r-pill); font-size: 14px; color: var(--muted); font-weight: 500; }
.tabs button[aria-selected="true"] { background: #fff; color: var(--ink); box-shadow: 0 2px 10px rgba(0,0,0,0.07); }

.tab-panel.on {
  display: grid; grid-template-columns: 1.15fr 0.85fr;
  gap: 44px; align-items: center;
  animation: sideIn 0.5s var(--ease-out) both;
}

/* Dark visual panel with red glow bottom-right */
.tab-visual {
  background: var(--dark); border-radius: var(--r-lg);
  padding: 26px; min-height: 340px;
  position: relative; overflow: hidden;
  display: grid; place-items: center;
}
.tab-visual::after {
  content: ""; position: absolute;
  width: 340px; height: 340px; border-radius: 50%;
  background: radial-gradient(circle, rgba(232,48,67,0.4), transparent 68%);
  bottom: -170px; right: -120px; filter: blur(10px);
}
```

---

## 26. Footer

```css
footer { padding: 20px 0 40px; }
.foot-grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 34px; padding: 40px 0; }
.foot-col h6 {
  font-family: "Fragment Mono", monospace; font-size: 12px; font-weight: 500;
  color: var(--muted-2); letter-spacing: 0.04em; text-transform: uppercase; margin: 0 0 14px;
}
.foot-col a { display: block; padding: 5px 0; font-size: 15px; color: var(--muted); transition: color 0.3s var(--ease), transform 0.3s var(--ease-out); }
.foot-col a:hover { color: var(--ink); transform: translateX(3px); }
.socials a {
  width: 34px; height: 34px; border-radius: 50%; background: #fff;
  display: grid; place-items: center; box-shadow: var(--shadow-nav);
  transition: transform 0.4s var(--ease-out);
}
.socials a:hover { transform: translateY(-3px); }
```

---

## 27. Onboarding Layout

```css
/* Global class on body for onboarding */
.lp-body {
  background: var(--bg); font-family: "Albert Sans", system-ui, sans-serif;
  font-size: 15px; line-height: 1.55; -webkit-font-smoothing: antialiased;
}

/* Sticky topbar */
.lp-topbar {
  position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; gap: 9px;
  padding: 12px clamp(20px, 4vw, 48px);
  background:
    repeating-linear-gradient(90deg, rgba(0,0,0,0.016) 0px, rgba(0,0,0,0.016) 1px, transparent 1px, transparent 96px),
    color-mix(in oklab, var(--bg) 82%, transparent);
  backdrop-filter: blur(10px);
}

/* Two-column layout */
.lp-layout {
  max-width: 1380px; margin: 0 auto;
  padding: 0 clamp(16px, 3vw, 40px) 48px;
  display: grid; grid-template-columns: 1fr 340px;
  gap: 16px; align-items: stretch;
}

/* Bento grid inside main column */
.lp-bento-grid {
  display: grid; grid-template-columns: repeat(2, 1fr);
  gap: 8px; align-items: stretch;
}

/* AI gradient for dark onboarding panels */
--ai-gradient: radial-gradient(circle at 100% 0%, rgba(232,48,67,0.2) 0%, rgba(232,48,67,0.03) 50%, transparent 70%), #17191b;
```

---

## 28. Quick-Reference Cheat Sheet

| Property | Value |
|---|---|
| Page background | `#f4f2ee` |
| Card background | `#ffffff` |
| Primary text | `#000000` |
| Muted text | `#605f5f` |
| Very muted | `#8b8985` |
| Dark surface | `#17191b` |
| Red accent | `#e83043` |
| Yellow accent | `#fef7af` |
| Yellow strong | `#fecd1a` |
| Primary font | Albert Sans |
| Mono font | Fragment Mono |
| Radius (pill) | `100px` |
| Radius (large card) | `28px` |
| Radius (medium) | `20px` |
| Radius (small) | `12px` |
| Standard ease | `cubic-bezier(0.44, 0, 0.56, 1)` |
| Spring ease | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Card shadow | `-2.46px 12.28px 25px rgba(104,99,80,0.15)` |
| Max content width | `1150px` |
| Global zoom | `0.9` |
| Nav height | `58px` fixed at `top: 18px` |

---

## 29. Do's and Don'ts

### ✅ DO

- Use `clamp()` for font sizes, paddings, and margins that need to scale fluidly.
- Always apply the red glow radial-gradient on dark (`#17191b`) surfaces only.
- Keep all heading `font-weight: 400` — the design uses scale for hierarchy, not bold weight.
- Use `var(--ease-out)` for hovers and entrances; `var(--ease)` for bidirectional transitions.
- Add `transform: translateY(-2px)` + mild shadow on card/button hovers.
- Use `Fragment Mono` for numeric labels, step counters, eyebrows, and footer column headers.
- Maintain `scroll-behavior: smooth` and `scroll-padding-top: 110px` on `html`.
- Include the `body::before` stripe texture on the page background.

### ❌ DON'T

- Don't use cold grays (`#aaa`, `#888`). Every neutral is a warm tone.
- Don't use a flat linear red gradient where the radial glow pattern is specified.
- Don't use `font-weight: 700` on headings — the design avoids heavy type weight.
- Don't use generic `box-shadow: 0 4px 12px rgba(0,0,0,0.1)` — use the warm asymmetric `var(--shadow-card)`.
- Don't center the nav pill with `width: 100%` — it must be `width: auto` to shrink-wrap.
- Don't omit `border: 1px solid rgba(0,0,0,0.04)` on white cards — it defines subtle edge on warm backgrounds.

---

*This document covers 100% of the design tokens, component patterns, animations, and layout rules in the Hirevia project.*
