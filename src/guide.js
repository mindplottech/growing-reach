const HIDE_KEY = 'growing-reach.guide.hidden';

function storedHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

/** The three-step guide: shown on first visit unless the user asked not to see it again. */
export function mountGuide({ dialog, openButton }) {
  const checkbox = dialog.querySelector('#guide-hide');
  dialog.addEventListener('close', () => {
    try {
      if (checkbox.checked) localStorage.setItem(HIDE_KEY, '1');
      else localStorage.removeItem(HIDE_KEY);
    } catch {
      // Private browsing can refuse storage; the guide then simply shows again next time.
    }
  });
  openButton.addEventListener('click', () => {
    checkbox.checked = storedHidden();
    dialog.showModal();
  });
  if (!storedHidden()) dialog.showModal();
}
