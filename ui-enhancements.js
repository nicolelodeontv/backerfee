const toastRoot = document.getElementById('toastRoot');

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

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;

  if (button.id === 'copyBtn') {
    window.setTimeout(() => {
      const status = document.getElementById('copyStatus')?.textContent || '';
      if (status.startsWith('Copied')) showToast('Customer note copied to clipboard.');
    }, 50);
    return;
  }

  if (button.id === 'confirmActionBtn') {
    const action = button.textContent.trim().toLowerCase();
    if (action === 'reset') {
      window.setTimeout(() => showToast('Calculator reset.'), 30);
    } else if (action === 'clear history') {
      window.setTimeout(() => showToast('Calculation history cleared.'), 30);
    }
    return;
  }

  if (button.dataset.action === 'reuse') {
    window.setTimeout(() => showToast('Calculation reused.'), 30);
  } else if (button.dataset.action === 'delete') {
    window.setTimeout(() => showToast('Calculation removed from history.'), 30);
  }
});

window.addEventListener('error', (event) => {
  if (event.error) console.error(event.error);
});
