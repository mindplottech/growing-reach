/** The three-step guide: opened only from the header button. */
export function mountGuide({ dialog, openButton }) {
  openButton.addEventListener('click', () => dialog.showModal());
}
