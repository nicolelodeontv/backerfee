# Backer Fee Assistant

A responsive, browser-only calculator for discounted backer fees and customer-ready notes.

## Features

- Live fee calculation while typing — no Calculate button required
- Automatic customer-note generation from the current calculation
- US dollar formatting
- Discount presets (10%, 15%, 20%, 25%, 30%)
- Input validation with accessible error states
- Reset with Escape-key support
- Editable generated customer note
- Exact-format clipboard copying
- Light/dark theme with saved preference
- Recent calculation history with reuse/delete controls
- Clear-history confirmation
- Local persistence using `localStorage`
- Reduced-motion support
- Safe DOM-based history rendering
- Pure calculation utilities with automated Node tests

## Formula

- Discount Amount = Original Price × (Discount ÷ 100)
- Final Backer Fee = Original Price − Discount Amount

## Test

```bash
npm test
```

## Deploy

This is a static website and can be deployed directly to Netlify, Vercel, GitHub Pages, or another static host. No server or database is required.
