'use babel';

import { CompositeDisposable, Disposable } from 'atom';
import { spawn } from 'child_process';
import path from 'path';
import StatusBarView from './status-bar-view';
import BuildService from './build-service';
import LogParser from './log-parser';
import LinterProvider from './linter-provider';

export default {
  subscriptions: null,
  statusBarView: null,
  statusBarTile: null,
  openExternalService: null,
  buildService: null,
  logParser: null,
  linterProvider: null,  // Linter provider for displaying issues
  buildStates: null,  // Track build state per file
  currentBuildProcess: null,  // Track current build process for interruption

  activate(state) {
    this.subscriptions = new CompositeDisposable();
    this.buildService = new BuildService();
    this.logParser = new LogParser();
    this.linterProvider = new LinterProvider();
    this.statusBarView = new StatusBarView(() => {
      // Open linter panel when status bar is clicked
      atom.commands.dispatch(atom.views.getView(atom.workspace), 'linter-ui-default:toggle-panel');
    });
    this.buildStates = new Map();  // Initialize build states tracking

    // Register commands
    this.subscriptions.add(
      atom.commands.add('atom-text-editor[data-grammar~="latex"]', {
        'latex-tools:compile': () => this.compile(),
        'latex-tools:open-pdf': () => this.openPdf(),
        'latex-tools:open-pdf-external': () => this.openPdfExternal(),
        'latex-tools:clean': () => this.clean(),
        'latex-tools:interrupt': () => this.interrupt(),
      }),
      // Track active pane item changes
      atom.workspace.observeActiveTextEditor(item => {
        this.updateStatusBarVisibility(item);
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
    if (this.buildService) {
      this.buildService.destroy();
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

    // Update visibility based on current active item
    const activeItem = atom.workspace.getActiveTextEditor();
    this.updateStatusBarVisibility(activeItem);
  },

  consumeOpenExternal(service) {
    this.openExternalService = service;
    return new Disposable(() => {
      this.openExternalService = null;
    });
  },

  provideBuildStatus() {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] Providing build status service');
    }
    return this.buildService;
  },

  consumeIndie(registerIndie) {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] Consuming linter-indie service');
    }
    const linter = registerIndie({
      name: 'LaTeX'
    });
    this.subscriptions.add(linter);
    this.linterProvider.register(linter);
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] Linter indie instance registered');
    }
  },



  updateStatusBarVisibility(item) {
    // Show status bar only when a .tex file is active
    if (!this.statusBarView) {
      return;
    }

    const isTexEditor = item &&
      typeof item.getPath === 'function' &&
      item.getPath &&
      item.getPath() &&
      item.getPath().endsWith('.tex');

    if (isTexEditor) {
      const filePath = item.getPath();
      // Get the build state for this file and update status bar
      const buildState = this.getBuildState(filePath);
      if (atom.config.get('latex-tools.debug')) {
        console.log('[LaTeX Tools] Restoring build state:', buildState.status, 'for', path.basename(filePath));
      }
      this.statusBarView.setStatus(buildState.status, buildState.message);
      this.statusBarView.show();
    } else {
      this.statusBarView.hide();
    }
  },

  setBuildState(filePath, status, message = '') {
    // Store build state for a specific file
    this.buildStates.set(filePath, {
      status: status,
      message: message,
      timestamp: Date.now()
    });
    if (atom.config.get('latex-tools.debug')) {
      console.log(`[LaTeX Tools] Build state for ${path.basename(filePath)}: ${status}`);
    }
  },

  getBuildState(filePath) {
    // Get build state for a specific file, default to idle
    if (this.buildStates.has(filePath)) {
      return this.buildStates.get(filePath);
    }
    return {
      status: 'idle',
      message: 'LaTeX',
      timestamp: null
    };
  },

  parseLogFile(filePath) {
    const fs = require('fs');
    const logPath = filePath.replace(/\.tex$/, '.log');

    if (!fs.existsSync(logPath)) {
      if (atom.config.get('latex-tools.debug')) {
        console.log('[LaTeX Tools] Log file not found:', logPath);
      }
      // Clear linter messages if no log file
      if (this.linterProvider) {
        this.linterProvider.clearMessages();
      }
      return;
    }

    try {
      const logContent = fs.readFileSync(logPath, 'utf8');
      const messages = this.logParser.parse(logContent, filePath);

      // Send messages to linter
      if (this.linterProvider) {
        this.linterProvider.setMessages(messages);
      }

      // Get statistics
      const stats = this.logParser.getStatistics();
      if (atom.config.get('latex-tools.debug')) {
        console.log(`[LaTeX Tools] Parsed log file:`, stats);
      }
    } catch (error) {
      console.error('[LaTeX Tools] Failed to parse log file:', error);
    }
  },

  checkBuildStatus(filePath) {
    // Check if a build is currently in progress for this file
    if (this.buildService) {
      const status = this.buildService.getStatus();
      if (status.status === 'building' && status.file === filePath) {
        return true;
      }
    }
    return false;
  },

  waitForBuildAndOpen(filePath, pdfPath, openExternal = false) {
    // Subscribe to build finish/fail events
    const disposable = new CompositeDisposable();

    const openPdfAfterBuild = () => {
      disposable.dispose();
      // Delay slightly to ensure file is fully written
      setTimeout(() => {
        if (openExternal) {
          this._openPdfExternalDirect(pdfPath);
        } else {
          this._openPdfDirect(pdfPath);
        }
      }, 100);
    };

    disposable.add(
      this.buildService.onDidFinishBuild((data) => {
        if (data.file === filePath) {
          openPdfAfterBuild();
        }
      }),
      this.buildService.onDidFailBuild((data) => {
        if (data.file === filePath) {
          disposable.dispose();
          // atom.notifications.addWarning('Build failed', {
          //   detail: 'PDF may be incomplete or outdated.',
          //   dismissable: true
          // });
        }
      })
    );

    atom.notifications.addInfo('Waiting for compilation to finish...', {
      description: 'The PDF will open automatically when the build completes.',
      dismissable: true
    });
  },

  _openPdfDirect(pdfPath) {
    atom.workspace.open(pdfPath, { searchAllPanes: true }).then(() => {
      // atom.notifications.addInfo(`Opened ${path.basename(pdfPath)}`);
    }).catch((error) => {
      atom.notifications.addError('Failed to open PDF', {
        detail: error.message,
        dismissable: true
      });
    });
  },

  _openPdfExternalDirect(pdfPath) {
    if (!this.openExternalService) {
      atom.notifications.addWarning('open-external service not available', {
        detail: 'Please install the open-external package',
        dismissable: true
      });
      return;
    }

    this.openExternalService.openExternal(pdfPath)
      .then(() => {
        // atom.notifications.addInfo(`Opened ${path.basename(pdfPath)} externally`);
      })
      .catch((error) => {
        atom.notifications.addError('Failed to open PDF externally', {
          detail: error ? error.message || error : 'Unknown error',
          dismissable: true
        });
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

    // Check if build is in progress
    if (this.checkBuildStatus(filePath)) {
      this.waitForBuildAndOpen(filePath, pdfPath, false);
      return;
    }

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
    this._openPdfDirect(pdfPath);
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

    // Check if build is in progress
    if (this.checkBuildStatus(filePath)) {
      this.waitForBuildAndOpen(filePath, pdfPath, true);
      return;
    }

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
    this._openPdfExternalDirect(pdfPath);
  },

  wildcardToRegex(pattern, baseName) {
    // Replace {basename} placeholder with actual basename
    pattern = pattern.replace(/\{basename\}/g, baseName);

    // Escape special regex characters except * and ?
    let regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

    // Convert wildcards to regex
    regexPattern = regexPattern.replace(/\*/g, '.*');  // * matches any characters
    regexPattern = regexPattern.replace(/\?/g, '.');   // ? matches single character

    // Anchor the pattern to match full filename
    return new RegExp('^' + regexPattern + '$');
  },

  matchesPattern(filename, pattern, baseName) {
    const regex = this.wildcardToRegex(pattern, baseName);
    return regex.test(filename);
  },

  clean() {
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

    const fs = require('fs');
    const fileDir = path.dirname(filePath);
    const baseName = path.basename(filePath, '.tex');

    // Get auxiliary file extensions/patterns from config
    const auxPatterns = atom.config.get('latex-tools.auxFileExtensions') || [];

    if (auxPatterns.length === 0) {
      atom.notifications.addWarning('No auxiliary file extensions configured', {
        detail: 'Please configure auxiliary file extensions in latex-tools settings.',
        dismissable: true
      });
      return;
    }

    let deletedFiles = [];
    let failedFiles = [];

    // Read all files in the directory
    let allFiles;
    try {
      allFiles = fs.readdirSync(fileDir);
    } catch (error) {
      atom.notifications.addError('Failed to read directory', {
        detail: error.message,
        dismissable: true
      });
      return;
    }

    // Process each pattern
    for (const pattern of auxPatterns) {
      // Check if pattern contains wildcards
      const hasWildcard = pattern.includes('*') || pattern.includes('?');

      if (hasWildcard) {
        // Pattern matching with wildcards
        for (const file of allFiles) {
          if (this.matchesPattern(file, pattern, baseName)) {
            const fullPath = path.join(fileDir, file);
            try {
              // Don't delete the .tex or .pdf files
              if (!file.endsWith('.tex') && !file.endsWith('.pdf')) {
                fs.unlinkSync(fullPath);
                deletedFiles.push(file);
                if (atom.config.get('latex-tools.debug')) {
                  console.log(`[LaTeX Tools] Deleted: ${fullPath}`);
                }
              }
            } catch (error) {
              failedFiles.push(file);
              console.error(`[LaTeX Tools] Failed to delete ${fullPath}:`, error);
            }
          }
        }
      } else {
        // Simple extension matching (legacy behavior)
        const auxFile = path.join(fileDir, `${baseName}.${pattern}`);
        if (fs.existsSync(auxFile)) {
          try {
            fs.unlinkSync(auxFile);
            deletedFiles.push(`${baseName}.${pattern}`);
            if (atom.config.get('latex-tools.debug')) {
              console.log(`[LaTeX Tools] Deleted: ${auxFile}`);
            }
          } catch (error) {
            failedFiles.push(`${baseName}.${pattern}`);
            console.error(`[LaTeX Tools] Failed to delete ${auxFile}:`, error);
          }
        }
      }
    }

    // Show results
    if (deletedFiles.length > 0) {
      atom.notifications.addSuccess(`Cleaned ${deletedFiles.length} auxiliary file(s)`, {
        detail: deletedFiles.join('\n'),
        dismissable: true
      });
    } else {
      atom.notifications.addInfo('No auxiliary files found to clean');
    }

    if (failedFiles.length > 0) {
      atom.notifications.addWarning(`Failed to delete ${failedFiles.length} file(s)`, {
        detail: failedFiles.join('\n'),
        dismissable: true
      });
    }
  },

  interrupt() {
    if (!this.currentBuildProcess) {
      atom.notifications.addInfo('No build process running');
      return;
    }

    const filePath = this.currentFile;
    const fileName = filePath ? path.basename(filePath) : 'unknown';

    // Kill the process tree (especially important on Windows)
    if (process.platform === 'win32') {
      // On Windows, use taskkill to kill the entire process tree
      const taskkill = spawn('taskkill', ['/pid', this.currentBuildProcess.pid.toString(), '/T', '/F']);
      taskkill.on('exit', () => {
        if (atom.config.get('latex-tools.debug')) {
          console.log(`[LaTeX Tools] Process tree killed for PID ${this.currentBuildProcess.pid}`);
        }
      });
    } else {
      // On Unix-like systems, kill the process group
      try {
        process.kill(-this.currentBuildProcess.pid, 'SIGTERM');
      } catch (error) {
        console.error('[LaTeX Tools] Failed to kill process group:', error);
        this.currentBuildProcess.kill('SIGTERM');
      }
    }

    this.currentBuildProcess = null;

    // Update status
    if (filePath) {
      this.setBuildState(filePath, 'idle', 'Build interrupted');
    }
    this.statusBarView.setStatus('idle', 'Build interrupted');

    // Notify build service
    if (this.buildService) {
      this.buildService.failBuild(filePath, 'Build interrupted by user', '');
    }

    // atom.notifications.addWarning(`Build interrupted: ${fileName}`, {
    //   dismissable: true
    // });

    if (atom.config.get('latex-tools.debug')) {
      console.log(`[LaTeX Tools] Build process interrupted for ${fileName}`);
    }
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

    // Check if already building this file
    if (this.checkBuildStatus(filePath)) {
      atom.notifications.addWarning('Build already in progress', {
        detail: `${path.basename(filePath)} is currently being compiled.`,
        dismissable: true
      });
      return;
    }

    // Store current file for interrupt functionality
    this.currentFile = filePath;

    // Save file before compiling
    editor.save();

    const fileName = path.basename(filePath);
    const fileDir = path.dirname(filePath);

    // Build latexmk arguments based on config
    const args = [
      '-pdf',           // Generate PDF
      '-bibtex',        // Run bibtex when needed
      '-interaction=nonstopmode',  // Don't stop on errors
      '-file-line-error',          // Better error messages
    ];

    // Add SyncTeX if enabled
    if (atom.config.get('latex-tools.enableSynctex')) {
      args.push('-synctex=1');
    }

    // Add shell escape if enabled
    if (atom.config.get('latex-tools.shellEscape')) {
      args.push('-shell-escape');
    }

    // Add clean option if enabled
    if (atom.config.get('latex-tools.cleanAuxFiles')) {
      args.push('-c');
    }

    // Add the file name as the last argument
    args.push(fileName);

    // Update status bar and store build state
    this.setBuildState(filePath, 'building', `Compiling ${fileName}`);
    this.statusBarView.setStatus('building', `Compiling ${fileName}`);
    // atom.notifications.addInfo(`Compiling ${fileName}...`);

    // Update panel to show building state
    if (this.latexPanel) {
      this.latexPanel.setBuilding(filePath);
    }

    // Notify build service
    if (this.buildService) {
      this.buildService.startBuild(filePath);
    }

    let stdout = '';
    let stderr = '';

    // Use child_process.spawn for better process control
    const childProcess = spawn('latexmk', args, {
      cwd: fileDir,
      shell: false,
      // On Unix-like systems, create a new process group for easier termination
      detached: process.platform !== 'win32'
    });

    // Store the process reference for interruption
    this.currentBuildProcess = childProcess;

    // Capture stdout
    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    // Capture stderr
    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle process exit
    childProcess.on('exit', (code, signal) => {
      // Clear current build process reference
      this.currentBuildProcess = null;
      this.currentFile = null;

      // Check if process was killed by signal (interrupted)
      if (signal) {
        if (atom.config.get('latex-tools.debug')) {
          console.log(`[LaTeX Tools] Process terminated by signal: ${signal}`);
        }
        return; // Don't show success/error notifications for interrupted builds
      }

      if (code === 0) {
        this.setBuildState(filePath, 'success', `${fileName} compiled successfully`);
        this.statusBarView.setStatus('success', `${fileName} compiled successfully`);
        // atom.notifications.addSuccess(`Compiled ${fileName} successfully`);
        if (atom.config.get('latex-tools.debug')) {
          console.log('LaTeX compilation output:', stdout);
        }

        // Parse log file and update panel
        this.parseLogFile(filePath);

        // Notify build service of success
        if (this.buildService) {
          this.buildService.finishBuild(filePath, stdout);
        }
      } else {
        this.setBuildState(filePath, 'error', `Compilation failed (exit code ${code})`);
        this.statusBarView.setStatus('error', `Compilation failed (exit code ${code})`);
        // atom.notifications.addError(`Compilation failed (exit code ${code})`, {
        //   detail: stderr || stdout,
        //   dismissable: true
        // });
        if (atom.config.get('latex-tools.debug')) {
          console.error('LaTeX compilation error:', stderr || stdout);
        }

        // Parse log file even on failure to show errors
        this.parseLogFile(filePath);

        // Notify build service of failure
        if (this.buildService) {
          this.buildService.failBuild(filePath, `Exit code ${code}`, stderr || stdout);
        }
      }
    });

    // Handle process errors (e.g., command not found)
    childProcess.on('error', (error) => {
      // Clear current build process reference
      this.currentBuildProcess = null;
      this.currentFile = null;

      this.setBuildState(filePath, 'error', 'latexmk not found');
      this.statusBarView.setStatus('error', 'latexmk not found');
      atom.notifications.addError('Failed to run latexmk', {
        detail: `Make sure latexmk is installed and in your PATH.\n\nError: ${error.message}`,
        dismissable: true
      });

      // Notify build service of failure
      if (this.buildService) {
        this.buildService.failBuild(filePath, 'latexmk not found', error.message);
      }
    });
  },
};
