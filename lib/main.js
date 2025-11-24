'use babel';

import { CompositeDisposable, BufferedProcess, Disposable } from 'atom';
import path from 'path';
import StatusBarView from './status-bar-view';

export default {
  subscriptions: null,
  statusBarView: null,
  statusBarTile: null,
  openExternalService: null,

  activate(state) {
    this.subscriptions = new CompositeDisposable();
    this.statusBarView = new StatusBarView();

    // Register commands
    this.subscriptions.add(
      atom.commands.add('atom-text-editor[data-grammar~="latex"]', {
        'latex-tools:compile': () => this.compile(),
        'latex-tools:open-pdf': () => this.openPdf(),
        'latex-tools:open-pdf-external': () => this.openPdfExternal(),
      })
    );
  },

  deactivate() {
    this.subscriptions.dispose();
    if (this.statusBarTile) {
      this.statusBarTile.destroy();
    }
    if (this.statusBarView) {
      this.statusBarView.destroy();
    }
  },

  serialize() {
    return {};
  },

  consumeStatusBar(statusBar) {
    this.statusBarTile = statusBar.addLeftTile({
      item: this.statusBarView.getElement(),
      priority: 100
    });
  },

  consumeOpenExternal(service) {
    this.openExternalService = service;
    return new Disposable(() => {
      this.openExternalService = null;
    });
  },

  openPdf() {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      atom.notifications.addWarning('No active editor');
      return;
    }

    const filePath = editor.getPath();
    if (!filePath) {
      atom.notifications.addWarning('File not saved');
      return;
    }

    if (!filePath.endsWith('.tex')) {
      atom.notifications.addWarning('Not a LaTeX file');
      return;
    }

    // Construct PDF path by replacing .tex with .pdf
    const pdfPath = filePath.replace(/\.tex$/, '.pdf');

    // Check if PDF exists
    const fs = require('fs');
    if (!fs.existsSync(pdfPath)) {
      atom.notifications.addWarning('PDF file not found', {
        detail: `Expected file: ${pdfPath}\n\nPlease compile the LaTeX file first.`,
        dismissable: true
      });
      return;
    }

    // Open the PDF file
    atom.workspace.open(pdfPath).then(() => {
      atom.notifications.addInfo(`Opened ${path.basename(pdfPath)}`);
    }).catch((error) => {
      atom.notifications.addError('Failed to open PDF', {
        detail: error.message,
        dismissable: true
      });
    });
  },

  openPdfExternal() {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      atom.notifications.addWarning('No active editor');
      return;
    }

    const filePath = editor.getPath();
    if (!filePath) {
      atom.notifications.addWarning('File not saved');
      return;
    }

    if (!filePath.endsWith('.tex')) {
      atom.notifications.addWarning('Not a LaTeX file');
      return;
    }

    // Construct PDF path by replacing .tex with .pdf
    const pdfPath = filePath.replace(/\.tex$/, '.pdf');

    // Check if PDF exists
    const fs = require('fs');
    if (!fs.existsSync(pdfPath)) {
      atom.notifications.addWarning('PDF file not found', {
        detail: `Expected file: ${pdfPath}\n\nPlease compile the LaTeX file first.`,
        dismissable: true
      });
      return;
    }

    // Open the PDF file externally
    if (!this.openExternalService) {
      atom.notifications.addWarning('open-external service not available', {
        detail: 'Please install the open-external package',
        dismissable: true
      });
      return;
    }

    this.openExternalService.openExternal(pdfPath)
      .then(() => {
        atom.notifications.addInfo(`Opened ${path.basename(pdfPath)} externally`);
      })
      .catch((error) => {
        atom.notifications.addError('Failed to open PDF externally', {
          detail: error ? error.message || error : 'Unknown error',
          dismissable: true
        });
      });
  },

  compile() {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      atom.notifications.addWarning('No active editor');
      return;
    }

    const filePath = editor.getPath();
    if (!filePath) {
      atom.notifications.addWarning('File not saved');
      return;
    }

    if (!filePath.endsWith('.tex')) {
      atom.notifications.addWarning('Not a LaTeX file');
      return;
    }

    // Save file before compiling
    editor.save();

    const fileName = path.basename(filePath);
    const fileDir = path.dirname(filePath);

    // Update status bar
    this.statusBarView.setStatus('building', `Building ${fileName}...`);
    atom.notifications.addInfo(`Compiling ${fileName}...`);

    let stdout = '';
    let stderr = '';

    const process = new BufferedProcess({
      command: 'latexmk',
      args: [
        '-pdf',           // Generate PDF
        '-bibtex',        // Run bibtex when needed
        '-interaction=nonstopmode',  // Don't stop on errors
        '-file-line-error',          // Better error messages
        fileName
      ],
      options: {
        cwd: fileDir
      },
      stdout: (output) => {
        stdout += output;
      },
      stderr: (output) => {
        stderr += output;
      },
      exit: (code) => {
        if (code === 0) {
          this.statusBarView.setStatus('success', `${fileName} built successfully`);
          atom.notifications.addSuccess(`Compiled ${fileName} successfully`);
          console.log('LaTeX compilation output:', stdout);
        } else {
          this.statusBarView.setStatus('error', `Build failed (exit code ${code})`);
          atom.notifications.addError(`Compilation failed (exit code ${code})`, {
            detail: stderr || stdout,
            dismissable: true
          });
          console.error('LaTeX compilation error:', stderr || stdout);
        }
      }
    });

    process.onWillThrowError((errorObject) => {
      this.statusBarView.setStatus('error', 'latexmk not found');
      atom.notifications.addError('Failed to run latexmk', {
        detail: `Make sure latexmk is installed and in your PATH.\n\nError: ${errorObject.error.message}`,
        dismissable: true
      });
      errorObject.handle();
    });
  },
};
