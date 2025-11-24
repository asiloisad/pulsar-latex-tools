# Build Service API

The latex-tools package provides a build service that other packages can consume to be notified about LaTeX build events.

## Consuming the Service

### In your package.json

```json
{
  "consumedServices": {
    "latex-tools.build": {
      "versions": {
        "1.0.0": "consumeLatexBuildService"
      }
    }
  }
}
```

### In your main package file

```javascript
export default {
  buildService: null,

  consumeLatexBuildService(service) {
    this.buildService = service;

    // Listen for build start
    this.buildService.onDidStartBuild(({ file }) => {
      console.log(`LaTeX build started for: ${file}`);
    });

    // Listen for successful build
    this.buildService.onDidFinishBuild(({ file, output }) => {
      console.log(`LaTeX build finished for: ${file}`);
    });

    // Listen for failed build
    this.buildService.onDidFailBuild(({ file, error, output }) => {
      console.log(`LaTeX build failed for: ${file}`);
      console.log(`Error: ${error}`);
    });

    // Listen for any status change
    this.buildService.onDidChangeBuildStatus(({ status, file, error }) => {
      console.log(`Build status changed to: ${status}`);
      // status can be: 'idle', 'building', 'success', 'error'
    });

    // Get current build status
    const currentStatus = this.buildService.getStatus();
    console.log(currentStatus); // { status: 'idle', file: null }
  }
}
```

## API Methods

### Event Listeners

All event listener methods return a `Disposable` that can be used to unsubscribe:

#### `onDidStartBuild(callback)`
Called when a build starts.
- **callback**: `({ file: string }) => void`

#### `onDidFinishBuild(callback)`
Called when a build finishes successfully.
- **callback**: `({ file: string, output: string }) => void`

#### `onDidFailBuild(callback)`
Called when a build fails.
- **callback**: `({ file: string, error: string, output: string }) => void`

#### `onDidChangeBuildStatus(callback)`
Called whenever the build status changes (start, success, error, idle).
- **callback**: `({ status: string, file: string|null, error?: string }) => void`
- **status**: One of `'idle'`, `'building'`, `'success'`, `'error'`

### Status Query

#### `getStatus()`
Returns the current build status.
- **Returns**: `{ status: string, file: string|null }`

## Example Use Cases

### PDF Viewer Package
A PDF viewer package could consume this service to automatically reload the PDF when a build completes:

```javascript
consumeLatexBuildService(service) {
  this.buildService = service;
  
  this.buildService.onDidFinishBuild(({ file }) => {
    const pdfPath = file.replace('.tex', '.pdf');
    this.reloadPdfViewer(pdfPath);
  });
}
```

### Build Progress Package
A package showing build progress in a panel:

```javascript
consumeLatexBuildService(service) {
  this.buildService = service;
  
  this.buildService.onDidChangeBuildStatus(({ status, file }) => {
    if (status === 'building') {
      this.showProgressPanel(file);
    } else if (status === 'success' || status === 'error') {
      this.hideProgressPanel();
    }
  });
}
```

### Error Highlighting Package
A package that highlights LaTeX errors in the editor:

```javascript
consumeLatexBuildService(service) {
  this.buildService = service;
  
  this.buildService.onDidFailBuild(({ file, output }) => {
    const errors = this.parseLatexErrors(output);
    this.highlightErrorsInEditor(file, errors);
  });
  
  this.buildService.onDidFinishBuild(() => {
    this.clearErrorHighlights();
  });
}
```
