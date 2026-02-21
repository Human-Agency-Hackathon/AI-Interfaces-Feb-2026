const ROOM_PADDING = 24;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.25;

export class CameraController {
  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private followTarget: { x: number; y: number } | null = null;
  private followingAgent: string | null = null;
  private mode: 'diorama' | 'follow' = 'diorama';
  private currentZoom = 1.0;
  private mapWidthPx = 0;
  private mapHeightPx = 0;

  constructor(
    scene: Phaser.Scene,
    mapWidth: number,
    mapHeight: number,
    tileSize: number
  ) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.mapWidthPx = mapWidth * tileSize;
    this.mapHeightPx = mapHeight * tileSize;
    this.fitRoom(mapWidth, mapHeight, tileSize);
  }

  setMode(mode: 'diorama' | 'follow'): void {
    this.mode = mode;
    if (mode === 'follow') {
      this.currentZoom = 1.0;
      this.camera.setZoom(1);
    }
  }

  getZoom(): number {
    return this.currentZoom;
  }

  setZoom(level: number): void {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
    this.currentZoom = clamped;
    this.scene.tweens.add({
      targets: this.camera,
      props: { zoom: { value: clamped } },
      duration: 200,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.updateBoundsForZoom();
      },
    });
  }

  zoomIn(): void {
    this.setZoom(this.currentZoom + ZOOM_STEP);
  }

  zoomOut(): void {
    this.setZoom(this.currentZoom - ZOOM_STEP);
  }

  fitToMap(mapWidth: number, mapHeight: number, tileSize: number): void {
    const mapPxW = mapWidth * tileSize;
    const mapPxH = mapHeight * tileSize;
    const zoom = Math.min(this.camera.width / mapPxW, this.camera.height / mapPxH);
    this.mapWidthPx = mapPxW;
    this.mapHeightPx = mapPxH;
    this.currentZoom = zoom;
    this.scene.tweens.add({
      targets: this.camera,
      props: { zoom: { value: zoom } },
      duration: 200,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.camera.centerOn(mapPxW / 2, mapPxH / 2);
        this.updateBoundsForZoom();
      },
    });
  }

  private updateBoundsForZoom(): void {
    if (this.mode === 'follow' && this.mapWidthPx > 0) {
      this.camera.setBounds(0, 0, this.mapWidthPx, this.mapHeightPx);
    }
  }

  update(): void {
    if (this.mode === 'follow' && this.followTarget) {
      const cam = this.camera;
      cam.scrollX += (this.followTarget.x - cam.scrollX - cam.width / 2) * 0.08;
      cam.scrollY += (this.followTarget.y - cam.scrollY - cam.height / 2) * 0.08;
    }
  }

  /** Smoothly pan to a pixel position. If agentId is provided, camera will track that agent's movements. */
  panTo(x: number, y: number, agentId?: string): void {
    this.followTarget = { x, y };
    if (agentId) this.followingAgent = agentId;
  }

  snapTo(x: number, y: number): void {
    if (this.mode === 'follow') {
      const cam = this.camera;
      cam.scrollX = x - cam.width / 2;
      cam.scrollY = y - cam.height / 2;
      this.followTarget = { x, y };
    }
  }

  /** Scroll camera by a pixel delta. Clears any agent follow. */
  scrollBy(dx: number, dy: number): void {
    this.followingAgent = null;
    this.followTarget = null;
    this.camera.scrollX += dx;
    this.camera.scrollY += dy;
  }

  isFollowing(agentId: string): boolean {
    return this.followingAgent === agentId;
  }

  clearFollow(): void {
    this.followingAgent = null;
    this.followTarget = null;
  }

  updateBounds(mapWidth: number, mapHeight: number, tileSize: number): void {
    this.mapWidthPx = mapWidth * tileSize;
    this.mapHeightPx = mapHeight * tileSize;
    if (this.mode === 'diorama') {
      this.fitRoom(mapWidth, mapHeight, tileSize);
    } else {
      this.camera.setBounds(0, 0, this.mapWidthPx, this.mapHeightPx);
    }
  }

  private fitRoom(mapWidth: number, mapHeight: number, tileSize: number): void {
    const cam = this.camera;
    const roomPxW = mapWidth * tileSize;
    const roomPxH = mapHeight * tileSize;
    const availW = cam.width - ROOM_PADDING * 2;
    const availH = cam.height - ROOM_PADDING * 2;
    const zoom = Math.min(availW / roomPxW, availH / roomPxH, 1);
    cam.setZoom(zoom);
    cam.removeBounds();
    cam.centerOn(roomPxW / 2, roomPxH / 2);
  }
}
