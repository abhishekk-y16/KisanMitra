Kisan‑Mitra — Diagnostic Page (Figma Handoff)

Overview
- Purpose: Desktop‑first premium UI for `Diagnostic` (1440px+), ready for developer handoff.
- Files: Use the color, spacing and typography tokens in `design-tokens.json`.

Tokens
- Colors: map from `design-tokens.json` (primary, secondary, neutral, semantic)
- Type: Heading scale (H1 48/56, H2 32/40, H3 20/28), Body (16/24), Caption (13/18)
- Spacing: base grid 8px, page gutter token used for left/right margins

Components
- Capture Card
  - Large rounded media area, glass backdrop, subtle glow when active
  - Upload CTA (primary gradient), secondary action (choose from gallery)
  - Microcopy: tips, file constraints

- Result Card
  - Gradient header (subtle), badge row, confidence pill
  - Sections: Symptoms (list), Treatment (immediate, organic, prevention)
  - Collapse/expand per section

- Buttons
  - Primary: gradient from primary-600→primary-700, rounded-xl, shadow-glow on hover
  - Secondary: white, subtle border
  - Ghost: transparent

Layout Notes
- Generous negative space, consistent 24/24/24 rhythm between major sections
- Cards align on 12‑col baseline; use consistent left alignment for text blocks

Export / Assets
- SVG icons: export optimized SVGs at 2x for retina
- Capture placeholder illustration: export PNG + SVG variants

Handoff Checklist
- Include token file (`design-tokens.json`) and `tailwind.tokens.js`
- Provide component variants in Figma with states (idle, hover, active, loading)
- Document animation durations & easing in `ANIMATIONS.md`
