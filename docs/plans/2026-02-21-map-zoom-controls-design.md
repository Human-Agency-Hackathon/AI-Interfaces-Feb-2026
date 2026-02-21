# Map Zoom Controls Design

## Summary

Add visible zoom controls (+, -, FIT) to the fog-of-war map, allowing users to zoom in/out and fit the entire 120x120 tile map in the viewport.

## Decisions

- **Scope:** Fog-of-war mode only (diorama rooms already auto-fit)
- **Placement:** Bottom-right corner, stacked vertically
- **Zoom range:** 0.25x to 2.0x, step 0.25x
- **FIT:** Calculates zoom to show all 120x120 tiles, centers camera
- **Implementation:** DOM elements (HTML/CSS), consistent with existing panels
- **Architecture:** Standalone `ZoomControls` panel class, extends `CameraController`

## Components

### ZoomControls.ts (new, `client/src/ui/`)

DOM panel with three buttons:

- `+` button: calls `cameraController.zoomIn()`
- `-` button: calls `cameraController.zoomOut()`
- `FIT` button: calls `cameraController.fitToMap()`

Properties:
- Container div with three button children
- Positioned: `bottom: 80px; right: 16px` (above prompt bar)
- `show()` / `hide()` / `destroy()` lifecycle methods

### CameraController.ts (extended)

New properties:
- `currentZoom = 1.0`
- `MIN_ZOOM = 0.25`, `MAX_ZOOM = 2.0`, `ZOOM_STEP = 0.25`

New methods:
- `setZoom(level: number)`: Tween `cam.zoom` over 200ms, update bounds
- `fitToMap()`: Calculate `min(viewportW / mapPxW, viewportH / mapPxH)`, set zoom, center camera
- `zoomIn()`: `currentZoom + ZOOM_STEP`, clamped
- `zoomOut()`: `currentZoom - ZOOM_STEP`, clamped

Camera bounds recalculated after each zoom change.

### GameScene.ts (modified)

- Create `ZoomControls` when entering fog-of-war mode
- Destroy when switching to diorama mode
- Pass `CameraController` reference to `ZoomControls`

## Button Styling

- Size: 48x48px
- Border-radius: 6px
- Background: `rgba(0,0,0,0.6)`, hover `rgba(0,0,0,0.8)`
- Text: white, bold
- Font size: 24px for +/-, 14px for FIT
- Gap: 4px between buttons
- z-index: 100

## Data Flow

```
User clicks [+] -> ZoomControls.zoomIn() -> CameraController.zoomIn()
  -> cam.zoom tweened -> bounds recalculated
```

```
User clicks [FIT] -> ZoomControls.fitToMap() -> CameraController.fitToMap()
  -> zoom to fit 120x120 -> cam centered on map
```

## Edge Cases

- Zoom clamped to [0.25, 2.0]
- FIT always fits full 120x120 map (fog is visual, bounds are constant)
- Agent follow continues at new zoom level
- Buttons hidden/destroyed on diorama mode switch, re-shown on return to fog mode
