(function () {
  'use strict';

  var DISMISS_KEY = 'backerfee-bridge-install-dismissed-v1';
  var POPUP_ID = 'bf-bridge-install-popup';
  var INSTALL_SCRIPT_URL = '/backer-fee-minted-bridge.user.js';
  var TAMPERMONKEY_URL = 'https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo';

  function isBackerFeeHost(host) {
    return host === 'backerfee.vercel.app' ||
      /^backerfee-[a-z0-9-]+\.vercel\.app$/i.test(host);
  }

  if (!isBackerFeeHost(window.location.hostname)) return;

  function markerPresent() {
    return document.documentElement?.getAttribute('data-bf-bridge') === '0.2.0' ||
      document.documentElement?.hasAttribute('data-bf-bridge');
  }

  function closePopup() {
    var existing = document.getElementById(POPUP_ID);
    if (existing) existing.remove();
    if (observer) observer.disconnect();
  }

  var observer = null;

  function showPopup() {
    if (!document.body || markerPresent() || document.getElementById(POPUP_ID)) return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch (_) {}

    var style = document.createElement('style');
    style.id = POPUP_ID + '-style';
    style.textContent = [
      '#' + POPUP_ID + '{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:18px;background:rgba(24,18,30,.55);font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#292230}',
      '#' + POPUP_ID + ' *{box-sizing:border-box}',
      '#' + POPUP_ID + ' .bf-bridge-card{position:relative;width:min(540px,100%);max-height:min(88vh,760px);overflow:auto;padding:26px;background:#fff;border:1px solid #e4d9eb;border-radius:18px;box-shadow:0 22px 80px rgba(0,0,0,.28)}',
      '#' + POPUP_ID + ' h2{margin:0 34px 8px 0;font-size:23px;line-height:1.2;color:#4f3468}',
      '#' + POPUP_ID + ' .bf-intro{margin:0 0 18px;color:#62586b}',
      '#' + POPUP_ID + ' .bf-step{display:grid;grid-template-columns:32px 1fr;gap:12px;margin:14px 0;padding:14px;border:1px solid #e6dceb;border-radius:12px;background:#fcf9fe}',
      '#' + POPUP_ID + ' .bf-number{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#6b477e;color:#fff;font-weight:800}',
      '#' + POPUP_ID + ' h3{margin:0 0 5px;font-size:15px;color:#302739}',
      '#' + POPUP_ID + ' p{margin:0 0 8px;color:#5d5565;font-size:13px}',
      '#' + POPUP_ID + ' a{color:#684384;font-weight:700;text-decoration:underline;text-underline-offset:2px}',
      '#' + POPUP_ID + ' .bf-setting{margin-top:8px;padding:9px 10px;background:#f7f0fb;border-left:3px solid #9674ac;border-radius:4px;font-size:12px;color:#4d4158}',
      '#' + POPUP_ID + ' .bf-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:20px}',
      '#' + POPUP_ID + ' button{min-height:39px;padding:9px 13px;border:1px solid #d3c7db;border-radius:9px;background:#fff;color:#51425d;font:700 12px system-ui,sans-serif;cursor:pointer}',
      '#' + POPUP_ID + ' button.bf-primary{background:#6a477f;border-color:#6a477f;color:#fff}',
      '#' + POPUP_ID + ' button:focus-visible,#' + POPUP_ID + ' a:focus-visible{outline:3px solid #b99ad1;outline-offset:3px}',
      '#' + POPUP_ID + ' .bf-close{position:absolute;top:12px;right:12px;min-height:30px;padding:3px 9px;font-size:19px}',
      '@media(max-width:480px){#' + POPUP_ID + ' .bf-bridge-card{padding:20px}#' + POPUP_ID + ' h2{font-size:20px}}'
    ].join('\n');
    document.head.appendChild(style);

    var backdrop = document.createElement('div');
    backdrop.id = POPUP_ID;
    backdrop.setAttribute('role', 'presentation');

    var card = document.createElement('section');
    card.className = 'bf-bridge-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'bf-bridge-title');
    card.setAttribute('aria-describedby', 'bf-bridge-intro');

    var close = document.createElement('button');
    close.className = 'bf-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close setup guide');
    close.textContent = '×';
    close.addEventListener('click', closePopup);
    card.appendChild(close);

    var title = document.createElement('h2');
    title.id = 'bf-bridge-title';
    title.textContent = 'Connect Backer Fee to Minted';
    card.appendChild(title);

    var intro = document.createElement('p');
    intro.className = 'bf-intro';
    intro.id = 'bf-bridge-intro';
    intro.textContent = 'The Minted bridge can transfer Amount, Tax, and Shipping Adjustment into Backer Fee after you review them. It does not send order information until you click Open Backer Fee on Minted.';
    card.appendChild(intro);

    var step1 = document.createElement('div');
    step1.className = 'bf-step';
    var number1 = document.createElement('div');
    number1.className = 'bf-number';
    number1.textContent = '1';
    step1.appendChild(number1);
    var body1 = document.createElement('div');
    var heading1 = document.createElement('h3');
    heading1.textContent = 'Install Tampermonkey';
    body1.appendChild(heading1);
    var text1 = document.createElement('p');
    text1.textContent = 'Install the browser extension, then return to this page.';
    body1.appendChild(text1);
    var link1 = document.createElement('a');
    link1.href = TAMPERMONKEY_URL;
    link1.target = '_blank';
    link1.rel = 'noopener noreferrer';
    link1.textContent = 'Install Tampermonkey for Chrome';
    body1.appendChild(link1);
    var setting = document.createElement('div');
    setting.className = 'bf-setting';
    setting.textContent = 'Chrome 138+: open chrome://extensions, select Details on Tampermonkey, and enable “Allow user scripts”. On older Chrome versions, Developer mode may be required. Reload Backer Fee after changing this setting.';
    body1.appendChild(setting);
    step1.appendChild(body1);
    card.appendChild(step1);

    var step2 = document.createElement('div');
    step2.className = 'bf-step';
    var number2 = document.createElement('div');
    number2.className = 'bf-number';
    number2.textContent = '2';
    step2.appendChild(number2);
    var body2 = document.createElement('div');
    var heading2 = document.createElement('h3');
    heading2.textContent = 'Install the Minted bridge script';
    body2.appendChild(heading2);
    var text2 = document.createElement('p');
    text2.textContent = 'Open the hosted userscript and approve its installation in Tampermonkey.';
    body2.appendChild(text2);
    var link2 = document.createElement('a');
    link2.href = INSTALL_SCRIPT_URL;
    link2.target = '_blank';
    link2.rel = 'noopener noreferrer';
    link2.textContent = 'Install Backer Fee Minted Bridge (v0.2.0)';
    body2.appendChild(link2);
    step2.appendChild(body2);
    card.appendChild(step2);

    var actions = document.createElement('div');
    actions.className = 'bf-actions';
    var notNow = document.createElement('button');
    notNow.type = 'button';
    notNow.textContent = 'Not now';
    notNow.addEventListener('click', closePopup);
    var never = document.createElement('button');
    never.type = 'button';
    never.textContent = "Don't show again";
    never.addEventListener('click', function () {
      try {
        window.localStorage.setItem(DISMISS_KEY, '1');
      } catch (_) {}
      closePopup();
    });
    var done = document.createElement('button');
    done.type = 'button';
    done.className = 'bf-primary';
    done.textContent = 'I installed it';
    done.addEventListener('click', function () {
      if (markerPresent()) closePopup();
      else {
        done.textContent = 'Waiting for bridge…';
        window.setTimeout(function () {
          if (markerPresent()) closePopup();
          else {
            done.textContent = 'I installed it';
          }
        }, 1200);
      }
    });
    actions.appendChild(notNow);
    actions.appendChild(never);
    actions.appendChild(done);
    card.appendChild(actions);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    notNow.focus();
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) closePopup();
    });

    observer = new MutationObserver(function () {
      if (markerPresent()) closePopup();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bf-bridge'] });
    document.addEventListener('bf-bridge-ready', closePopup, { once: true });
  }

  window.setTimeout(showPopup, 2000);
})();
