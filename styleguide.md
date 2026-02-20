# GenSynth Match Style Guide

## Copy-Paste Prompt For Another LLM
Use this prompt to restyle another tool so it matches this UI:

```text
Redesign this tool to match a light, minimal, instrument-panel aesthetic:

- Overall tone: modern monochrome, clean, precise, low-noise UI.
- Base surface: white canvas/background with only a very subtle cool-grey gradient for depth.
- Panels: very light grey floating control surfaces with soft bevel + inset highlights (subtle 3D, not glossy).
- Typography: use "Aldrich" for primary UI text and "Fragment Mono" for technical/meta text.
- Color system: mostly grayscale. Avoid colorful accents except for functional modulation state.
- Accent usage: only modulation bars use orange when active; inactive bars are medium-light grey.
- Motion: minimal. No reveal animations. Keep only subtle hover/press transitions.
- Layout: parameter HUD top-left, transport controls bottom-center.
- Controls:
  - Buttons are compact with light bevel.
  - Focus ring is visible and neutral grey.
  - Sliders are technical, with clear min/max/current handles.
- Slider logic visuals:
  - Modulated ranges: show min, current, max handles.
  - Non-modulated ranges: show only current handle with fixed min/max track limits.
  - Current handle is always in front, narrower and taller.
  - Min/max handles are behind current and wider.
  - When all overlap, current sits centered, min visible on left, max visible on right.
- Modulation button:
  - Low-profile button, same height as slider lane.
  - Contains 5 equal vertical bars.
  - Click cycles levels 0..5.
  - Lit bars are bright orange; unlit bars are grey.
- Tooltip:
  - Light grey tooltip with soft shadow.
  - Color swatch appears only for H/S/L parameters and sits in bottom-right corner.

Do not use generic dark mode styling, loud gradients, or heavy shadows. Keep it restrained, technical, and cohesive.
```

## Style Summary
- **Aesthetic:** light industrial control panel, monochrome with one functional accent.
- **Density:** compact and information-dense, no decorative labels/chrome.
- **Depth model:** subtle bevels and inset highlights on interactive controls.
- **Character:** technical but calm, not playful.

## Key Design Tokens
```css
:root {
  color-scheme: light;
  --bg-top: #ffffff;
  --bg-bottom: #f2f4f6;
  --bg-rim: #e9edf1;

  --panel: rgb(246 247 248 / 94%);
  --panel-border: #cfd5db;
  --panel-highlight: rgb(255 255 255 / 90%);
  --panel-shadow: rgb(0 0 0 / 12%);

  --text: #1f252b;
  --muted: #66707a;

  --btn-top: #fbfcfd;
  --btn-bottom: #e8ecf0;
  --btn-hover-top: #ffffff;
  --btn-hover-bottom: #edf1f4;
  --btn-active-top: #e5eaee;
  --btn-active-bottom: #dbe1e6;
  --btn-disabled: #d6dce2;

  --input-bg: #fdfdfe;
  --track: #afb7bf;
  --focus: #707a84;

  --mod-bar-off: #98a2ab;
  --mod-bar-on: #ff9a3a;

  --slider-row-width: 332px;
  --param-row-gap: 8px;
  --fn-btn-width: 40px;
  --control-radius: 7px;
}
```

## Typography
```css
html, body {
  font-family: "Aldrich", "Segoe UI", sans-serif;
}

.param-label,
.speed-btn,
.fps-indicator,
.tri-tooltip {
  font-family: "Fragment Mono", ui-monospace, monospace;
}
```

## Key CSS Patterns
### Background + Panels
```css
body {
  background: linear-gradient(180deg, var(--bg-top) 0%, var(--bg-bottom) 100%);
}

#stage {
  background:
    radial-gradient(130% 120% at 14% 10%, #ffffff 0%, #fbfcfd 45%, #f3f6f8 100%),
    linear-gradient(180deg, var(--bg-top) 0%, var(--bg-rim) 100%);
}

.hud,
.control-panel {
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: linear-gradient(180deg, rgb(251 252 253 / 96%) 0%, var(--panel) 100%);
  box-shadow:
    0 8px 24px var(--panel-shadow),
    0 2px 5px rgb(0 0 0 / 8%),
    inset 0 1px 0 var(--panel-highlight),
    inset 0 -1px 0 rgb(191 199 206 / 65%);
}
```

### Standard Button Treatment
```css
.controls button,
.hud-toggle,
.param-fn-btn {
  border: 1px solid var(--panel-border);
  border-radius: var(--control-radius);
  background: linear-gradient(180deg, var(--btn-top), var(--btn-bottom));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 88%),
    inset 0 -1px 0 rgb(186 193 200 / 90%),
    0 1px 3px rgb(0 0 0 / 12%);
  transition: background 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease;
}
```

### Modulator Button (5 Bars)
```css
.param-fn-btn {
  width: var(--fn-btn-width);
  height: 22px;
}

.param-fn-bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}

.param-fn-bar {
  width: 3px;
  height: 10px;
  border-radius: 1px;
  background: var(--mod-bar-off);
}

.param-fn-bar.is-lit {
  background: var(--mod-bar-on);
}
```

### Slider Handle Geometry
```css
/* Min/max behind and wider */
.tri-handle-min,
.tri-handle-max {
  z-index: 2;
  width: 10px;
  height: 22px;
}

/* Current in front, narrower, taller */
.tri-handle-current {
  z-index: 4;
  width: 8px;
  height: 22px;
}
```

### Tooltip Rules
```css
.tri-tooltip {
  background: rgb(247 249 251 / 96%);
  border: 1px solid #c6ced5;
  box-shadow: 0 4px 14px rgb(0 0 0 / 14%);
}

.tri-tooltip.has-swatch {
  padding-right: 24px;
  padding-bottom: 20px;
}

.tri-tooltip-swatch-row {
  position: absolute;
  right: 6px;
  bottom: 5px;
}
```

## Behavior Rules To Match
1. Non-modulated range params show only a current handle. Min/max are fixed limits.
2. Modulated range params show min/current/max and a 5-level bar modulator button.
3. Current handle always renders in front of min/max.
4. Min handle sits visually left, max handle visually right, when values coincide.
5. While dragging current, noise modulation pauses; resumes on release.
6. Tooltip color swatch appears only for hue, saturation, and lightness.

## Responsive Rules
```css
@media (max-width: 760px) {
  :root {
    --slider-row-width: 286px;
    --fn-btn-width: 38px;
    --param-row-gap: 7px;
  }

  .param-fn-btn { height: 22px; }
}
```
