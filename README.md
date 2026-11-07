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
- Reset with an Undo snackbar
- Reset and Escape-key support
- Exact-format clipboard copying
- Minted Financial Adjustment card with an editable Amount, editable tax rate (default 7.75% estimate) rounded to cents, Subtotal, and Total Adjustment
- Include Tax locked on; tax, subtotal, and total recalculate live as Amount or Shipping Adjustment changes
- Locally persisted Shipping Adjustment and copyable Minted Amount and Total Adjustment
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
- Amount normally follows the Final Backer Fee, but can be edited directly
- Tax = Amount × Tax rate (editable, default 7.75% estimate), rounded to the nearest cent
- Subtotal = Amount + Tax
- Total Adjustment = Subtotal + Shipping Adjustment

## Test

```bash
npm test
```

## Deploy

This is a static site deployed on Vercel from the repository root. No build step, server, or database is required. `vercel.json` sets the security headers (including a Content Security Policy) and long-lived caching for the self-hosted fonts.

## Offline and install

The app is an installable web app. A small service worker (`sw.js`) caches the app files so the calculator opens offline. It loads from the network first, so a new deploy is picked up right away; bump `CACHE` in `sw.js` when you add or rename files in its `SHELL` list. Poppins is self-hosted in `fonts/` (Latin subset, SIL Open Font License).
