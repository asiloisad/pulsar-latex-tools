'use babel';

export default class LinterProvider {
    constructor() {
        this.name = 'LaTeX';
        this.indieInstance = null;
    }

    // Called by linter package to register this indie linter
    register(indie) {
        this.indieInstance = indie;
        console.log('[LaTeX Tools] Linter indie instance registered');
    }

    setMessages(messages) {
        if (!this.indieInstance) {
            console.warn('[LaTeX Tools] Linter indie instance not available');
            return;
        }

        // Convert to linter message format
        const linterMessages = messages.map(msg => ({
            severity: msg.severity,
            location: {
                file: msg.location.fullPath,
                position: [
                    [msg.location.position.start.row, msg.location.position.start.column],
                    [msg.location.position.end.row, msg.location.position.end.column]
                ]
            },
            excerpt: msg.excerpt,
            description: msg.description || undefined
        }));

        // Set messages using indie linter API
        this.indieInstance.setAllMessages(linterMessages);
        console.log(`[LaTeX Tools] Set ${linterMessages.length} messages in linter`);
    }

    clearMessages() {
        if (!this.indieInstance) {
            return;
        }

        this.indieInstance.clearMessages();
        console.log('[LaTeX Tools] Cleared linter messages');
    }
}
