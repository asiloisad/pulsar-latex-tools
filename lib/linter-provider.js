"use babel";

export default class LinterProvider {
  constructor() {
    this.name = "LaTeX";
    this.indieInstance = null;
  }

  // Called by linter package to register this indie linter
  register(indie) {
    this.indieInstance = indie;
    if (atom.config.get("latex-tools.debug")) {
      console.log("[LaTeX Tools] Linter indie instance registered");
    }
  }

  setMessages(messages) {
    if (!this.indieInstance) {
      console.warn("[LaTeX Tools] Linter indie instance not available");
      return;
    }

    // Filter messages based on suppress config
    const suppressErrors = atom.config.get("latex-tools.suppressErrors");
    const suppressWarnings = atom.config.get("latex-tools.suppressWarnings");
    const suppressInfos = atom.config.get("latex-tools.suppressInfos");

    const filteredMessages = messages.filter((msg) => {
      if (suppressErrors && msg.severity === "error") return false;
      if (suppressWarnings && msg.severity === "warning") return false;
      if (suppressInfos && msg.severity === "info") return false;
      return true;
    });

    // Remove duplicates (same severity, file, position, and excerpt)
    const seen = new Set();
    const uniqueMessages = filteredMessages.filter((msg) => {
      const key = `${msg.severity}|${msg.location.fullPath}|${msg.location.position.start.row}:${msg.location.position.start.column}|${msg.excerpt}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    // Convert to linter message format
    const linterMessages = uniqueMessages.map((msg) => ({
      severity: msg.severity,
      location: {
        file: msg.location.fullPath,
        position: [
          [msg.location.position.start.row, msg.location.position.start.column],
          [msg.location.position.end.row, msg.location.position.end.column],
        ],
      },
      excerpt: msg.excerpt,
      description: msg.description || undefined,
    }));

    // Set messages using indie linter API
    this.indieInstance.setAllMessages(linterMessages);
    if (atom.config.get("latex-tools.debug")) {
      console.log(
        `[LaTeX Tools] Set ${linterMessages.length} messages in linter`
      );
    }
  }

  clearMessages() {
    if (!this.indieInstance) {
      return;
    }

    this.indieInstance.clearMessages();
    if (atom.config.get("latex-tools.debug")) {
      console.log("[LaTeX Tools] Cleared linter messages");
    }
  }
}
