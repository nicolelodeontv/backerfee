// ==UserScript==
// @name         Backer Fee Minted Bridge
// @namespace    https://backerfee.vercel.app/
// @version      0.2.0
// @description  Review Minted adjustment values and send them to Backer Fee.
// @match        https://minted.com/*
// @match        https://*.minted.com/*
// @match        https://backerfee.vercel.app/*
// @include      /^https:\/\/backerfee-[a-z0-9-]+\.vercel\.app\/.*$/
// @run-at       document-idle
// @grant        none
// @downloadURL  https://backerfee.vercel.app/backer-fee-minted-bridge.user.js
// @updateURL    https://backerfee.vercel.app/backer-fee-minted-bridge.user.js
// ==/UserScript==

(function () {
  'use strict';

  var BACKER_FEE_URL = 'https://backerfee.vercel.app/';
  var PANEL_ID = 'bf-minted-bridge-panel';
  var MONEY_RE = /^\d+(?:\.\d{1,2})?$/;

  function isBackerFeeHost(host) {
    return host === 'backerfee.vercel.app' ||
      (/^backerfee-[a-z0-9-]+\.vercel\.app$/i.test(host));
  }

  function markBridgeInstalled() {
    if (!document.documentElement) return;
    document.documentElement.setAttribute('data-bf-bridge', '0.2.0');
    document.dispatchEvent(new CustomEvent('bf-bridge-ready', {
      detail: { version: '0.2.0' }
    }));
  }

  if (isBackerFeeHost(window.location.hostname)) {
    markBridgeInstalled();
    return;
  }

  if (!(window.location.hostname === 'minted.com' ||
        window.location.hostname.endsWith('.minted.com'))) {
    return;
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    var rect = element.getBoundingClientRect();
    var style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 &&
      style.display !== 'none' && style.visibility !== 'hidden';
  }

  function textOf(element) {
    return (element && (element.innerText || element.textContent) || '')
      .replace(/\s+/g, ' ').trim();
  }

  function labelFor(input) {
    var parts = [];
    if (input.labels) {
      Array.prototype.forEach.call(input.labels, function (label) {
        parts.push(textOf(label));
      });
    }
    ['aria-label', 'placeholder', 'name', 'id', 'title'].forEach(function (key) {
      var value = input.getAttribute(key);
      if (value) parts.push(value);
    });

    var row = input.closest('tr, [role="row"], fieldset, .form-group, .form-row, .field, li');
    if (row) parts.push(textOf(row).slice(0, 180));

    var parent = input.parentElement;
    for (var i = 0; i < 2 && parent; i += 1, parent = parent.parentElement) {
      var parentText = textOf(parent);
      if (parentText && parentText.length < 180) parts.push(parentText);
    }
    return parts.join(' ').toLowerCase();
  }

  function cleanMoney(raw) {
    if (raw === null || raw === undefined) return '';
    var value = String(raw).trim().replace(/[$,\s]/g, '');
    if (!MONEY_RE.test(value)) return '';
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number.toFixed(2) : '';
  }

  function matchesKind(label, kind) {
    if (kind === 'amount') {
      return /\bamount\b/.test(label) &&
        !/\b(subtotal|total|tax|shipping|discount|fee|balance)\b/.test(label);
    }
    if (kind === 'tax') {
      return /\btax\b/.test(label) && !/\b(rate|percentage|percent)\b/.test(label);
    }
    if (kind === 'shipping') {
      return /\b(shipping|shipping adjustment|delivery|postage)\b/.test(label);
    }
    if (kind === 'subtotal') return /\bsubtotal\b/.test(label);
    if (kind === 'total') {
      return /\btotal\b/.test(label) && !/\b(subtotal|discount|tax rate)\b/.test(label);
    }
    return false;
  }

  function readField(kind) {
    var inputs = Array.prototype.slice.call(document.querySelectorAll(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select'
    )).filter(isVisible);

    var candidates = inputs.map(function (input) {
      return {
        input: input,
        label: labelFor(input),
        value: cleanMoney(input.value)
      };
    }).filter(function (item) {
      return item.value && matchesKind(item.label, kind);
    });

    candidates.sort(function (a, b) {
      var aLabel = (a.input.getAttribute('aria-label') || '') + ' ' +
        (a.input.getAttribute('placeholder') || '') + ' ' +
        (a.input.id || '') + ' ' + (a.input.name || '');
      var bLabel = (b.input.getAttribute('aria-label') || '') + ' ' +
        (b.input.getAttribute('placeholder') || '') + ' ' +
        (b.input.id || '') + ' ' + (b.input.name || '');
      var aExact = matchesKind(aLabel.toLowerCase(), kind) ? 1 : 0;
      var bExact = matchesKind(bLabel.toLowerCase(), kind) ? 1 : 0;
      return bExact - aExact;
    });

    return candidates.length ? candidates[0].value : '';
  }

  function scanPageValues() {
    return {
      amount: readField('amount'),
      tax: readField('tax'),
      shipping: readField('shipping'),
      subtotal: readField('subtotal'),
      total: readField('total')
    };
  }

  function isOrderAdjustmentsPage() {
    var urlText = (window.location.pathname + ' ' + window.location.search).toLowerCase();
    var pageText = textOf(document.body).slice(0, 30000).toLowerCase();
    var looksLikeAdjustments = /order[-\s]?adjustments?|financial adjustment/.test(urlText + ' ' + pageText);
    var hasCalculate = Array.prototype.some.call(document.querySelectorAll('button, input[type="button"], input[type="submit"]'),
      function (button) {
        return isVisible(button) && /\bcalculate\b/.test(textOf(button) || button.value || '');
      });
    return looksLikeAdjustments && (hasCalculate || /\btax\b/.test(pageText));
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'className') node.className = attrs[key];
      else if (key === 'type') node.type = attrs[key];
      else if (key === 'value') node.value = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function installPanel() {
    if (!document.body || document.getElementById(PANEL_ID) || !isOrderAdjustmentsPage()) return false;

    var styles = [
      '#bf-minted-bridge-panel{position:fixed;z-index:2147483646;right:18px;bottom:18px;width:min(360px,calc(100vw - 28px));padding:16px;background:#fff;color:#26212d;border:1px solid #d8cbe4;border-radius:14px;box-shadow:0 12px 38px rgba(28,18,40,.24);font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
      '#bf-minted-bridge-panel *{box-sizing:border-box}',
      '#bf-minted-bridge-panel h2{margin:0 0 5px;font-size:17px;line-height:1.25;color:#4b3262}',
      '#bf-minted-bridge-panel p{margin:6px 0 10px;font-size:12px;color:#62586b}',
      '#bf-minted-bridge-panel .bf-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}',
      '#bf-minted-bridge-panel label{display:block;margin:0;font-size:11px;font-weight:700;color:#4d4556}',
      '#bf-minted-bridge-panel input{display:block;width:100%;height:36px;margin-top:4px;padding:7px 9px;border:1px solid #cfc5d8;border-radius:7px;background:#fff;color:#1d1723;font:600 14px/1.2 system-ui,sans-serif}',
      '#bf-minted-bridge-panel .bf-status{min-height:34px;margin:9px 0 8px;padding:7px 8px;background:#f8f2fb;border-radius:7px;color:#4b3262;font-size:11px}',
      '#bf-minted-bridge-panel .bf-actions{display:flex;gap:7px;flex-wrap:wrap}',
      '#bf-minted-bridge-panel button{min-height:35px;padding:7px 10px;border:1px solid #80649a;border-radius:8px;background:#fff;color:#4b3262;font:700 12px system-ui,sans-serif;cursor:pointer}',
      '#bf-minted-bridge-panel button.bf-primary{background:#6a477f;color:#fff;border-color:#6a477f}',
      '#bf-minted-bridge-panel .bf-close{position:absolute;top:8px;right:8px;min-height:26px;padding:2px 8px;border:0;font-size:16px}',
      '@media(max-width:420px){#bf-minted-bridge-panel{right:10px;bottom:10px;width:calc(100vw - 20px)}}'
    ].join('\n');
    document.head.appendChild(el('style', { id: 'bf-minted-bridge-style' }, styles));

    var panel = el('section', { id: PANEL_ID, role: 'dialog', 'aria-label': 'Backer Fee Minted bridge' });
    var close = el('button', { type: 'button', className: 'bf-close', 'aria-label': 'Close bridge panel' }, '×');
    close.addEventListener('click', function () { panel.remove(); });
    panel.appendChild(close);
    panel.appendChild(el('h2', {}, 'Send values to Backer Fee'));
    panel.appendChild(el('p', {}, 'Click Calculate in Minted first. Check these values before opening Backer Fee; nothing is sent until you click the button below.'));

    var fields = {};
    var grid = el('div', { className: 'bf-grid' });
    [
      ['amount', 'Amount'],
      ['tax', 'Tax from Minted'],
      ['shipping', 'Shipping Adjustment'],
      ['subtotal', 'Minted Subtotal (optional)'],
      ['total', 'Minted Total (optional)']
    ].forEach(function (pair) {
      var key = pair[0];
      var label = el('label', {}, pair[1]);
      var input = el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': pair[1] });
      input.value = '';
      fields[key] = input;
      label.appendChild(input);
      grid.appendChild(label);
    });
    panel.appendChild(grid);

    var status = el('div', { className: 'bf-status', role: 'status', 'aria-live': 'polite' },
      'Values are best-effort matches. Confirm each amount against Minted before proceeding.');
    panel.appendChild(status);

    var actions = el('div', { className: 'bf-actions' });
    var refresh = el('button', { type: 'button' }, 'Read values again');
    refresh.addEventListener('click', function () {
      var scanned = scanPageValues();
      Object.keys(fields).forEach(function (key) {
        if (scanned[key] !== '') fields[key].value = scanned[key];
      });
      status.textContent = 'Page values refreshed. Review Amount and Tax; enter them manually if detection missed a field.';
    });

    var open = el('button', { type: 'button', className: 'bf-primary' }, 'Open Backer Fee');
    open.addEventListener('click', function () {
      var amount = cleanMoney(fields.amount.value);
      var tax = cleanMoney(fields.tax.value);
      var shipping = cleanMoney(fields.shipping.value || '0');
      var subtotal = cleanMoney(fields.subtotal.value);
      var total = cleanMoney(fields.total.value);

      if (!amount || !tax || !shipping) {
        status.textContent = 'Enter a valid Amount and Tax from Minted. Shipping can be 0.00.';
        return;
      }

      var target = new URL(BACKER_FEE_URL);
      target.searchParams.set('minted_bridge', '1');
      target.searchParams.set('minted_amount', amount);
      target.searchParams.set('minted_tax', tax);
      target.searchParams.set('minted_shipping', shipping);
      if (subtotal) target.searchParams.set('minted_subtotal', subtotal);
      if (total) target.searchParams.set('minted_total', total);

      window.open(target.href, '_blank', 'noopener,noreferrer');
      status.textContent = 'Backer Fee opened in a new tab. Compare the Subtotal and Total Adjustment with Minted.';
    });
    actions.appendChild(refresh);
    actions.appendChild(open);
    panel.appendChild(actions);
    document.body.appendChild(panel);

    var initial = scanPageValues();
    Object.keys(fields).forEach(function (key) {
      fields[key].value = initial[key] || (key === 'shipping' ? '0.00' : '');
    });
    return true;
  }

  var attempts = 0;
  function tryInstall() {
    if (installPanel()) return;
    attempts += 1;
    if (attempts < 20) window.setTimeout(tryInstall, 750);
  }
  tryInstall();
})();
