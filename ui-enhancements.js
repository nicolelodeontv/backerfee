const toastRoot = document.getElementById('toastRoot');
const copyStatus = document.getElementById('copyStatus');

function showToast(message, type = 'success') {
  if (!toastRoot) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  toastRoot.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('is-visible'));

  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 180);
  }, 2400);
}

function showUndoToast(message, actionLabel, onAction) {
  if (!toastRoot) return;

  const previous = toastRoot.querySelector('.toast-undo');
  previous?.remove();

  const toast = document.createElement('div');
  toast.className = 'toast toast-undo toast-success';
  toast.setAttribute('role', 'status');

  const messageNode = document.createElement('span');
  messageNode.className = 'toast-message';
  messageNode.textContent = message;

  const actionButton = document.createElement('button');
  actionButton.type = 'button';
  actionButton.className = 'toast-action';
  actionButton.textContent = actionLabel;

  let timer;
  const dismiss = () => {
    window.clearTimeout(timer);
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 180);
  };

  actionButton.addEventListener('click', () => {
    dismiss();
    onAction?.();
  });

  toast.append(messageNode, actionButton);
  toastRoot.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  timer = window.setTimeout(dismiss, 4500);
}

window.backerFeeShowToast = showToast;
window.backerFeeShowUndoToast = showUndoToast;

if (copyStatus) {
  const copyObserver = new MutationObserver(() => {
    const status = copyStatus.textContent || '';
    if (status.startsWith('Copied')) showToast('Customer note copied to clipboard.');
  });
  copyObserver.observe(copyStatus, { childList: true, characterData: true, subtree: true });
}

/* Vanilla sprite mascot: tracks pointer direction and reacts when clicked. */
(() => {
  const el = document.getElementById('mascot');
  if (!el) return;

  const DIRECTIONS = "url('mascots/afro-directions.webp')";
  const REACTIONS = "url('mascots/afro-reactions.webp')";
  const CENTER = [1, 1];
  const REACTION_CELL = [1, 1];
  // Verified against the supplied 3x3 sprite sheet: clockwise from right.
  const CELLS = [[2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [0, 0], [1, 0], [2, 0]];
  const DEAD_ZONE = 0.45;

  const pos = (c, r) => (c * 50) + '% ' + (r * 50) + '%';
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let poking = false;

  new Image().src = 'mascots/afro-reactions.webp';

  if (finePointer) {
    document.addEventListener('pointermove', (event) => {
      if (poking || el.closest('[hidden]') || !el.getClientRects().length) return;
      const rect = el.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      if (Math.hypot(dx, dy) < rect.width * DEAD_ZONE) {
        el.style.backgroundPosition = pos(...CENTER);
        return;
      }
      const slot = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
      el.style.backgroundPosition = pos(...CELLS[slot]);
    });
  }

  const react = () => {
    if (poking) return;
    poking = true;
    el.style.backgroundImage = REACTIONS;
    el.style.backgroundPosition = pos(...REACTION_CELL);
    if (!reduceMotion) el.classList.add('is-poked');
    window.setTimeout(() => {
      el.style.backgroundImage = DIRECTIONS;
      el.style.backgroundPosition = pos(...CENTER);
      el.classList.remove('is-poked');
      poking = false;
    }, 500);
  };

  el.addEventListener('click', react);
  el.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    react();
  });
})();
