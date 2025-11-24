# latex-tools

LaTeX compilation tools for Pulsar editor.

## Features

- Compile LaTeX files using `latexmk`
- Automatic BibTeX support
- PDF generation
- **Status bar indicator** showing build progress

## Requirements

- `latexmk` must be installed and available in your PATH

## Usage

### Compile Current File

- **Command**: `latex-tools:compile`
- **Keybinding**: `Ctrl-Alt-B` (in LaTeX files)

The compiler will:
- Save your file
- Run `latexmk -pdf -bibtex`
- Show success/error notifications
- Update status bar indicator
- Generate PDF in the same directory

### Status Bar Indicator

The status bar (bottom right) shows:
- **Building...** - Compilation in progress (spinning icon)
- **Build succeeded** - Successful compilation (green checkmark, auto-hides after 3s)
- **Build failed** - Compilation error (red X, auto-hides after 5s)
- **LaTeX** - Idle state (PDF icon)

## Installation

Link the package to Pulsar:

```bash
cd C:\Data\Develop\Pulsar\latex-tools
ppm link
```

Then reload Pulsar.
