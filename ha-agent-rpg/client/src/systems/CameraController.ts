const SCROLL_SPEED = 8;

export class CameraController {
  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private followingAgent: string | null = null;

  constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number, tileSize: number) {
    this.scene = scene;
    this.camera = scene.cameras.main;

    // Set camera bounds to map size
    this.camera.setBounds(0, 0, mapWidth * tileSize, mapHeight * tileSize);

    // Arrow keys
    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();

      // WASD keys
      this.wasd = {
        w: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        a: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        s: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        d: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }
  }

  /** Call from scene.update() each frame */
  update(): void {
    let dx = 0;
    let dy = 0;

    // Keyboard scrolling (arrows + WASD)
    if (this.cursors) {
      if (this.cursors.left.isDown) dx -= SCROLL_SPEED;
      if (this.cursors.right.isDown) dx += SCROLL_SPEED;
      if (this.cursors.up.isDown) dy -= SCROLL_SPEED;
      if (this.cursors.down.isDown) dy += SCROLL_SPEED;
    }
    if (this.wasd) {
      if (this.wasd.a.isDown) dx -= SCROLL_SPEED;
      if (this.wasd.d.isDown) dx += SCROLL_SPEED;
      if (this.wasd.w.isDown) dy -= SCROLL_SPEED;
      if (this.wasd.s.isDown) dy += SCROLL_SPEED;
    }

    // If player is manually scrolling, break follow
    if ((dx !== 0 || dy !== 0) && this.followingAgent) {
      this.followingAgent = null;
    }

    if (dx !== 0 || dy !== 0) {
      this.camera.scrollX += dx;
      this.camera.scrollY += dy;
    }
  }

  /** Smoothly pan to center on a position (used when clicking an agent) */
  panTo(x: number, y: number, agentId?: string): void {
    // Kill any existing camera tweens so they don't fight
    this.scene.tweens.killTweensOf(this.camera);

    this.followingAgent = agentId ?? null;

    const halfW = this.camera.width / 2;
    const halfH = this.camera.height / 2;

    this.scene.tweens.add({
      targets: this.camera,
      scrollX: x - halfW,
      scrollY: y - halfH,
      duration: 400,
      ease: 'Power2',
    });
  }

  /** Snap to a position instantly (used for initial camera placement) */
  snapTo(x: number, y: number): void {
    const halfW = this.camera.width / 2;
    const halfH = this.camera.height / 2;
    this.camera.setScroll(x - halfW, y - halfH);
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
    this.camera.setBounds(0, 0, mapWidth * tileSize, mapHeight * tileSize);
  }
}
