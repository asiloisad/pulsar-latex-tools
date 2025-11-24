# latex-tools

LaTeX tools for Pulsar editor.

- **Compilation**: Compile LaTeX documents using `latexmk`.
- **PDF Viewing**: Open generated PDFs internally in Pulsar or in an external viewer.
- **SyncTeX**: Support for forward and backward search between source and PDF.
- **Clean**: Remove auxiliary files generated during compilation.
- **Linter**: Integrated error reporting via `linter-indie`.

## Installation

To install `latex-tools` search for [latex-tools](https://web.pulsar-edit.dev/packages/latex-tools) in the Install pane of the Pulsar settings or run `ppm install latex-tools`. Alternatively, you can run `ppm install asiloisad/pulsar-latex-tools` to install a package directly from the GitHub repository.

## Provided Service

The package provides a `latex-tools.build` service (version `1.0.0`) that allows other packages to monitor LaTeX build status.

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

  // Get current status
  const { status, file } = service.getStatus();
}
```

| Method | Description |
|--------|-------------|
| `onDidStartBuild(callback)` | Called when a build starts. Callback receives `{ file }`. |
| `onDidFinishBuild(callback)` | Called when a build succeeds. Callback receives `{ file, output }`. |
| `onDidFailBuild(callback)` | Called when a build fails. Callback receives `{ file, error, output }`. |
| `onDidChangeBuildStatus(callback)` | Called on any status change. Callback receives `{ status, file, error? }`. |
| `getStatus()` | Returns current status object `{ status, file }`. |

# Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub — any feedback's welcome!
