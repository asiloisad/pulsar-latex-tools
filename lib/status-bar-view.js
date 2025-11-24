'use babel';

export default class StatusBarView {
  constructor(callbacks = {}) {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] Creating StatusBarView');
    }
    this.callbacks = callbacks;
    this.tooltip = null;
    this.timerInterval = null;
    this.buildStartTime = null;
    this.currentStatus = 'idle';
    this.compileOnSave = false;

    this.element = document.createElement('div');
    this.element.classList.add('latex-tools-status', 'inline-block');

    this.icon = document.createElement('span');
    this.icon.classList.add('icon');

    // Create loading spinner element
    this.spinner = document.createElement('span');
    this.spinner.classList.add('loading', 'loading-spinner-tiny', 'inline-block');
    this.spinner.style.display = 'none';

    // Create timer element
    this.timer = document.createElement('span');
    this.timer.classList.add('latex-tools-status-timer');

    // Create compile-on-save indicator
    this.compileOnSaveBadge = document.createElement('span');
    this.compileOnSaveBadge.classList.add('latex-tools-compile-on-save-badge');
    this.compileOnSaveBadge.textContent = 'A';
    this.compileOnSaveBadge.style.display = 'none';

    this.element.appendChild(this.spinner);
    this.element.appendChild(this.icon);
    this.element.appendChild(this.timer);
    this.element.appendChild(this.compileOnSaveBadge);

    // Add native Atom tooltip
    this.tooltip = atom.tooltips.add(this.element, {
      title: 'Left click: Compile | Middle click: Open PDF | Right click: Interrupt'
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
            this.callbacks.onOpenPdf();
          }
          break;
        case 2: // Right mouse button - interrupt
          if (this.callbacks.onInterrupt) {
            this.callbacks.onInterrupt();
          }
          break;
      }
    });

    // Prevent context menu on right click
    this.element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return false;
    });

    this.hide();
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] StatusBarView created');
    }
  }

  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  }

  startTimer() {
    this.stopTimer();
    this.buildStartTime = Date.now();
    this.timer.textContent = '0s';

    this.timerInterval = setInterval(() => {
      const elapsed = Date.now() - this.buildStartTime;
      this.timer.textContent = this.formatTime(elapsed);
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  getElapsedTime() {
    if (this.buildStartTime) {
      return Date.now() - this.buildStartTime;
    }
    return 0;
  }

  setStatus(status, message = '') {
    if (atom.config.get('latex-tools.debug')) {
      console.log(`[LaTeX Tools] setStatus: ${status}, message: ${message}`);
    }
    this.currentStatus = status;
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
        this.startTimer();
        break;

      case 'success':
        if (atom.config.get('latex-tools.debug')) {
          console.log('[LaTeX Tools] Setting status to success');
        }
        this.stopTimer();
        this.element.classList.add('status-success');
        this.spinner.style.display = 'none';
        this.icon.style.display = '';
        this.icon.classList.add('icon-check');
        // Keep timer visible showing final time
        break;

      case 'error':
        if (atom.config.get('latex-tools.debug')) {
          console.log('[LaTeX Tools] Setting status to error');
        }
        this.stopTimer();
        this.element.classList.add('status-error');
        this.spinner.style.display = 'none';
        this.icon.style.display = '';
        this.icon.classList.add('icon-x');
        // Keep timer visible showing final time
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
    this.currentStatus = 'idle';
    this.stopTimer();
    this.element.classList.remove('status-building', 'status-success', 'status-error');
    this.element.classList.add('status-idle');
    this.spinner.style.display = 'none';
    this.icon.style.display = '';
    this.icon.classList.remove('icon-check', 'icon-x', 'icon-sync');
    this.icon.classList.add('icon-file-pdf');
    this.timer.textContent = 'Idle';
    this.buildStartTime = null;
  }

  // Restore timer state when switching between files
  restoreTimer(startTime) {
    this.stopTimer();  // Clear any existing timer
    if (startTime) {
      this.buildStartTime = startTime;
      const elapsed = Date.now() - startTime;
      this.timer.textContent = this.formatTime(elapsed);

      // Start updating if still building
      this.timerInterval = setInterval(() => {
        const elapsed = Date.now() - this.buildStartTime;
        this.timer.textContent = this.formatTime(elapsed);
      }, 1000);
    }
  }

  // Show final elapsed time without running timer
  showElapsedTime(elapsedMs) {
    this.stopTimer();
    this.timer.textContent = this.formatTime(elapsedMs);
  }

  // Update compile-on-save indicator
  setCompileOnSave(enabled) {
    this.compileOnSave = enabled;
    if (enabled) {
      this.compileOnSaveBadge.style.display = '';
    } else {
      this.compileOnSaveBadge.style.display = 'none';
    }
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
    this.stopTimer();
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
