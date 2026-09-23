# Backer Fee Assistant

A responsive, browser-only calculator for discounted backer fees and customer-ready notes.

## Features

- Live fee calculation while typing — no Calculate button required in Single mode
- Automatic customer-note generation from the current calculation
- Read-only generated customer note that updates with the live calculation
- US dollar formatting
- Discount presets (10%, 15%, 20%, 25%, 30%) plus one saved custom preset
- Input validation with accessible error states and 0–100% discount clamping
- Single/Batch workflow with dynamic batch rows and simultaneous calculation
- Copy All Notes using the same existing customer-note format
- Recent calculation history with up to 20 persistent entries
- Click-to-reuse and per-entry delete controls in the Recent panel
- CSV export of the full calculation history
- Clear-history confirmation
- Reset with an Undo snackbar
- Reset and Escape-key support
- Exact-format clipboard copying
- Live fee split breakdown with proportional discount/final-fee segments
- Animated result count-up with reduced-motion fallback
- Active preset state with `aria-pressed`
- Copy success feedback
- Light/dark theme with saved preference and animated icon
- Friendlier empty states
- Local persistence using `localStorage`
- Runs locally in the browser; no server or database is required
- Reduced-motion support
- Safe DOM-based history rendering
- Pure calculation utilities with automated Node tests and script syntax checks

## Formula

- Discount Amount = Original Price × (Discount ÷ 100)
- Final Backer Fee = Original Price − Discount Amount

## Test

```bash
npm test
```

## Deploy

This is a static website and can be deployed directly to Netlify, Vercel, GitHub Pages, or another static host. No server or database is required.

The project supports both Netlify and Vercel deployments using their respective config files: `netlify.toml` for Netlify and `vercel.json` for Vercel. Neither deployment requires a build step; the site is served directly from the repository root.
