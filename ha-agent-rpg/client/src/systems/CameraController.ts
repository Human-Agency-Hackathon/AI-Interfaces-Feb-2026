const ROOM_PADDING = 24;

export class CameraController {
  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private followTarget: { x: number; y: number } | null = null;
  private followingAgent: string | null = null;
  private mode: 'diorama' | 'follow' = 'diorama';

  constructor(
    scene: Phaser.Scene,
    mapWidth: number,
    mapHeight: number,
    tileSize: number
  ) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.fitRoom(mapWidth, mapHeight, tileSize);
  }

  setMode(mode: 'diorama' | 'follow'): void {
    this.mode = mode;
    if (mode === 'follow') {
      this.camera.setZoom(1);
    }
  }

  update(): void {
    if (this.mode === 'follow' && this.followTarget) {
      const cam = this.camera;
      const targetX = this.followTarget.x * 32 + 16;
      const targetY = this.followTarget.y * 32 + 16;
      cam.scrollX += (targetX - cam.scrollX - cam.width / 2) * 0.08;
      cam.scrollY += (targetY - cam.scrollY - cam.height / 2) * 0.08;
    }
  }

  panTo(x: number, y: number, agentId?: string): void {
    this.followTarget = { x, y };
    if (agentId) this.followingAgent = agentId;
  }

  snapTo(x: number, y: number): void {
    if (this.mode === 'follow') {
      const cam = this.camera;
      cam.scrollX = x * 32 + 16 - cam.width / 2;
      cam.scrollY = y * 32 + 16 - cam.height / 2;
      this.followTarget = { x, y };
    }
  }

  isFollowing(agentId: string): boolean {
    return this.followingAgent === agentId;
  }

  clearFollow(): void {
    this.followingAgent = null;
    this.followTarget = null;
  }

  updateBounds(mapWidth: number, mapHeight: number, tileSize: number): void {
    if (this.mode === 'diorama') {
      this.fitRoom(mapWidth, mapHeight, tileSize);
    } else {
      this.camera.setBounds(0, 0, mapWidth * tileSize, mapHeight * tileSize);
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
