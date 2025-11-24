/** @babel */
/** @jsx etch.dom */

const etch = require('etch');
const path = require('path');

class LaTeXPanel {

  constructor() {
    this.messages = [];
    this.allMessages = [];  // Store unfiltered messages
    this.currentFile = null;
    this.isBuilding = false;
    etch.initialize(this);
  }

  setMessages(messages, filePath) {
    // Store original unfiltered messages
    this.allMessages = messages;

    // Filter messages based on config settings
    let filteredMessages = messages;

    const hideInfo = atom.config.get('latex-tools.hideInfoMessages');
    const hideWarnings = atom.config.get('latex-tools.hideWarningMessages');

    if (hideInfo) {
      filteredMessages = filteredMessages.filter(m => m.severity !== 'info');
    }

    if (hideWarnings) {
      filteredMessages = filteredMessages.filter(m => m.severity !== 'warning');
    }

    // Sort messages by severity first, then by line number
    const severityOrder = { 'error': 1, 'warning': 2, 'info': 3 };
    this.messages = filteredMessages.sort((a, b) => {
      // First, sort by severity
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;

      // If same severity, sort by line number
      const lineA = a.location.position.start.row;
      const lineB = b.location.position.start.row;
      return lineA - lineB;
    });
    this.currentFile = filePath;
    this.isBuilding = false;
    this.update();
  }

  setBuilding(filePath) {
    this.messages = [];
    this.currentFile = filePath;
    this.isBuilding = true;
    this.update();
  }

  clear() {
    this.messages = [];
    this.currentFile = null;
    this.isBuilding = false;
    this.update();
  }

  destroy() {
    etch.destroy(this);
  }

  update() {
    return etch.update(this);
  }

  render() {
    // Count messages by severity
    const errorCount = this.messages.filter(m => m.severity === 'error').length;
    const warningCount = this.messages.filter(m => m.severity === 'warning').length;
    const infoCount = this.messages.filter(m => m.severity === 'info').length;

    // Build message header with counts
    let messageHeader = 'Messages';
    const headerElements = [];

    if (this.isBuilding) {
      headerElements.push('Compiling...');
    } else if (this.messages.length > 0 || errorCount > 0 || warningCount > 0 || infoCount > 0) {
      const counts = [];

      if (errorCount > 0) {
        counts.push(`${errorCount} error${errorCount !== 1 ? 's' : ''}`);
      }

      if (warningCount > 0) {
        const hideWarnings = atom.config.get('latex-tools.hideWarningMessages');
        const warningText = `${warningCount} warning${warningCount !== 1 ? 's' : ''}`;
        counts.push(
          <span
            class="latex-count-toggle"
            style={{ cursor: 'pointer', textDecoration: hideWarnings ? 'line-through' : 'none' }}
            title={hideWarnings ? 'Click to show warnings' : 'Click to hide warnings'}
            on={{
              click: (e) => {
                e.stopPropagation();
                atom.config.set('latex-tools.hideWarningMessages', !hideWarnings);
                // Re-filter from original messages
                this.setMessages(this.allMessages, this.currentFile);
              }
            }}
          >{warningText}</span>
        );
      }

      if (infoCount > 0) {
        const hideInfo = atom.config.get('latex-tools.hideInfoMessages');
        const infoText = `${infoCount} info`;
        counts.push(
          <span
            class="latex-count-toggle"
            style={{ cursor: 'pointer', textDecoration: hideInfo ? 'line-through' : 'none' }}
            title={hideInfo ? 'Click to show info messages' : 'Click to hide info messages'}
            on={{
              click: (e) => {
                e.stopPropagation();
                atom.config.set('latex-tools.hideInfoMessages', !hideInfo);
                // Re-filter from original messages
                this.setMessages(this.allMessages, this.currentFile);
              }
            }}
          >{infoText}</span>
        );
      }

      if (counts.length > 0) {
        headerElements.push('(');
        counts.forEach((count, index) => {
          headerElements.push(count);
          if (index < counts.length - 1) {
            headerElements.push(', ');
          }
        });
        headerElements.push(')');
      }
    }

    const head = (
      <tr class="latex-header">
        <th>Severity</th>
        <th>Line</th>
        <th>File</th>
        <th>Messages {headerElements}</th>
      </tr>
    );

    const data = [];

    if (this.isBuilding) {
      // Show building state
      data.push(
        <tr class="latex-row latex-building">
          <td colspan="4" class="latex-building-message">
            <span class="icon icon-sync spinning"></span>
            Compiling {this.currentFile ? path.basename(this.currentFile) : 'document'}...
          </td>
        </tr>
      );
    } else if (this.messages.length === 0) {
      // Show empty state
      data.push(
        <tr class="latex-row latex-empty">
          <td colspan="4" class="latex-empty-message">
            {this.currentFile ? 'No issues found' : 'Compile a LaTeX file to see issues'}
          </td>
        </tr>
      );
    } else {
      // Show messages
      for (let message of this.messages) {
        let scls, stxt;
        if (message.severity === 'error') {
          scls = 'latex-severity text-error icon icon-stop';
          stxt = 'Error';
        } else if (message.severity === 'warning') {
          scls = 'latex-severity text-warning icon icon-alert';
          stxt = 'Warning';
        } else if (message.severity === 'info') {
          scls = 'latex-severity text-info icon icon-info';
          stxt = 'Info';
        }

        const lineNum = message.location.position.start.row + 1;
        const fileName = message.location.file;
        const fullPath = message.location.fullPath;

        const scroll = () => {
          // Open the file and navigate to the line
          atom.workspace.open(fullPath, {
            initialLine: message.location.position.start.row,
            initialColumn: message.location.position.start.column,
            searchAllPanes: true
          }).then(editor => {
            if (editor) {
              editor.scrollToCursorPosition();
            }
          }).catch(err => {
            console.error('Failed to open file:', err);
          });
        };

        const item = (
          <tr class={"latex-row " + message.severity} on={{ click: scroll }}>
            <td class={scls}>{stxt}</td>
            <td class="latex-line">{lineNum > 0 ? lineNum : '—'}</td>
            <td class="latex-file">{fileName}</td>
            <td class="latex-message">{message.excerpt}</td>
          </tr>
        );

        data.push(item);
      }
    }



    return (
      <div class="latex-panel-wrapper">
        <div class="latex-table-container">
          <table class="latex-table">
            <thead>{head}</thead>
            <tbody>{data}</tbody>
          </table>
        </div>
      </div>
    );
  }

  getTitle() {
    return 'LaTeX Issues';
  }

  getDefaultLocation() {
    return 'bottom';
  }

  getAllowedLocations() {
    return ['center', 'bottom'];
  }

  getURI() {
    return 'atom://latex-tools/issues';
  }

  toggle() {
    atom.workspace.toggle(this);
  }
}

module.exports = { LaTeXPanel };
