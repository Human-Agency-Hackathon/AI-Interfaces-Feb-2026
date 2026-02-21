/** Padding (in canvas pixels) around the room diorama. */
const ROOM_PADDING = 24;

export class CameraController {
  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private followingAgent: string | null = null;

  constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number, tileSize: number) {
    this.scene = scene;
    this.camera = scene.cameras.main;

    this.fitRoom(mapWidth, mapHeight, tileSize);
  }

  /** Call from scene.update() each frame — currently a no-op (room fits in view) */
  update(): void {
    // No keyboard scrolling needed; the whole room is visible.
  }

  /** Smoothly pan to center on a position (used when clicking an agent) */
  panTo(x: number, y: number, agentId?: string): void {
    this.followingAgent = agentId ?? null;
    // Room already fits in view — no panning needed in diorama mode
  }

  /** Snap to a position instantly (used for initial camera placement) */
  snapTo(x: number, y: number): void {
    // Room already centered via fitRoom — ignore positional snaps
  }

  /** Check if currently following a specific agent */
  isFollowing(agentId: string): boolean {
    return this.followingAgent === agentId;
  }

  /** Stop following any agent */
  clearFollow(): void {
    this.followingAgent = null;
  }

  /** Update camera bounds when navigating to a differently-sized room */
  updateBounds(mapWidth: number, mapHeight: number, tileSize: number): void {
    this.fitRoom(mapWidth, mapHeight, tileSize);
  }

  /**
   * Zoom and center the camera so the entire room fits inside the
   * 640×480 canvas with padding — creating a "diorama" framing.
   */
  private fitRoom(mapWidth: number, mapHeight: number, tileSize: number): void {
    const roomPxW = mapWidth * tileSize;
    const roomPxH = mapHeight * tileSize;
    const canvasW = this.camera.width;   // 640
    const canvasH = this.camera.height;  // 480

    // How much do we need to zoom out so the room + padding fits?
    const availW = canvasW - ROOM_PADDING * 2;
    const availH = canvasH - ROOM_PADDING * 2;
    const zoom = Math.min(availW / roomPxW, availH / roomPxH, 1);

    this.camera.setZoom(zoom);

    // Remove bounds so the camera can center freely (dark bg fills the rest)
    this.camera.removeBounds();

    // Center camera on the middle of the room
    const centerX = roomPxW / 2;
    const centerY = roomPxH / 2;
    this.camera.centerOn(centerX, centerY);
  }
}
