'use babel';

import { CompositeDisposable, BufferedProcess } from 'atom';
import path from 'path';
import StatusBarView from './status-bar-view';

export default {
  subscriptions: null,
  statusBarView: null,
  statusBarTile: null,

  activate(state) {
    this.subscriptions = new CompositeDisposable();
    this.statusBarView = new StatusBarView();

    // Register commands
    this.subscriptions.add(
      atom.commands.add('atom-text-editor[data-grammar~="latex"]', {
        'latex-tools:compile': () => this.compile(),
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
