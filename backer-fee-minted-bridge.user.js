// ==UserScript==
// @name         Backer Fee ↔ Minted bridge
// @namespace    backerfee
// @version      0.2.0
// @description  Reads Minted's own Calculate result (tax, subtotal, total) and sends it to Backer Fee. Never clicks Credit or Charge.
// @match        https://*.minted.com/*
// @match        https://backerfee.vercel.app/*
// @match        https://backerfee-git-*.vercel.app/*
// @downloadURL  https://backerfee.vercel.app/backer-fee-minted-bridge.user.js
// @updateURL    https://backerfee.vercel.app/backer-fee-minted-bridge.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---- Settings ----------------------------------------------------------
  const BACKER_FEE_URL = 'https://backerfee.vercel.app/'; // use the Preview URL while testing #43
  const AUTO_CALCULATE = true;   // click Minted's own Calculate button after the Amount changes
  const AUTO_DELAY_MS = 700;     // wait after typing stops
  // ------------------------------------------------------------------------

  const VERSION = '0.2.0';

  // On the Backer Fee site, only leave a marker so the site knows the script is installed.
  if (/(^|\.)backerfee(-git-[^.]*)?\.vercel\.app$/.test(location.hostname)) {
    document.documentElement.dataset.bfBridge = VERSION;
    window.dispatchEvent(new CustomEvent('bf-bridge-ready', { detail: VERSION }));
    return;
  }

  const $id = (id) => document.getElementById(id);
  const calcBtn = $id('buttonCalculate');
  if (!calcBtn || !$id('inputAmount') || !$id('inputTax')) return; // not the Financial Adjustment page

  const num = (v) => {
    const n = parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const cents = (n) => Math.round(n * 100);

  function read() {
    return {
      amount: $id('inputAmount').value.trim(),
      tax: $id('inputTax').value.trim(),
      subtotal: $id('inputSubTotal').value.trim(),
      shipping: ($id('inputShippingAdjustment').value.trim() || '0'),
      total: $id('inputTotalAdjustment').value.trim(),
      includeTax: !!($id('useTax') && $id('useTax').checked),
    };
  }

  // The result is only trustworthy if Minted's own fields agree with each other.
  function status(v) {
    const a = num(v.amount), t = num(v.tax), s = num(v.subtotal), sh = num(v.shipping), tot = num(v.total);
    if (a === null) return { ok: false, msg: 'Enter an Amount.' };
    if (t === null || s === null || tot === null) return { ok: false, msg: 'Click Calculate.' };
    if (cents(a) + cents(t) !== cents(s) || cents(s) + cents(sh ?? 0) !== cents(tot)) {
      return { ok: false, msg: 'Stale: Amount or Shipping changed since Calculate.' };
    }
    return { ok: true, msg: 'Matches Minted\'s Calculate result.' };
  }

  // ---- Panel -------------------------------------------------------------
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:99999;width:250px;padding:12px;' +
    'background:#1c1830;color:#fff;border-radius:10px;font:13px/1.4 Arial,sans-serif;' +
    'box-shadow:0 6px 24px rgba(0,0,0,.35)';
  panel.innerHTML =
    '<div style="font-weight:700;margin-bottom:6px">Backer Fee bridge</div>' +
    '<div id="bfb-rows"></div>' +
    '<div id="bfb-status" style="margin:6px 0;font-size:12px"></div>' +
    '<button id="bfb-send" type="button" style="width:100%;padding:6px;border:0;border-radius:6px;' +
    'background:#8b5cf6;color:#fff;font-weight:700;cursor:pointer">Send to Backer Fee</button>';
  document.body.appendChild(panel);

  const rows = panel.querySelector('#bfb-rows');
  const statusEl = panel.querySelector('#bfb-status');
  const sendBtn = panel.querySelector('#bfb-send');

  function render() {
    const v = read();
    const st = status(v);
    rows.innerHTML = [
      ['Amount', v.amount], ['Tax', v.tax], ['Subtotal', v.subtotal],
      ['Shipping', v.shipping], ['Total', v.total],
    ].map(([k, val]) =>
      '<div style="display:flex;justify-content:space-between"><span>' + k + '</span><b>' + (val || '—') + '</b></div>'
    ).join('');
    statusEl.textContent = st.msg;
    statusEl.style.color = st.ok ? '#86efac' : '#fcd34d';
    sendBtn.disabled = !st.ok;
    sendBtn.style.opacity = st.ok ? '1' : '.5';
    sendBtn.style.cursor = st.ok ? 'pointer' : 'not-allowed';
  }

  sendBtn.addEventListener('click', () => {
    const v = read();
    if (!status(v).ok) return;
    const q = new URLSearchParams({
      minted_amount: v.amount,
      minted_tax: v.tax,
      minted_shipping: v.shipping,
      minted_total: v.total,
    });
    window.open(BACKER_FEE_URL + '?' + q.toString(), '_blank');
  });

  // ---- Auto-calculate (uses Minted's own button; never touches the API directly) ----
  if (AUTO_CALCULATE) {
    let timer = null;
    $id('inputAmount').addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (num($id('inputAmount').value) !== null) calcBtn.click();
      }, AUTO_DELAY_MS);
    });
  }

  setInterval(render, 400);
  render();
})();
