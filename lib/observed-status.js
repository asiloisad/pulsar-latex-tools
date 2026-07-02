module.exports = class ObservedFilesStatusView {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.count = 0;
    this.tooltip = null;

    this.element = document.createElement("div");
    this.element.classList.add("latex-tools-observed-status", "inline-block");

    this.label = document.createElement("span");
    this.label.classList.add("latex-tools-observed-status-label");
    this.element.appendChild(this.label);

    this.tooltip = atom.tooltips.add(this.element, {
      title: "Observed compile-on-save files",
    });

    this.element.addEventListener("click", () => {
      if (this.callbacks.onOpenObservedFiles) {
        this.callbacks.onOpenObservedFiles();
      }
    });

    this.setCount(0);
  }

  setCount(count) {
    this.count = count;
    this.label.textContent = `Obs ${count}`;
    this.element.title = `${count} file${count === 1 ? "" : "s"} observed for compile-on-save`;
    this.element.style.display = count > 0 ? "" : "none";
  }

  destroy() {
    if (this.tooltip) {
      this.tooltip.dispose();
      this.tooltip = null;
    }
    this.element.remove();
  }

  getElement() {
    return this.element;
  }
};
