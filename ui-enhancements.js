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

