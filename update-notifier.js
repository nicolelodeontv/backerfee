/*
 * Update notifier: tells people with the page already open that a newer
 * version has been deployed and offers a "Reload" button.
 *
 * No build step needed. It fingerprints the app's own files (ETag, then
 * Last-Modified, then a hash of the body) and compares against the
 * fingerprint taken when the page first loaded. It never reloads on its own,
 * so nobody loses what they are typing.
 */
(() => {
  // Bump these when you ship a change people should hear about.
  const APP_VERSION = '1.2.0';
  const APP_UPDATED = 'Oct 26, 2026';
  const WHATS_NEW = 'Update banner and a Check for updates button were added.';
  const SEEN_KEY = 'backerfee-seen-version';

  const FILES = [
    './',
    'script.js',
    'ui-enhancements.js',
    'calculator-utils.js',
    'style.css',
    'update-notifier.js',
  ];
  const CHECK_EVERY_MS = 5 * 60 * 1000;
  const MIN_GAP_MS = 30 * 1000;

  let baseline = null;
  let lastCheck = 0;
  let shown = false;

  const hash = (text) => {
    let h = 5381;
    for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };

  async function fingerprintOf(file) {
    const response = await fetch(file, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${file}`);
    const tag = response.headers.get('etag') || response.headers.get('last-modified');
    if (tag) return tag;
    return hash(await response.text());
  }

  async function fingerprint() {
    const parts = await Promise.all(FILES.map(fingerprintOf));
    return parts.join('|');
  }

  function showBanner() {
    if (shown) return;
    shown = true;

    const banner = document.createElement('div');
    banner.className = 'update-banner';
    banner.setAttribute('role', 'status');

    const message = document.createElement('span');
    message.className = 'update-banner-message';
    message.textContent = 'A new version is available.';

    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'copy-btn compact';
    reload.textContent = 'Reload';
    reload.addEventListener('click', () => window.location.reload());

    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'secondary-btn compact';
    later.textContent = 'Later';
    later.addEventListener('click', () => {
      banner.classList.remove('is-visible');
      window.setTimeout(() => banner.remove(), 180);
    });

    banner.append(message, reload, later);
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('is-visible'));
  }

  async function check() {
    if (shown || baseline === null) return;
    const now = Date.now();
    if (now - lastCheck < MIN_GAP_MS) return;
    lastCheck = now;
    try {
      const current = await fingerprint();
      if (current !== baseline) showBanner();
    } catch {
      /* Offline or a transient error: try again on the next check. */
    }
  }

  async function manualCheck(button) {
    if (shown) {
      document.querySelector('.update-banner button')?.focus();
      return;
    }
    const labelNode = button.querySelector('.update-check-label');
    const label = labelNode ? labelNode.textContent : button.textContent;
    const setLabel = (text) => { (labelNode || button).textContent = text; };
    button.disabled = true;
    setLabel('Checking…');
    try {
      const current = await fingerprint();
      if (baseline === null) baseline = current;
      if (current !== baseline) {
        showBanner();
      } else {
        window.backerFeeShowToast?.('You are on the latest version.');
      }
    } catch {
      window.backerFeeShowToast?.('Could not check for updates. Try again later.', 'error');
    } finally {
      button.disabled = false;
      setLabel(label);
    }
  }

  document.getElementById('checkUpdateBtn')?.addEventListener('click', (event) => {
    manualCheck(event.currentTarget);
  });

  function showVersion() {
    const node = document.getElementById('appVersion');
    if (node) node.textContent = `· v${APP_VERSION} · updated ${APP_UPDATED}`;
  }

  function announceWhatsNew() {
    try {
      const seen = localStorage.getItem(SEEN_KEY);
      localStorage.setItem(SEEN_KEY, APP_VERSION);
      // First visit only records the version; later visits announce changes.
      if (seen && seen !== APP_VERSION) {
        window.backerFeeShowToast?.(`Updated to v${APP_VERSION}: ${WHATS_NEW}`);
      }
    } catch {
      /* Storage unavailable: skip the announcement. */
    }
  }

  showVersion();
  announceWhatsNew();

  async function start() {
    try {
      baseline = await fingerprint();
      lastCheck = Date.now();
    } catch {
      return;
    }
    window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    window.addEventListener('online', check);
  }

  start();
})();
