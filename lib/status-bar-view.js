'use babel';

export default class StatusBarView {
  constructor(callbacks = {}) {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] Creating StatusBarView');
    }
    this.callbacks = callbacks;
    this.tooltip = null;

    this.element = document.createElement('div');
    this.element.classList.add('latex-tools-status', 'inline-block');
    this.element.style.cursor = 'pointer';

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

    // Add native Atom tooltip
    this.tooltip = atom.tooltips.add(this.element, {
      title: 'Left click: Compile | Middle click: Interrupt'
    });

    // Add mousedown handler for all mouse buttons
    this.element.addEventListener('mousedown', (event) => {
      if (atom.config.get('latex-tools.debug')) {
        console.log('[LaTeX Tools] Status bar mousedown, button:', event.button);
      }

      switch (event.button) {
        case 0: // Left mouse button - compile
          if (this.callbacks.onCompile) {
            this.callbacks.onCompile();
          }
          break;
        case 1: // Middle mouse button - open PDF
          event.preventDefault(); // Prevent default middle-click behavior
          if (this.callbacks.onOpenPdf) {
            this.callbacks.onInterrupt();
          }
          break;
      }
    });

    // Prevent context menu on right click
    this.element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    this.hide();
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] StatusBarView created');
    }
  }

  setStatus(status, message = '') {
    if (atom.config.get('latex-tools.debug')) {
      console.log(`[LaTeX Tools] setStatus: ${status}, message: ${message}`);
    }
    this.show();

    // Clear previous classes
    this.element.classList.remove('status-idle', 'status-building', 'status-success', 'status-error');
    this.icon.classList.remove('icon-check', 'icon-x', 'icon-sync', 'icon-file-pdf');

    switch (status) {
      case 'building':
        if (atom.config.get('latex-tools.debug')) {
          console.log('[LaTeX Tools] Setting status to building');
        }
        this.element.classList.add('status-building');
        this.spinner.style.display = '';
        this.icon.style.display = 'none';
        this.text.textContent = message || 'Compiling...';
        this.element.style.color = '';
        break;

      case 'success':
        if (atom.config.get('latex-tools.debug')) {
          console.log('[LaTeX Tools] Setting status to success');
        }
        this.element.classList.add('status-success');
        this.spinner.style.display = 'none';
        this.icon.style.display = '';
        this.icon.classList.add('icon-check');
        this.text.textContent = message || 'Build succeeded';
        this.element.style.color = '#4CAF50';
        break;

      case 'error':
        if (atom.config.get('latex-tools.debug')) {
          console.log('[LaTeX Tools] Setting status to error');
        }
        this.element.classList.add('status-error');
        this.spinner.style.display = 'none';
        this.icon.style.display = '';
        this.icon.classList.add('icon-x');
        this.text.textContent = message || 'Build failed';
        this.element.style.color = '#F44336';
        break;

      case 'idle':
      default:
        if (atom.config.get('latex-tools.debug')) {
          console.log('[LaTeX Tools] Setting status to idle');
        }
        this.setIdle();
        break;
    }
  }

  setIdle() {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] setIdle called');
    }
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
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] Showing status bar view');
    }
    this.element.style.display = '';
  }

  hide() {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] Hiding status bar view');
    }
    this.element.style.display = 'none';
  }

  destroy() {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] Destroying StatusBarView');
    }
    if (this.tooltip) {
      this.tooltip.dispose();
      this.tooltip = null;
    }
    this.element.remove();
  }

  getElement() {
    return this.element;
  }
}
