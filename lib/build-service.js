'use babel';

import { Emitter } from 'atom';

export default class BuildService {
  constructor() {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] Creating BuildService');
    }
    this.emitter = new Emitter();
    this.currentStatus = 'idle';
    this.currentFile = null;
  }

  // Public API for consumers
  onDidStartBuild(callback) {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] BuildService: Registered onDidStartBuild callback');
    }
    return this.emitter.on('did-start-build', callback);
  }

  onDidFinishBuild(callback) {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] BuildService: Registered onDidFinishBuild callback');
    }
    return this.emitter.on('did-finish-build', callback);
  }

  onDidFailBuild(callback) {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] BuildService: Registered onDidFailBuild callback');
    }
    return this.emitter.on('did-fail-build', callback);
  }

  onDidChangeBuildStatus(callback) {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] BuildService: Registered onDidChangeBuildStatus callback');
    }
    return this.emitter.on('did-change-build-status', callback);
  }

  getStatus() {
    return {
      status: this.currentStatus,
      file: this.currentFile
    };
  }

  // Internal methods (used by main.js)
  startBuild(filePath) {
    if (atom.config.get('latex-tools.debug')) {
      console.log(`[LaTeX Tools] BuildService: startBuild(${filePath})`);
    }
    this.currentStatus = 'building';
    this.currentFile = filePath;
    this.emitter.emit('did-start-build', { file: filePath });
    this.emitter.emit('did-change-build-status', {
      status: 'building',
      file: filePath
    });
  }

  finishBuild(filePath, output) {
    if (atom.config.get('latex-tools.debug')) {
      console.log(`[LaTeX Tools] BuildService: finishBuild(${filePath})`);
    }
    this.currentStatus = 'success';
    this.emitter.emit('did-finish-build', {
      file: filePath,
      output: output
    });
    this.emitter.emit('did-change-build-status', {
      status: 'success',
      file: filePath
    });
  }

  failBuild(filePath, error, output) {
    if (atom.config.get('latex-tools.debug')) {
      console.log(`[LaTeX Tools] BuildService: failBuild(${filePath})`);
    }
    this.currentStatus = 'error';
    this.emitter.emit('did-fail-build', {
      file: filePath,
      error: error,
      output: output
    });
    this.emitter.emit('did-change-build-status', {
      status: 'error',
      file: filePath,
      error: error
    });
  }

  reset() {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] BuildService: reset()');
    }
    this.currentStatus = 'idle';
    this.currentFile = null;
    this.emitter.emit('did-change-build-status', {
      status: 'idle',
      file: null
    });
  }

  destroy() {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] BuildService: destroy()');
    }
    this.emitter.dispose();
  }
}
