# latex-tools

LaTeX tools for Pulsar editor.

- **Compilation**: Compile LaTeX documents using `latexmk`.
- **PDF Viewing**: Open generated PDFs internally in Pulsar or in an external viewer.
- **SyncTeX**: Support for forward and backward search between source and PDF.
- **Clean**: Remove auxiliary files generated during compilation.
- **Linter**: Integrated error reporting via `linter-indie`.
- **Multiple Builds**: Support for compiling multiple files simultaneously.

## Installation

To install `latex-tools` search for [latex-tools](https://web.pulsar-edit.dev/packages/latex-tools) in the Install pane of the Pulsar settings or run `ppm install latex-tools`. Alternatively, you can run `ppm install asiloisad/pulsar-latex-tools` to install a package directly from the GitHub repository.

## Commands

| Command | Description |
|---------|-------------|
| `latex-tools:compile` | Compile the current LaTeX document using `latexmk`. |
| `latex-tools:open-pdf` | Open the generated PDF in Pulsar (requires [pdf-viewer](https://web.pulsar-edit.dev/packages/pdf-viewer)). |
| `latex-tools:open-pdf-external` | Open the generated PDF in an external viewer. |
| `latex-tools:clean` | Remove auxiliary files generated during compilation. |
| `latex-tools:clean-linter` | Clear all linter messages. |
| `latex-tools:interrupt` | Stop the current build process for the active file. |
| `latex-tools:interrupt-all` | Stop all running build processes. |
| `latex-tools:kill-and-clean` | Interrupt the build and clean auxiliary files. |
| `latex-tools:toggle-compile-on-save` | Toggle automatic compilation when the file is saved. |
| `latex-tools:global-rc` | Open the global `latexmkrc` configuration file (creates with defaults if not exists). |

## Integration with pdf-viewer

This package works seamlessly with the [pdf-viewer](https://web.pulsar-edit.dev/packages/pdf-viewer) package:

- **SyncTeX support**: Forward and backward search between source and PDF when both packages are installed.
- **Status bar**: The LaTeX status bar remains visible when viewing PDFs, allowing you to compile, open PDF, or clean files directly from the PDF viewer.
- **Build waiting**: If you open a PDF while a build is in progress, the package will wait for completion and automatically open the updated PDF.

## Multiple Simultaneous Builds

The package supports compiling multiple LaTeX files simultaneously. Each file tracks its own build state independently, allowing you to start a compilation in one file while another is still building. The status bar updates to show the build state of the currently active file.

## Provided Service

The package provides a `latex-tools.build` service (version `1.0.0`) that allows other packages to monitor LaTeX build status.

### Usage

In your package's `package.json`, add the consumed service:

```json
{
  "consumedServices": {
    "latex-tools.build": {
      "versions": {
        "1.0.0": "consumeBuildService"
      }
    }
  }
}
```

Then in your package's main module:

```javascript
consumeBuildService(service) {
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

### API

#### Methods

| Method | Description |
|--------|-------------|
| `onDidStartBuild(callback)` | Called when a build starts. Callback receives `{ file }`. |
| `onDidFinishBuild(callback)` | Called when a build succeeds. Callback receives `{ file, output }`. |
| `onDidFailBuild(callback)` | Called when a build fails. Callback receives `{ file, error, output }`. |
| `onDidChangeBuildStatus(callback)` | Called on any status change. Callback receives `{ status, file, error? }`. |
| `getStatus(filePath?)` | Returns status for a specific file or all builds if no path provided. |
| `isBuilding(filePath)` | Returns `true` if the specified file is currently being compiled. |

#### Status Values

- `'idle'` - No build in progress
- `'building'` - Build is currently running
- `'success'` - Last build completed successfully
- `'error'` - Last build failed

# Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub — any feedback's welcome!
