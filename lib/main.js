'use babel';

import { CompositeDisposable } from 'atom';

export default {
  subscriptions: null,

  activate(state) {
    this.subscriptions = new CompositeDisposable();

    // Register commands
    this.subscriptions.add(
      atom.commands.add('atom-workspace', {
        'latex-tools:toggle': () => this.toggle(),
      })
    );
  },

  deactivate() {
    this.subscriptions.dispose();
  },

  serialize() {
    return {};
  },

  toggle() {
    console.log('LaTeX Tools toggled!');
  },
};
