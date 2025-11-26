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
  buildProcesses: null,  // Track build processes per file for interruption
  compileOnSaveEditors: null,  // Track editors with compile-on-save enabled

  activate(state) {
    this.subscriptions = new CompositeDisposable();
    this.buildService = new BuildService();
    this.buildService.setMainModule(this);  // Set reference for API delegation
    this.logParser = new LogParser();
    this.linterProvider = new LinterProvider();
    this.statusBarView = new StatusBarView({
      onCompile: () => this.compile(),
      onOpenPdf: () => this.openPdf(),
      onKillAndClean: () => this.killAndClean(),
    });
    this.buildStates = new Map();  // Initialize build states tracking
    this.buildProcesses = new Map();  // Initialize build processes tracking
    this.compileOnSaveEditors = new Map();  // Initialize compile-on-save tracking

    // Register commands
    this.subscriptions.add(
      atom.commands.add('atom-text-editor[data-grammar~="latex"]', {
        'latex-tools:compile': () => this.compile(),
        'latex-tools:open-pdf': () => this.openPdf(),
        'latex-tools:open-pdf-external': () => this.openPdfExternal(),
        'latex-tools:clean': () => this.clean(),
        'latex-tools:clean-linter': () => this.cleanLinter(),
        'latex-tools:interrupt': () => this.interrupt(),
        'latex-tools:interrupt-all': () => this.interruptAll(),
        'latex-tools:kill-and-clean': () => this.killAndClean(),
        'latex-tools:toggle-compile-on-save': () => this.toggleCompileOnSave(),
      }),
      // Track active pane item changes
      atom.workspace.observeActiveTextEditor(item => {
        this.updateStatusBarVisibility(item);
      })
    );
  },

  deactivate() {
    // Kill all running build processes
    if (this.buildProcesses) {
      for (const [filePath, processInfo] of this.buildProcesses) {
        this.killProcess(processInfo.process);
      }
      this.buildProcesses.clear();
    }

    // Clean up compile-on-save subscriptions
    if (this.compileOnSaveEditors) {
      for (const [editorId, info] of this.compileOnSaveEditors) {
        if (info.disposable) {
          info.disposable.dispose();
        }
      }
      this.compileOnSaveEditors.clear();
    }

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

      // Check if this file is currently building (has active process)
      const processInfo = this.buildProcesses.get(filePath);
      if (processInfo) {
        // File is actively building - restore with running timer
        this.statusBarView.setStatus(buildState.status, buildState.message);
        this.statusBarView.restoreTimer(processInfo.startTime);
      } else if (buildState.elapsedTime) {
        // File has completed build - show elapsed time
        this.statusBarView.setStatus(buildState.status, buildState.message);
        this.statusBarView.showElapsedTime(buildState.elapsedTime);
      } else {
        // Normal status update
        this.statusBarView.setStatus(buildState.status, buildState.message);
      }

      // Update compile-on-save indicator
      this.statusBarView.setCompileOnSave(this.isCompileOnSaveEnabled(item));

      this.statusBarView.show();
    } else {
      this.statusBarView.hide();
    }
  },

  setBuildState(filePath, status, message = '', timerInfo = {}) {
    // Store build state for a specific file
    const existingState = this.buildStates.get(filePath) || {};
    this.buildStates.set(filePath, {
      status: status,
      message: message,
      timestamp: Date.now(),
      startTime: timerInfo.startTime || existingState.startTime || null,
      elapsedTime: timerInfo.elapsedTime || null
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
      timestamp: null,
      startTime: null,
      elapsedTime: null
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
      // Emit empty messages update
      if (this.buildService) {
        this.buildService.updateMessages(filePath, []);
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

      // Emit messages update event
      if (this.buildService) {
        this.buildService.updateMessages(filePath, messages);
      }

      // Get statistics
      const stats = this.logParser.getStatistics();
      if (atom.config.get('latex-tools.debug')) {
        console.log(`[LaTeX Tools] Parsed log file:`, stats);
      }
    } catch (error) {
      if (atom.config.get('latex-tools.debug')) {
        console.error('[LaTeX Tools] Failed to parse log file:', error);
      }
    }
  },

  checkBuildStatus(filePath) {
    // Check if a build is currently in progress for this file
    return this.buildProcesses.has(filePath);
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
          atom.notifications.addWarning('Build failed', {
            detail: 'PDF may be incomplete or outdated.',
            dismissable: true
          });
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
      atom.notifications.addInfo(`Opened ${path.basename(pdfPath)}`);
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
        atom.notifications.addInfo(`Opened ${path.basename(pdfPath)} externally`);
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

  cleanLinter() {
    if (this.linterProvider) {
      this.linterProvider.clearMessages();
      if (atom.config.get('latex-tools.debug')) {
        console.log('[LaTeX Tools] Linter messages cleared');
      }
    }
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
              if (atom.config.get('latex-tools.debug')) {
                console.error(`[LaTeX Tools] Failed to delete ${fullPath}:`, error);
              }
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
            if (atom.config.get('latex-tools.debug')) {
              console.error(`[LaTeX Tools] Failed to delete ${auxFile}:`, error);
            }
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

    // Clear linter messages
    this.cleanLinter();

    // Reset build state and status bar to idle
    this.setBuildState(filePath, 'idle');
    if (this.statusBarView) {
      this.statusBarView.setStatus('idle');
    }
  },

  killProcess(childProcess) {
    if (!childProcess) return;

    // Kill the process tree (especially important on Windows)
    if (process.platform === 'win32') {
      // On Windows, use taskkill to kill the entire process tree
      const taskkill = spawn('taskkill', ['/pid', childProcess.pid.toString(), '/T', '/F']);
      taskkill.on('exit', () => {
        if (atom.config.get('latex-tools.debug')) {
          console.log(`[LaTeX Tools] Process tree killed for PID ${childProcess.pid}`);
        }
      });
    } else {
      // On Unix-like systems, kill the process group
      try {
        process.kill(-childProcess.pid, 'SIGTERM');
      } catch (error) {
        if (atom.config.get('latex-tools.debug')) {
          console.error('[LaTeX Tools] Failed to kill process group:', error);
        }
        childProcess.kill('SIGTERM');
      }
    }
  },

  interrupt() {
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

    const processInfo = this.buildProcesses.get(filePath);
    if (!processInfo) {
      atom.notifications.addInfo('No build process running for this file');
      return;
    }

    const fileName = path.basename(filePath);

    // Kill the process
    this.killProcess(processInfo.process);

    // Remove from tracking
    this.buildProcesses.delete(filePath);

    // Update status
    this.setBuildState(filePath, 'idle', 'Build interrupted');
    this.statusBarView.setStatus('idle', 'Build interrupted');

    // Notify build service
    if (this.buildService) {
      this.buildService.failBuild(filePath, 'Build interrupted by user', '');
    }

    // Clear linter messages
    this.cleanLinter();

    if (atom.config.get('latex-tools.debug')) {
      console.log(`[LaTeX Tools] Build process interrupted for ${fileName}`);
    }
  },

  interruptAll() {
    if (this.buildProcesses.size === 0) {
      atom.notifications.addInfo('No build processes running');
      return;
    }

    const count = this.buildProcesses.size;
    const fileNames = [];

    // Kill all processes
    for (const [filePath, processInfo] of this.buildProcesses) {
      const fileName = path.basename(filePath);
      fileNames.push(fileName);

      // Kill the process
      this.killProcess(processInfo.process);

      // Update status
      this.setBuildState(filePath, 'idle', 'Build interrupted');

      // Notify build service
      if (this.buildService) {
        this.buildService.failBuild(filePath, 'Build interrupted by user', '');
      }

      if (atom.config.get('latex-tools.debug')) {
        console.log(`[LaTeX Tools] Build process interrupted for ${fileName}`);
      }
    }

    // Clear all processes
    this.buildProcesses.clear();

    // Update status bar for current file
    const editor = atom.workspace.getActiveTextEditor();
    if (editor) {
      const filePath = editor.getPath();
      if (filePath && filePath.endsWith('.tex')) {
        this.statusBarView.setStatus('idle', 'Build interrupted');
      }
    }

    // Clear linter messages
    this.cleanLinter();

    atom.notifications.addWarning(`Interrupted ${count} build process(es)`, {
      detail: fileNames.join('\n')
    });
  },

  killAndClean() {
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

    // First, interrupt any running build for this file
    const processInfo = this.buildProcesses.get(filePath);
    if (processInfo) {
      const fileName = path.basename(filePath);

      // Kill the process
      this.killProcess(processInfo.process);

      // Remove from tracking
      this.buildProcesses.delete(filePath);

      // Update status
      this.setBuildState(filePath, 'idle', 'Build interrupted');
      this.statusBarView.setStatus('idle', 'Build interrupted');

      // Notify build service
      if (this.buildService) {
        this.buildService.failBuild(filePath, 'Build interrupted by user', '');
      }

      if (atom.config.get('latex-tools.debug')) {
        console.log(`[LaTeX Tools] Build process interrupted for ${fileName}`);
      }

      atom.notifications.addInfo(`Build interrupted for ${fileName}`);
    }

    // Then run the clean command
    this.clean();
  },

  toggleCompileOnSave() {
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

    const editorId = editor.id;
    const fileName = path.basename(filePath);

    if (this.compileOnSaveEditors.has(editorId)) {
      // Disable compile-on-save
      const info = this.compileOnSaveEditors.get(editorId);
      if (info.disposable) {
        info.disposable.dispose();
      }
      this.compileOnSaveEditors.delete(editorId);

      // Emit event through build service
      if (this.buildService) {
        this.buildService.emitCompileOnSaveChange(editor, false);
      }

      atom.notifications.addInfo(`Compile on save disabled for ${fileName}`);

      if (atom.config.get('latex-tools.debug')) {
        console.log(`[LaTeX Tools] Compile on save disabled for ${fileName}`);
      }
    } else {
      // Enable compile-on-save
      const disposable = editor.onDidSave(() => {
        this.compileFile(editor);
      });

      const reloadDisposable = editor.getBuffer().onDidReload(() => {
        this.compileFile(editor);
      });

      // Also clean up when editor is destroyed
      const destroyDisposable = editor.onDidDestroy(() => {
        this.disableCompileOnSave(editorId);
      });

      this.compileOnSaveEditors.set(editorId, {
        editor: editor,
        filePath: filePath,
        disposable: new CompositeDisposable(disposable, reloadDisposable, destroyDisposable)
      });

      // Emit event through build service
      if (this.buildService) {
        this.buildService.emitCompileOnSaveChange(editor, true);
      }

      atom.notifications.addSuccess(`Compile on save enabled for ${fileName}`);

      if (atom.config.get('latex-tools.debug')) {
        console.log(`[LaTeX Tools] Compile on save enabled for ${fileName}`);
      }
    }

    // Update status bar to reflect compile-on-save state
    this.updateStatusBarVisibility(editor);
  },

  disableCompileOnSave(editorId) {
    if (this.compileOnSaveEditors.has(editorId)) {
      const info = this.compileOnSaveEditors.get(editorId);
      if (info.disposable) {
        info.disposable.dispose();
      }
      this.compileOnSaveEditors.delete(editorId);

      if (atom.config.get('latex-tools.debug')) {
        console.log(`[LaTeX Tools] Compile on save cleaned up for editor ${editorId}`);
      }
    }
  },

  isCompileOnSaveEnabled(editor) {
    if (!editor) return false;
    return this.compileOnSaveEditors.has(editor.id);
  },

  compileFile(editor) {
    // Compile a specific editor's file (used by compile-on-save)
    if (!editor) return;

    const filePath = editor.getPath();
    if (!filePath || !filePath.endsWith('.tex')) return;

    // Check if already building this file
    if (this.checkBuildStatus(filePath)) {
      if (atom.config.get('latex-tools.debug')) {
        console.log(`[LaTeX Tools] Skipping compile-on-save, build already in progress for ${path.basename(filePath)}`);
      }
      return;
    }

    // Run compilation
    this.runCompilation(filePath);
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

    // Save file before compiling
    editor.save();

    // Run the compilation
    this.runCompilation(filePath);
  },

  runCompilation(filePath) {
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

    // Track build start time
    const startTime = Date.now();

    // Update status bar and store build state
    this.setBuildState(filePath, 'building', `Compiling ${fileName}`, { startTime });

    const activeEditor = atom.workspace.getActiveTextEditor();
    if (activeEditor && activeEditor.getPath() === filePath) {
      this.statusBarView.setStatus('building', `Compiling ${fileName}`);
    }

    // Clear linter messages at start of compilation
    this.linterProvider.clearMessages();

    // Notify user about compile start
    atom.notifications.addInfo(`Compiling ${fileName}...`);

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
    this.buildProcesses.set(filePath, {
      process: childProcess,
      startTime: Date.now()
    });

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
      // Calculate elapsed time
      const elapsedTime = Date.now() - startTime;

      // Remove from tracking
      this.buildProcesses.delete(filePath);

      // Check if process was killed by signal (interrupted)
      if (signal) {
        if (atom.config.get('latex-tools.debug')) {
          console.log(`[LaTeX Tools] Process terminated by signal: ${signal}`);
        }
        return; // Don't show success/error notifications for interrupted builds
      }

      if (code === 0) {
        this.setBuildState(filePath, 'success', `${fileName} compiled successfully`, { startTime, elapsedTime });
        // Update status bar only if this file is still active
        const activeEditor = atom.workspace.getActiveTextEditor();
        if (activeEditor && activeEditor.getPath() === filePath) {
          this.statusBarView.setStatus('success', `${fileName} compiled successfully`);
          this.statusBarView.showElapsedTime(elapsedTime);
        }

        // Notify user
        atom.notifications.addSuccess(`${fileName} compiled successfully`, {
          detail: `Completed in ${Math.floor(elapsedTime / 1000)}s`
        });

        if (atom.config.get('latex-tools.debug')) {
          console.log(`LaTeX compilation completed in ${elapsedTime}ms`);
        }

        // Parse log file and update panel
        this.parseLogFile(filePath);

        // Notify build service of success
        if (this.buildService) {
          this.buildService.finishBuild(filePath, stdout, elapsedTime);
        }
      } else {
        this.setBuildState(filePath, 'error', `Compilation failed (exit code ${code})`, { startTime, elapsedTime });
        // Update status bar only if this file is still active
        const activeEditor = atom.workspace.getActiveTextEditor();
        if (activeEditor && activeEditor.getPath() === filePath) {
          this.statusBarView.setStatus('error', `Compilation failed (exit code ${code})`);
          this.statusBarView.showElapsedTime(elapsedTime);
        }

        // Notify user
        atom.notifications.addError(`${fileName} compilation failed`, {
          detail: `Exit code ${code} after ${Math.floor(elapsedTime / 1000)}s`,
          dismissable: true
        });

        if (atom.config.get('latex-tools.debug')) {
          console.error(`LaTeX compilation failed after ${elapsedTime}ms:`, stderr || stdout);
        }

        // Try to parse log file for error messages
        const fs = require('fs');
        const logPath = filePath.replace(/\.tex$/, '.log');
        let messages = [];
        let hasErrors = false;

        if (fs.existsSync(logPath)) {
          try {
            const logContent = fs.readFileSync(logPath, 'utf8');
            const parsedMessages = this.logParser.parse(logContent, filePath);
            // Check if there are any error-severity messages
            hasErrors = parsedMessages.some(msg => msg.severity === 'error');
            if (hasErrors) {
              // Only show errors, not warnings or info
              messages = parsedMessages.filter(msg => msg.severity === 'error');
            }
          } catch (error) {
            if (atom.config.get('latex-tools.debug')) {
              console.error('[LaTeX Tools] Failed to parse log file on error:', error);
            }
          }
        }

        // If no errors found in log, use fallback critical message
        if (!hasErrors) {
          messages = [{
            severity: 'error',
            location: {
              fullPath: filePath,
              position: {
                start: { row: 0, column: 0 },
                end: { row: 0, column: 0 }
              }
            },
            excerpt: `Critical error: Compilation failed with exit code ${code}`,
            description: 'The LaTeX compiler encountered a critical error or was interrupted. Check the console output for details.'
          }];
        }

        if (this.linterProvider) {
          this.linterProvider.setMessages(messages);
        }

        // Emit messages update event
        if (this.buildService) {
          this.buildService.updateMessages(filePath, messages);
          this.buildService.failBuild(filePath, `Exit code ${code}`, stderr || stdout);
        }
      }
    });

    // Handle process errors (e.g., command not found)
    childProcess.on('error', (error) => {
      // Calculate elapsed time
      const elapsedTime = Date.now() - startTime;

      // Remove from tracking
      this.buildProcesses.delete(filePath);

      this.setBuildState(filePath, 'error', 'latexmk not found', { startTime, elapsedTime });
      // Update status bar only if this file is still active
      const activeEditor = atom.workspace.getActiveTextEditor();
      if (activeEditor && activeEditor.getPath() === filePath) {
        this.statusBarView.setStatus('error', 'latexmk not found');
        this.statusBarView.showElapsedTime(elapsedTime);
      }
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

  // ============================================
  // API DELEGATION METHODS
  // These methods are called by BuildService to delegate actions
  // ============================================

  /**
   * Interrupt a specific file's build (API method)
   * @param {string} filePath - Path to the .tex file
   * @returns {boolean} True if a build was interrupted
   */
  interruptFile(filePath) {
    if (!filePath || !filePath.endsWith('.tex')) {
      return false;
    }

    const processInfo = this.buildProcesses.get(filePath);
    if (!processInfo) {
      return false;
    }

    const fileName = path.basename(filePath);

    // Kill the process
    this.killProcess(processInfo.process);

    // Remove from tracking
    this.buildProcesses.delete(filePath);

    // Update status
    this.setBuildState(filePath, 'idle', 'Build interrupted');

    // Update status bar if this file is active
    const activeEditor = atom.workspace.getActiveTextEditor();
    if (activeEditor && activeEditor.getPath() === filePath) {
      this.statusBarView.setStatus('idle', 'Build interrupted');
    }

    // Notify build service
    if (this.buildService) {
      this.buildService.failBuild(filePath, 'Build interrupted by user', '');
    }

    if (atom.config.get('latex-tools.debug')) {
      console.log(`[LaTeX Tools] Build process interrupted for ${fileName}`);
    }

    return true;
  },

  /**
   * Interrupt all builds (API method)
   * @returns {number} Number of builds interrupted
   */
  interruptAllBuilds() {
    const count = this.buildProcesses.size;
    if (count === 0) {
      return 0;
    }

    for (const [filePath, processInfo] of this.buildProcesses) {
      this.killProcess(processInfo.process);
      this.setBuildState(filePath, 'idle', 'Build interrupted');

      if (this.buildService) {
        this.buildService.failBuild(filePath, 'Build interrupted by user', '');
      }
    }

    this.buildProcesses.clear();

    // Update status bar for current file
    const editor = atom.workspace.getActiveTextEditor();
    if (editor) {
      const filePath = editor.getPath();
      if (filePath && filePath.endsWith('.tex')) {
        this.statusBarView.setStatus('idle', 'Build interrupted');
      }
    }

    this.cleanLinter();

    return count;
  },

  /**
   * Get parsed log messages (API method)
   * @param {string} [filePath] - Path to the .tex file
   * @returns {Array} Array of message objects
   */
  getLogMessages(filePath = null) {
    if (!filePath) {
      const editor = atom.workspace.getActiveTextEditor();
      if (editor) {
        filePath = editor.getPath();
      }
    }

    if (!filePath || !filePath.endsWith('.tex')) {
      return [];
    }

    // Parse the log file
    const fs = require('fs');
    const logPath = filePath.replace(/\.tex$/, '.log');

    if (!fs.existsSync(logPath)) {
      return [];
    }

    try {
      const logContent = fs.readFileSync(logPath, 'utf8');
      return this.logParser.parse(logContent, filePath);
    } catch (error) {
      if (atom.config.get('latex-tools.debug')) {
        console.error('[LaTeX Tools] Failed to parse log file:', error);
      }
      return [];
    }
  },

  /**
   * Get log message statistics (API method)
   * @param {string} [filePath] - Path to the .tex file
   * @returns {Object} Statistics object
   */
  getLogStatistics(filePath = null) {
    const messages = this.getLogMessages(filePath);
    return {
      total: messages.length,
      errors: messages.filter(m => m.severity === 'error').length,
      warnings: messages.filter(m => m.severity === 'warning').length,
      info: messages.filter(m => m.severity === 'info').length
    };
  },

  /**
   * Open PDF for a file (API method)
   * @param {string} filePath - Path to the .tex file
   * @returns {Promise<boolean>} True if successful
   */
  async openPdfForFile(filePath) {
    if (!filePath || !filePath.endsWith('.tex')) {
      return false;
    }

    const pdfPath = filePath.replace(/\.tex$/, '.pdf');
    const fs = require('fs');

    if (!fs.existsSync(pdfPath)) {
      return false;
    }

    try {
      await atom.workspace.open(pdfPath, { searchAllPanes: true });
      return true;
    } catch (error) {
      if (atom.config.get('latex-tools.debug')) {
        console.error('[LaTeX Tools] Failed to open PDF:', error);
      }
      return false;
    }
  },

  /**
   * Open PDF externally for a file (API method)
   * @param {string} filePath - Path to the .tex file
   * @returns {Promise<boolean>} True if successful
   */
  async openPdfExternalForFile(filePath) {
    if (!filePath || !filePath.endsWith('.tex')) {
      return false;
    }

    if (!this.openExternalService) {
      return false;
    }

    const pdfPath = filePath.replace(/\.tex$/, '.pdf');
    const fs = require('fs');

    if (!fs.existsSync(pdfPath)) {
      return false;
    }

    try {
      await this.openExternalService.openExternal(pdfPath);
      return true;
    } catch (error) {
      if (atom.config.get('latex-tools.debug')) {
        console.error('[LaTeX Tools] Failed to open PDF externally:', error);
      }
      return false;
    }
  },

  /**
   * Set compile-on-save for an editor (API method)
   * @param {TextEditor} editor - The editor instance
   * @param {boolean} enabled - Whether to enable
   * @returns {boolean} True if state was changed
   */
  setCompileOnSaveForEditor(editor, enabled) {
    if (!editor) {
      return false;
    }

    const filePath = editor.getPath();
    if (!filePath || !filePath.endsWith('.tex')) {
      return false;
    }

    const editorId = editor.id;
    const currentlyEnabled = this.compileOnSaveEditors.has(editorId);

    if (enabled === currentlyEnabled) {
      return false;  // No change needed
    }

    if (enabled) {
      // Enable compile-on-save
      const disposable = editor.onDidSave(() => {
        this.compileFile(editor);
      });

      const reloadDisposable = editor.getBuffer().onDidReload(() => {
        this.compileFile(editor);
      });

      const destroyDisposable = editor.onDidDestroy(() => {
        this.disableCompileOnSave(editorId);
      });

      this.compileOnSaveEditors.set(editorId, {
        editor: editor,
        filePath: filePath,
        disposable: new CompositeDisposable(disposable, reloadDisposable, destroyDisposable)
      });
    } else {
      // Disable compile-on-save
      this.disableCompileOnSave(editorId);
    }

    // Emit event through build service
    if (this.buildService) {
      this.buildService.emitCompileOnSaveChange(editor, enabled);
    }

    // Update status bar
    this.updateStatusBarVisibility(editor);

    return true;
  },

  /**
   * Get all editors with compile-on-save enabled (API method)
   * @returns {Array<TextEditor>}
   */
  getCompileOnSaveEditors() {
    return Array.from(this.compileOnSaveEditors.values()).map(info => info.editor);
  },

  /**
   * Forward SyncTeX: source to PDF (API method)
   * @param {string} texPath - Path to the .tex file
   * @param {number} line - Line number (1-based)
   * @param {number} column - Column number (0-based)
   * @returns {Promise<Object|null>} PDF location or null
   */
  async syncToPdf(texPath, line, column = 0) {
    if (!texPath || !texPath.endsWith('.tex')) {
      return null;
    }

    const pdfPath = texPath.replace(/\.tex$/, '.pdf');
    const syncPath = texPath.replace(/\.tex$/, '.synctex.gz');
    const fs = require('fs');

    if (!fs.existsSync(syncPath)) {
      if (atom.config.get('latex-tools.debug')) {
        console.log('[LaTeX Tools] SyncTeX file not found:', syncPath);
      }
      return null;
    }

    try {
      const { execSync } = require('child_process');
      const result = execSync(
        `synctex view -i "${line}:${column}:${texPath}" -o "${pdfPath}"`,
        { encoding: 'utf8', timeout: 5000 }
      );

      // Parse synctex output
      const pageMatch = result.match(/Page:(\d+)/);
      const xMatch = result.match(/x:([\d.]+)/);
      const yMatch = result.match(/y:([\d.]+)/);
      const widthMatch = result.match(/W:([\d.]+)/);
      const heightMatch = result.match(/H:([\d.]+)/);

      if (pageMatch) {
        return {
          page: parseInt(pageMatch[1], 10),
          x: xMatch ? parseFloat(xMatch[1]) : 0,
          y: yMatch ? parseFloat(yMatch[1]) : 0,
          width: widthMatch ? parseFloat(widthMatch[1]) : 0,
          height: heightMatch ? parseFloat(heightMatch[1]) : 0
        };
      }

      return null;
    } catch (error) {
      if (atom.config.get('latex-tools.debug')) {
        console.error('[LaTeX Tools] SyncTeX forward sync failed:', error);
      }
      return null;
    }
  },

  /**
   * Backward SyncTeX: PDF to source (API method)
   * @param {string} pdfPath - Path to the .pdf file
   * @param {number} page - Page number (1-based)
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {Promise<Object|null>} Source location or null
   */
  async syncToSource(pdfPath, page, x, y) {
    if (!pdfPath || !pdfPath.endsWith('.pdf')) {
      return null;
    }

    const syncPath = pdfPath.replace(/\.pdf$/, '.synctex.gz');
    const fs = require('fs');

    if (!fs.existsSync(syncPath)) {
      if (atom.config.get('latex-tools.debug')) {
        console.log('[LaTeX Tools] SyncTeX file not found:', syncPath);
      }
      return null;
    }

    try {
      const { execSync } = require('child_process');
      const result = execSync(
        `synctex edit -o "${page}:${x}:${y}:${pdfPath}"`,
        { encoding: 'utf8', timeout: 5000 }
      );

      // Parse synctex output
      const inputMatch = result.match(/Input:(.+)/);
      const lineMatch = result.match(/Line:(\d+)/);
      const columnMatch = result.match(/Column:(\d+)/);

      if (inputMatch && lineMatch) {
        return {
          file: inputMatch[1].trim(),
          line: parseInt(lineMatch[1], 10),
          column: columnMatch ? parseInt(columnMatch[1], 10) : 0
        };
      }

      return null;
    } catch (error) {
      if (atom.config.get('latex-tools.debug')) {
        console.error('[LaTeX Tools] SyncTeX backward sync failed:', error);
      }
      return null;
    }
  },
};
