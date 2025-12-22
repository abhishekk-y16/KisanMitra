Animation & Interaction Specs — Diagnostic Page

Purpose
- Define micro-interactions and motion guidelines for developer handoff.

Global Motion Tokens
- `--transition-fast`: 150ms cubic-bezier(0.4,0,0.2,1)
- `--transition-base`: 250ms cubic-bezier(0.4,0,0.2,1)
- `--transition-slow`: 350ms cubic-bezier(0.4,0,0.2,1)

Key Animations
- Section entrance: Fade + Slide Up
  - 
  - Easing: cubic-bezier(0.16,1,0.3,1)
  - CSS: `animate-fade-in-up` / `@keyframes fadeInUp`

- Capture → Result Reveal
  - Step 1 (Capture): large media area fades in (250–350ms)
  - Step 2 (Analyzing): subtle overlay with spinner and "Analyzing…" copy (opacity 0.6)
  - Step 3 (Reveal): image smoothly scales down to 200px preview while results panel fades/scale-in (delay 120–200ms)
  - Durations: image shrink 450–700ms; results reveal 250–350ms
  - Easing: image shrink uses `ease-out` (soft), results use `scaleIn` (springy small scale)

- Button hover
  - Slight upward translate (-2px) and soft shadow increase, duration `--transition-fast`

- Card hover
  - TranslateY(-6px) and shadow deepen; duration 200–300ms

Performance & Accessibility
- Respect `prefers-reduced-motion`: reduce or disable non-essential animations.
- Keep motion subtle; avoid long-running auto animations.

Developer Handoff Snippets
CSS example for reveal:
```css
.capture-image { transition: transform 600ms ease-out, width 600ms ease-out; }
.results { transition: opacity 300ms var(--transition-fast), transform 300ms var(--transition-fast); }
```

Interaction notes
- All interactive elements must have clear focus states. Use `outline` token and `:focus-visible` styles.
