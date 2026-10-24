/*
 * Backer Fee: "install the Minted bridge" popup.
 * Plain JavaScript, no framework needed. Load it once on the page:
 *   <script src="/bridge-install-popup.js" defer></script>
 *
 * The userscript sets document.documentElement.dataset.bfBridge on this site.
 * If that marker is missing shortly after load, the popup explains the two install steps.
 */
(function () {
  'use strict';

  var SCRIPT_URL = '/backer-fee-minted-bridge.user.js'; // served from the app's public folder
  var TAMPERMONKEY_URL = 'https://www.tampermonkey.net/';
  var CHECK_AFTER_MS = 2000;
  var STORAGE_KEY = 'bf-bridge-popup-dismissed';

  function installed() {
    return !!document.documentElement.dataset.bfBridge;
  }

  function dismissed() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
  }

  function remember() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { /* storage can be blocked */ }
  }

  var overlay = null;

  function close() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  function show() {
    if (overlay || installed() || dismissed()) return;

    overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Install the Minted bridge');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;' +
      'padding:16px;background:rgba(8,6,20,.7)';

    overlay.innerHTML =
      '<div style="max-width:440px;width:100%;padding:20px;border-radius:14px;background:#1c1830;color:#fff;' +
      'font:14px/1.5 system-ui,Arial,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.5)">' +
      '<h2 style="margin:0 0 6px;font-size:18px">Get Minted\'s tax automatically</h2>' +
      '<p style="margin:0 0 12px;opacity:.85">A small browser script reads the tax from Minted\'s own Calculate ' +
      'result and sends it here. It never clicks Credit or Charge. You install it once per browser.</p>' +
      '<ol style="margin:0 0 12px;padding-left:20px">' +
      '<li style="margin-bottom:8px"><a id="bfb-tm" href="' + TAMPERMONKEY_URL + '" target="_blank" rel="noopener" ' +
      'style="color:#c4b5fd">Install Tampermonkey</a> (skip if you already have it). In Chrome, you may also need to ' +
      'allow user scripts for the extension, in its details page.</li>' +
      '<li><a id="bfb-script" href="' + SCRIPT_URL + '" style="color:#c4b5fd">Install the Minted script</a>. ' +
      'Tampermonkey opens an install page, so click Install there.</li>' +
      '</ol>' +
      '<p style="margin:0 0 14px;font-size:12px;opacity:.7">After installing, reload this page. This popup goes away ' +
      'once the script is detected.</p>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button id="bfb-never" type="button" style="padding:7px 12px;border:1px solid #4b4570;border-radius:8px;' +
      'background:transparent;color:#fff;cursor:pointer">Don\'t show again</button>' +
      '<button id="bfb-later" type="button" style="padding:7px 12px;border:0;border-radius:8px;' +
      'background:#8b5cf6;color:#fff;font-weight:700;cursor:pointer">Not now</button>' +
      '</div></div>';

    document.body.appendChild(overlay);

    overlay.querySelector('#bfb-later').addEventListener('click', close);
    overlay.querySelector('#bfb-never').addEventListener('click', function () { remember(); close(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    });
  }

  // If the script reports in late, close the popup automatically.
  window.addEventListener('bf-bridge-ready', close);

  function start() {
    setTimeout(show, CHECK_AFTER_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
