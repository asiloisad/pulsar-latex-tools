'use babel';

export default class StatusBarView {
  constructor(onClick) {
    console.log('[LaTeX Tools] Creating StatusBarView');
    this.element = document.createElement('div');
    this.element.classList.add('latex-tools-status', 'inline-block');
    this.element.style.cursor = 'pointer';
    this.element.title = 'Click to toggle Linter panel';

    this.icon = document.createElement('span');
    this.icon.classList.add('icon');

    // Create loading spinner element
    this.spinner = document.createElement('span');
    this.spinner.classList.add('loading', 'loading-spinner-tiny', 'inline-block');
    this.spinner.style.display = 'none';

    this.text = document.createElement('span');
    this.text.classList.add('latex-tools-status-text');

    this.element.appendChild(this.spinner);
    this.element.appendChild(this.icon);
    this.element.appendChild(this.text);

    // Add click handler
    if (onClick) {
      this.element.addEventListener('click', () => {
        console.log('[LaTeX Tools] Status bar clicked');
        onClick();
      });
    }

    this.hide();
    console.log('[LaTeX Tools] StatusBarView created');
  }

  setStatus(status, message = '') {
    console.log(`[LaTeX Tools] setStatus: ${status}, message: ${message}`);
    this.show();

    // Clear previous classes
    this.element.classList.remove('status-idle', 'status-building', 'status-success', 'status-error');
    this.icon.classList.remove('icon-check', 'icon-x', 'icon-sync', 'icon-file-pdf');

    switch (status) {
      case 'building':
        console.log('[LaTeX Tools] Setting status to building');
        this.element.classList.add('status-building');
        this.spinner.style.display = '';
        this.icon.style.display = 'none';
        this.text.textContent = message || 'Compiling...';
        this.element.style.color = '';
        break;

      case 'success':
        console.log('[LaTeX Tools] Setting status to success');
        this.element.classList.add('status-success');
        this.spinner.style.display = 'none';
        this.icon.style.display = '';
        this.icon.classList.add('icon-check');
        this.text.textContent = message || 'Build succeeded';
        this.element.style.color = '#4CAF50';
        break;

      case 'error':
        console.log('[LaTeX Tools] Setting status to error');
        this.element.classList.add('status-error');
        this.spinner.style.display = 'none';
        this.icon.style.display = '';
        this.icon.classList.add('icon-x');
        this.text.textContent = message || 'Build failed';
        this.element.style.color = '#F44336';
        break;

      case 'idle':
      default:
        console.log('[LaTeX Tools] Setting status to idle');
        this.setIdle();
        break;
    }
  }

  setIdle() {
    console.log('[LaTeX Tools] setIdle called');
    this.element.classList.remove('status-building', 'status-success', 'status-error');
    this.element.classList.add('status-idle');
    this.spinner.style.display = 'none';
    this.icon.style.display = '';
    this.icon.classList.remove('icon-check', 'icon-x', 'icon-sync');
    this.icon.classList.add('icon-file-pdf');
    this.text.textContent = 'LaTeX';
    this.element.style.color = '';
  }

  show() {
    console.log('[LaTeX Tools] Showing status bar view');
    this.element.style.display = '';
  }

  hide() {
    console.log('[LaTeX Tools] Hiding status bar view');
    this.element.style.display = 'none';
  }

  destroy() {
    console.log('[LaTeX Tools] Destroying StatusBarView');
    this.element.remove();
  }

  getElement() {
    return this.element;
  }
}
