/** @babel */
/** @jsx etch.dom */

const etch = require('etch');
const path = require('path');

class LaTeXPanel {

  constructor() {
    this.messages = [];
    this.currentFile = null;
    this.isBuilding = false;
    etch.initialize(this);
  }

  setMessages(messages, filePath) {
    this.messages = messages;
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
    const head = (
      <tr class="latex-header">
        <th>Severity</th>
        <th>Line</th>
        <th>File</th>
        <th>Message</th>
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

    // Count messages by severity
    const errorCount = this.messages.filter(m => m.severity === 'error').length;
    const warningCount = this.messages.filter(m => m.severity === 'warning').length;
    const infoCount = this.messages.filter(m => m.severity === 'info').length;

    // Build summary spans
    const summaryItems = [];
    
    if (this.isBuilding) {
      summaryItems.push(
        <span class="latex-count">Building...</span>
      );
    } else if (errorCount > 0) {
      summaryItems.push(
        <span class="latex-count text-error">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
      );
    }
    
    if (!this.isBuilding && warningCount > 0) {
      summaryItems.push(
        <span class="latex-count text-warning">{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
      );
    }
    
    if (!this.isBuilding && infoCount > 0) {
      summaryItems.push(
        <span class="latex-count text-info">{infoCount} info</span>
      );
    }
    
    if (!this.isBuilding && this.messages.length === 0 && this.currentFile) {
      summaryItems.push(
        <span class="latex-count text-success">No issues</span>
      );
    }

    const summary = (
      <div class="latex-summary">
        {summaryItems}
      </div>
    );

    return (
      <div class="latex-panel-wrapper">
        {summary}
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
