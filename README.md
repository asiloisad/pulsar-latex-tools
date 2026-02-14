# latex-tools

Compile LaTeX documents with `latexmk` and view PDFs. Includes SyncTeX support, integrated linting, and multiple build management.

## Features

- **Compilation**: Build documents using `latexmk` with configurable engines.
- **PDF viewing**: Open PDFs internally or in external viewer.
- **SyncTeX**: Forward and backward search between source and PDF.
- **Linter integration**: Error reporting via `linter-indie`. With [linter-bundle](https://github.com/asiloisad/pulsar-linter-bundle), errors display clickable references to log files.
- **Multiple builds**: Compile multiple files simultaneously.
- **Magic comments**: Per-file engine selection with `% !TEX program`.

## Installation

To install `latex-tools` search for [latex-tools](https://web.pulsar-edit.dev/packages/latex-tools) in the Install pane of the Pulsar settings or run `ppm install latex-tools`. Alternatively, you can run `ppm install asiloisad/pulsar-latex-tools` to install a package directly from the GitHub repository.

## Installing LaTeX

This package requires `latexmk` and a LaTeX distribution to be installed on your system.

**Windows:**
- [MiKTeX](https://miktex.org/download) - Recommended, includes `latexmk`
- [TeX Live](https://www.tug.org/texlive/) - Full distribution

**macOS:**
- [MacTeX](https://www.tug.org/mactex/) - Full TeX Live distribution for macOS
- Or via Homebrew: `brew install --cask mactex`

**Linux:**
- Ubuntu/Debian: `sudo apt install texlive-full latexmk`
- Fedora: `sudo dnf install texlive-scheme-full latexmk`
- Arch: `sudo pacman -S texlive-most latexmk`

After installation, verify that `latexmk` is available in your PATH:

```bash
latexmk --version
```

## Global configuration

Use the `latex-tools:global-rc` command to open your global `latexmkrc` configuration file. This file allows you to customize `latexmk` behavior, such as adding support for glossaries:

```perl
# Glossaries support
add_cus_dep('glo', 'gls', 0, 'makeglossaries');
add_cus_dep('acn', 'acr', 0, 'makeglossaries');
sub makeglossaries {
    system("makeglossaries \"$_[0]\"");
}
```

## Commands

Commands available in `atom-workspace`:

- `latex-tools:global-rc`: open the global `latexmkrc` configuration file (creates with defaults if not exists).

Commands available in `atom-text-editor[data-grammar~="latex"]`:

- `latex-tools:compile`: (`F5`) compile the current LaTeX document using `latexmk`,
- `latex-tools:toggle-compile-on-save`: (`Alt+F5`) toggle automatic compilation when the file is saved,
- `latex-tools:interrupt`: (`Ctrl+F5`) stop the current build process for the active file,
- `latex-tools:interrupt-all`: stop all running build processes,
- `latex-tools:clean`: (`F6`) remove auxiliary files generated during compilation,
- `latex-tools:clean-linter`: (`Alt+F6`) clear all linter messages,
- `latex-tools:kill-and-clean`: (`Ctrl+F6`) interrupt the build and clean auxiliary files,
- `latex-tools:open-pdf`: (`F7`) open the generated PDF in Pulsar,
- `latex-tools:synctex`: (`Alt+F7`) jump from source to corresponding PDF location (forward SyncTeX),
- `latex-tools:open-pdf-external`: (`F8`) open the generated PDF in an external viewer.

## Integration with pdf-viewer

This package works seamlessly with the [pdf-viewer](https://web.pulsar-edit.dev/packages/pdf-viewer) package:

- **SyncTeX support**: Forward and backward search between source and PDF when both packages are installed.
- **Status bar**: The LaTeX status bar remains visible when viewing PDFs, allowing you to compile, open PDF, or clean files directly from the PDF viewer.
- **Build waiting**: If you open a PDF while a build is in progress, the package will wait for completion and automatically open the updated PDF.

## Magic comments

You can specify the LaTeX engine per-file using magic comments at the top of your `.tex` file:

```latex
% !TEX program = xelatex
\documentclass{article}
...
```

Supported engines: `pdflatex`, `xelatex`, `lualatex`

The magic comment overrides the global engine setting in the package configuration.

## Multiple simultaneous builds

The package supports compiling multiple LaTeX files simultaneously. Each file tracks its own build state independently, allowing you to start a compilation in one file while another is still building. The status bar updates to show the build state of the currently active file.

## Provided Service `latex-tools`

Allows other packages to integrate with LaTeX compilation and SyncTeX. Subscribe to build events, query build status, and perform forward/backward SyncTeX lookups.

In your `package.json`:

```json
{
  "consumedServices": {
    "latex-tools": {
      "versions": {
        "1.0.0": "consumeLatexTools"
      }
    }
  }
}
```

In your main module:

```javascript
consumeLatexTools(service) {
  // Subscribe to build events
  this.subscriptions.add(
    service.onDidStartBuild(({ file }) => {
      console.log(`Build started: ${file}`);
    }),
    service.onDidFinishBuild(({ file, output }) => {
      console.log(`Build finished: ${file}`);
    }),
    service.onDidFailBuild(({ file, error, output }) => {
      console.log(`Build failed: ${file}`, error);
    }),
    service.onDidChangeBuildStatus(({ status, file, error }) => {
      console.log(`Build status changed: ${status}`);
    })
  );

  // Get current status for a specific file
  const { status, file } = service.getStatus(filePath);

  // Check if a specific file is currently building
  const building = service.isBuilding(filePath);
}
```

### Methods

| Method | Description |
| --- | --- |
| `onDidStartBuild(callback)` | Called when a build starts. Callback receives `{ file }`. |
| `onDidFinishBuild(callback)` | Called when a build succeeds. Callback receives `{ file, output }`. |
| `onDidFailBuild(callback)` | Called when a build fails. Callback receives `{ file, error, output }`. |
| `onDidChangeBuildStatus(callback)` | Called on any status change. Callback receives `{ status, file, error? }`. |
| `getStatus(filePath?)` | Returns status for a specific file or all builds if no path provided. |
| `isBuilding(filePath)` | Returns `true` if the specified file is currently being compiled. |
| `syncToPdf(file, line, column)` | Forward SyncTeX: returns `{ page, x, y }` for PDF position. |
| `syncToSource(file, page, x, y)` | Backward SyncTeX: returns `{ file, line, column }` and opens the source. |

### Status values

- `'idle'` — No build in progress
- `'building'` — Build is currently running
- `'success'` — Last build completed successfully
- `'error'` — Last build failed

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub — any feedback's welcome!
