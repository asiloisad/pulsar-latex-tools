'use babel';

import path from 'path';

// Pattern for errors (handles both file:line: and ! formats)
const ERROR_PATTERN = /^(?:(.+\.tex):(\d+):|!)(?: (.+?) Error:)? (.+?\.?)$/;

// Pattern for output file
const OUTPUT_PATTERN = /^Output\swritten\son\s(.*)\s\(.*\)\.$/;

// Pattern for overfull/underfull boxes
const BOX_PATTERN = /^((?:Over|Under)full \\[hvd]box \([^)]*\)) (?:in paragraph )?at lines (\d+)--(\d+)$/;

// Pattern for LaTeX/Package warnings and info
const WARNING_INFO_PATTERN = /^((?:(?:Class|Package) \S+)|LaTeX|LaTeX Font) (Warning|Info):\s+(.*?)(?:\son input line (\d+))?\.?$/;

// Pattern for incomplete font messages (no ending period)
const INCOMPLETE_FONT_PATTERN = /^LaTeX Font .*[^.]$/;

// Pattern for \input markers surrounded by parentheses
const INPUT_FILE_PATTERN = /(\([^()[\]]+|\))/g;

// Pattern to clean file paths
const INPUT_FILE_TRIM_PATTERN = /(^\([\s"]*|[\s"]+$)/g;

export default class LogParser {
  
  constructor() {
    this.messages = [];
    this.sourcePaths = [];
    this.projectPath = null;
    this.texFilePath = null;
    this.outputFilePath = null;
    this.lastMessage = null;
  }

  parse(logContent, texFilePath) {
    this.messages = [];
    this.texFilePath = texFilePath;
    this.projectPath = path.dirname(texFilePath);
    this.sourcePaths = [texFilePath];
    this.outputFilePath = null;
    this.lastMessage = null;
    
    const lines = logContent.split(/\r?\n/);
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      
      // Skip first line (has confusing patterns)
      if (lineIndex === 0) continue;
      
      // Track position in log file
      const logRange = [[lineIndex, 0], [lineIndex, line.length]];
      
      // 1. Check for output file path
      let match = line.match(OUTPUT_PATTERN);
      if (match) {
        const filePath = match[1].replace(/"/g, '');
        this.outputFilePath = path.resolve(this.projectPath, filePath);
        continue;
      }
      
      // 2. Check for errors (unified pattern for file:line: and ! formats)
      match = line.match(ERROR_PATTERN);
      if (match) {
        const message = this.parseError(match, lineIndex, logRange);
        if (message) {
          this.addMessage(message);
        }
        continue;
      }
      
      // 3. Check for box warnings (overfull/underfull)
      match = line.match(BOX_PATTERN);
      if (match) {
        const message = this.parseBoxWarning(match, lineIndex, logRange);
        if (message) {
          this.addMessage(message);
        }
        continue;
      }
      
      // 4. Check for warnings/info (handle multi-line font messages)
      const testLine = INCOMPLETE_FONT_PATTERN.test(line) && lineIndex + 1 < lines.length
        ? line + lines[lineIndex + 1].substring(15)
        : line;
      
      match = testLine.match(WARNING_INFO_PATTERN);
      if (match) {
        const message = this.parseWarningInfo(match, lineIndex, logRange);
        if (message) {
          this.addMessage(message);
        }
        continue;
      }
      
      // 5. Track file stack with parentheses
      this.updateFileStack(line);
    }
    
    return this.messages;
  }

  parseError(match, lineIndex, logRange) {
    const filePath = match[1];
    const lineNumber = match[2] ? parseInt(match[2], 10) : undefined;
    const errorType = match[3];
    const messageText = match[4];
    
    // Skip help messages
    if (messageText.match(/^(The |This |You |See |Type |That makes )/)) {
      return null;
    }
    
    // Build full message with error type if present
    const text = (errorType && errorType !== 'LaTeX')
      ? `${errorType} Error: ${messageText}`
      : messageText;
    
    // Resolve file path
    const resolvedPath = filePath
      ? path.resolve(this.projectPath, filePath)
      : this.getCurrentFile();
    
    return {
      severity: 'error',
      excerpt: text,
      location: {
        file: path.basename(resolvedPath),
        fullPath: resolvedPath,
        position: lineNumber ? {
          start: { row: lineNumber - 1, column: 0 },
          end: { row: lineNumber - 1, column: Number.MAX_SAFE_INTEGER }
        } : {
          start: { row: 0, column: 0 },
          end: { row: 0, column: Number.MAX_SAFE_INTEGER }
        }
      },
      logRange: logRange
    };
  }

  parseBoxWarning(match, lineIndex, logRange) {
    const text = match[1];
    const startLine = parseInt(match[2], 10);
    const endLine = parseInt(match[3], 10);
    
    return {
      severity: 'info',
      excerpt: text,
      location: {
        file: path.basename(this.getCurrentFile()),
        fullPath: this.getCurrentFile(),
        position: {
          start: { row: startLine - 1, column: 0 },
          end: { row: endLine - 1, column: Number.MAX_SAFE_INTEGER }
        }
      },
      logRange: logRange
    };
  }

  parseWarningInfo(match, lineIndex, logRange) {
    const origin = match[1];
    const type = match[2].toLowerCase(); // 'warning' or 'info'
    const messageText = match[3];
    const lineNumber = match[4] ? parseInt(match[4], 10) : undefined;
    
    // Build message with origin if not LaTeX
    const text = (origin !== 'LaTeX')
      ? `${origin}: ${messageText.replace(/\s+/g, ' ')}`
      : messageText.replace(/\s+/g, ' ');
    
    return {
      severity: type,
      excerpt: text,
      location: {
        file: path.basename(this.getCurrentFile()),
        fullPath: this.getCurrentFile(),
        position: lineNumber ? {
          start: { row: lineNumber - 1, column: 0 },
          end: { row: lineNumber - 1, column: Number.MAX_SAFE_INTEGER }
        } : {
          start: { row: 0, column: 0 },
          end: { row: 0, column: Number.MAX_SAFE_INTEGER }
        }
      },
      logRange: logRange
    };
  }

  updateFileStack(line) {
    // Match all parentheses groups in the line
    const match = line.match(INPUT_FILE_PATTERN);
    if (!match) return;
    
    for (const token of match) {
      if (token === ')') {
        // Pop file from stack (but keep at least the main tex file)
        if (this.sourcePaths.length > 1) {
          this.sourcePaths.shift();
        }
      } else {
        // Push new file onto stack
        const cleanPath = token.replace(INPUT_FILE_TRIM_PATTERN, '');
        // Only add if it looks like a file path
        if (cleanPath.includes('.')) {
          const resolvedPath = path.resolve(this.projectPath, cleanPath);
          this.sourcePaths.unshift(resolvedPath);
        }
      }
    }
  }

  getCurrentFile() {
    return this.sourcePaths.length > 0 ? this.sourcePaths[0] : this.texFilePath;
  }

  addMessage(message) {
    // Deduplicate: skip if same file, line, and excerpt as last message
    if (this.lastMessage &&
        this.lastMessage.location.fullPath === message.location.fullPath &&
        this.lastMessage.location.position.start.row === message.location.position.start.row &&
        this.lastMessage.excerpt === message.excerpt) {
      return;
    }
    
    this.messages.push(message);
    this.lastMessage = message;
  }

  getMessages() {
    return this.messages;
  }

  getOutputFilePath() {
    return this.outputFilePath;
  }

  clear() {
    this.messages = [];
    this.sourcePaths = [];
    this.lastMessage = null;
    this.outputFilePath = null;
  }

  getStatistics() {
    return {
      total: this.messages.length,
      errors: this.messages.filter(m => m.severity === 'error').length,
      warnings: this.messages.filter(m => m.severity === 'warning').length,
      info: this.messages.filter(m => m.severity === 'info').length,
      outputFile: this.outputFilePath
    };
  }
}
