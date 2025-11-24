'use babel';

import { Emitter } from 'atom';

export default class BuildService {
  constructor() {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] Creating BuildService');
    }
    this.emitter = new Emitter();
    this.buildingFiles = new Map();  // Track status per file
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

  getStatus(filePath = null) {
    if (filePath) {
      // Get status for specific file
      const fileStatus = this.buildingFiles.get(filePath);
      return {
        status: fileStatus ? fileStatus.status : 'idle',
        file: filePath
      };
    }
    // Return all building files info
    const buildingCount = Array.from(this.buildingFiles.values())
      .filter(s => s.status === 'building').length;
    return {
      status: buildingCount > 0 ? 'building' : 'idle',
      buildingCount: buildingCount,
      files: Array.from(this.buildingFiles.entries()).map(([file, data]) => ({
        file,
        status: data.status
      }))
    };
  }

  isBuilding(filePath) {
    const fileStatus = this.buildingFiles.get(filePath);
    return fileStatus && fileStatus.status === 'building';
  }

  // Internal methods (used by main.js)
  startBuild(filePath) {
    if (atom.config.get('latex-tools.debug')) {
      console.log(`[LaTeX Tools] BuildService: startBuild(${filePath})`);
    }
    this.buildingFiles.set(filePath, { status: 'building', startTime: Date.now() });
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
    this.buildingFiles.set(filePath, { status: 'success', endTime: Date.now() });
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
    this.buildingFiles.set(filePath, { status: 'error', endTime: Date.now(), error });
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

  reset(filePath = null) {
    if (atom.config.get('latex-tools.debug')) {
      console.log(`[LaTeX Tools] BuildService: reset(${filePath || 'all'})`);
    }
    if (filePath) {
      this.buildingFiles.delete(filePath);
      this.emitter.emit('did-change-build-status', {
        status: 'idle',
        file: filePath
      });
    } else {
      this.buildingFiles.clear();
      this.emitter.emit('did-change-build-status', {
        status: 'idle',
        file: null
      });
    }
  }

  destroy() {
    if (atom.config.get('latex-tools.debug')) {
      console.log('[LaTeX Tools] BuildService: destroy()');
    }
    this.buildingFiles.clear();
    this.emitter.dispose();
  }
}
