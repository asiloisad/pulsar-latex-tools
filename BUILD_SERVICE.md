# Build Service API

The `latex-tools` package provides a build service that other packages can consume to be notified about LaTeX compilation events.

## Consuming the Service

Add to your `package.json`:

```json
{
  "consumedServices": {
    "latex-tools.build": {
      "versions": {
        "1.0.0": "consumeLatexBuild"
      }
    }
  }
}
```

In your package's main file:

```javascript
export default {
  consumeLatexBuild(buildService) {
    // Subscribe to build events
    this.subscriptions.add(
      buildService.onBuildStarted(({ filePath }) => {
        console.log('LaTeX build started:', filePath);
      })
    );

    this.subscriptions.add(
      buildService.onBuildSucceeded(({ filePath }) => {
        console.log('LaTeX build succeeded:', filePath);
      })
    );

    this.subscriptions.add(
      buildService.onBuildFailed(({ filePath, error }) => {
        console.log('LaTeX build failed:', filePath, error);
      })
    );

    // Get current status
    const status = buildService.getStatus();
    console.log('Current status:', status);

    // Check if building
    if (buildService.isBuilding()) {
      console.log('Build in progress');
    }
  }
}
```

## API Methods

### `getStatus()`
Returns current build status object:
```javascript
{
  status: 'idle' | 'building' | 'success' | 'error',
  currentFile: string | null,
  lastError: object | null
}
```

### `isBuilding()`
Returns `true` if a build is currently in progress.

### Event Listeners

#### `onBuildStarted(callback)`
Called when a build starts.
- `callback({ filePath })` - Receives the path of the file being compiled

#### `onBuildSucceeded(callback)`
Called when a build completes successfully.
- `callback({ filePath })` - Receives the path of the compiled file

#### `onBuildFailed(callback)`
Called when a build fails.
- `callback({ filePath, error })` - Receives the path and error details

All event listeners return a `Disposable` that should be added to your subscriptions.

## Example Use Cases

- Auto-refresh PDF viewers when compilation succeeds
- Show build progress in custom UI elements
- Collect build statistics
- Integrate with project management tools
- Trigger post-build actions (e.g., file copying, deployment)
