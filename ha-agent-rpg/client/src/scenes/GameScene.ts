import { WebSocketClient } from '../network/WebSocketClient';
import { MapRenderer } from '../systems/MapRenderer';
import { AgentSprite } from '../systems/AgentSprite';
import { PlayerSprite } from '../systems/PlayerSprite';
import { EffectSystem } from '../systems/EffectSystem';
import { CameraController } from '../systems/CameraController';
import { MapObjectSprite } from '../systems/MapObjectSprite';
import { ThoughtBubble } from '../systems/ThoughtBubble';
import type {
  WorldStateMessage,
  AgentJoinedMessage,
  AgentLeftMessage,
  ActionResultMessage,
  AgentThoughtMessage,
  AgentActivityMessage,
  AgentInfo,
  MapObject,
  MapChangeMessage,
  RealmPresenceMessage,
  RealmTreeMessage,
} from '../types';

export class GameScene extends Phaser.Scene {
  private wsClient!: WebSocketClient;
  private mapRenderer: MapRenderer | null = null;
  private agentSprites: Map<string, AgentSprite> = new Map();
  private playerSprite: PlayerSprite | null = null;
  private effectSystem!: EffectSystem;
  private cameraController: CameraController | null = null;
  private mapObjectSprites: MapObjectSprite[] = [];
  private thoughtBubble!: ThoughtBubble;
  private objects: MapObject[] = [];
  private currentMapDimensions: { width: number; height: number } | null = null;
  private arrowKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private isPlayerMoving = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.effectSystem = new EffectSystem(this, this.agentSprites);
    this.thoughtBubble = new ThoughtBubble(this);
    this.wsClient = new WebSocketClient('ws://localhost:3001');

    // Setup keyboard controls for player movement (arrow keys only)
    if (this.input.keyboard) {
      // Disable global key capture so DOM inputs (textarea) receive all key events
      // without Phaser calling preventDefault() on them.
      this.input.keyboard.disableGlobalCapture();
      this.arrowKeys = this.input.keyboard.createCursorKeys();
    }

    this.wsClient.on('world:state', (msg) => {
      const state = msg as unknown as WorldStateMessage;
      if (!this.mapRenderer) {
        // First render — create map renderer and camera
        this.mapRenderer = new MapRenderer(this, state.map);
        this.mapRenderer.render();
        this.currentMapDimensions = { width: state.map.width, height: state.map.height };

        // Create camera controller with actual map dimensions
        this.cameraController = new CameraController(
          this,
          state.map.width,
          state.map.height,
          state.map.tile_size,
        );

        // Snap camera to oracle
        const oracle = state.agents.find((a) => a.agent_id === 'oracle');
        const tileSize = state.map.tile_size;
        if (oracle) {
          this.cameraController.snapTo(
            oracle.x * tileSize + tileSize / 2,
            oracle.y * tileSize + tileSize / 2,
          );
        }
      } else {
        // Subsequent world:state — reload tilemap (e.g. new agent room added)
        this.mapRenderer.loadMap(state.map);
        // Update camera bounds if map dimensions changed
        if (
          state.map.width !== this.currentMapDimensions?.width ||
          state.map.height !== this.currentMapDimensions?.height
        ) {
          this.cameras.main.setBounds(
            0, 0,
            state.map.width * state.map.tile_size,
            state.map.height * state.map.tile_size,
          );
          this.currentMapDimensions = { width: state.map.width, height: state.map.height };
        }
      }

      // Store objects and create sprites for map objects
      if (state.objects && state.objects.length > 0) {
        this.objects = state.objects;
        // Clear old object sprites
        for (const sprite of this.mapObjectSprites) {
          sprite.destroy();
        }
        this.mapObjectSprites = [];
        // Create new object sprites
        for (const obj of state.objects) {
          this.mapObjectSprites.push(new MapObjectSprite(this, obj));
        }
      }

      // Sync agent sprites
      for (const agent of state.agents) {
        if (agent.agent_id === 'oracle') {
          // Create player sprite for Oracle instead of regular agent sprite
          if (!this.playerSprite) {
            this.playerSprite = new PlayerSprite(this, agent.x, agent.y, agent.name);
          } else {
            this.playerSprite.setPosition(agent.x, agent.y);
          }
        } else if (!this.agentSprites.has(agent.agent_id)) {
          this.createAgentSprite(agent);
        }
      }
    });

    this.wsClient.on('agent:joined', (msg) => {
      const data = msg as unknown as AgentJoinedMessage;
      if (!this.agentSprites.has(data.agent.agent_id)) {
        this.createAgentSprite(data.agent);
      }
    });

    this.wsClient.on('agent:left', (msg) => {
      const data = msg as unknown as AgentLeftMessage;
      const sprite = this.agentSprites.get(data.agent_id);
      if (sprite) {
        sprite.destroy();
        this.agentSprites.delete(data.agent_id);
      }
    });

    this.wsClient.on('action:result', (msg) => {
      const result = msg as unknown as ActionResultMessage;
      if (!result.success) return;
      this.handleAction(result);
    });

    this.wsClient.on('agent:thought', (msg) => {
      const data = msg as unknown as AgentThoughtMessage;
      const sprite = this.agentSprites.get(data.agent_id);
      if (sprite) {
        this.thoughtBubble.show(sprite.getX(), sprite.getY(), data.text);
      }
      // Forward to UIScene for dialogue log
      this.scene.get('UIScene').events.emit('agent-thought', data);
    });

    this.wsClient.on('agent:activity', (msg) => {
      const data = msg as unknown as AgentActivityMessage;
      this.scene.get('UIScene').events.emit('agent-activity', data);
    });

    this.wsClient.on('map:change', (msg) => {
      const data = msg as unknown as MapChangeMessage;
      this.cameras.main.fadeOut(300, 0, 0, 0);

      this.cameras.main.once('camerafadeoutcomplete', () => {
        // Destroy existing map object sprites
        this.mapObjectSprites.forEach(s => s.destroy());
        this.mapObjectSprites = [];

        // Swap the tilemap
        if (this.mapRenderer) {
          this.mapRenderer.loadMap(data.map);
        }

        // Create sprites for all objects (nav doors now have visual + click handling)
        for (const obj of data.objects ?? []) {
          this.mapObjectSprites.push(new MapObjectSprite(this, obj));
        }

        // Fade back in
        this.cameras.main.fadeIn(300, 0, 0, 0);
      });
    });

    this.wsClient.on('realm:presence', (msg) => {
      const data = msg as unknown as RealmPresenceMessage;
      this.events.emit('realm-presence', data.players);
    });

    this.wsClient.on('realm:tree', (msg) => {
      const data = msg as unknown as RealmTreeMessage;
      this.events.emit('realm-tree', data.root);
    });

    // Player nav door clicks
    this.events.on('nav-click', (obj: MapObject) => {
      if (obj.type === 'nav_door') {
        const targetPath = obj.metadata.targetPath as string;
        this.wsClient.send({ type: 'player:navigate-enter', target_path: targetPath });
      } else if (obj.type === 'nav_back') {
        this.wsClient.send({ type: 'player:navigate-back' });
      }
    });

    this.wsClient.connect();
  }

  /** Phaser update loop — runs every frame */
  update(): void {
    if (this.cameraController) {
      this.cameraController.update();
    }

    // Handle player movement input
    this.handlePlayerInput();
  }

  private handlePlayerInput(): void {
    // Don't process input if player is already moving
    if (this.isPlayerMoving || !this.playerSprite) return;

    // Don't steal arrow keys while the user is typing in a text field
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

    let direction: 'up' | 'down' | 'left' | 'right' | null = null;

    if (this.arrowKeys.up.isDown) {
      direction = 'up';
    } else if (this.arrowKeys.down.isDown) {
      direction = 'down';
    } else if (this.arrowKeys.left.isDown) {
      direction = 'left';
    } else if (this.arrowKeys.right.isDown) {
      direction = 'right';
    }

    if (direction) {
      this.movePlayer(direction);
    }
  }

  private movePlayer(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (!this.playerSprite) return;

    const currentX = this.playerSprite.getTileX();
    const currentY = this.playerSprite.getTileY();
    let targetX = currentX;
    let targetY = currentY;

    switch (direction) {
      case 'up':
        targetY -= 1;
        break;
      case 'down':
        targetY += 1;
        break;
      case 'left':
        targetX -= 1;
        break;
      case 'right':
        targetX += 1;
        break;
    }

    // Check if target tile is walkable
    if (this.isWalkable(targetX, targetY)) {
      this.isPlayerMoving = true;

      // Send movement to server
      this.wsClient.send({
        type: 'player:move',
        direction: direction,
      });

      // Animate player sprite
      this.playerSprite.walkTo(targetX, targetY, () => {
        this.isPlayerMoving = false;
      });

      // Update camera to follow player
      if (this.cameraController) {
        const TILE_SIZE = 32;
        const px = targetX * TILE_SIZE + TILE_SIZE / 2;
        const py = targetY * TILE_SIZE + TILE_SIZE / 2;
        this.cameraController.panTo(px, py);
      }
    }
  }

  private isWalkable(x: number, y: number): boolean {
    if (!this.mapRenderer) return false;

    const map = this.mapRenderer.getMap();

    // Check bounds
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
      return false;
    }

    // Check tile type (0 = grass/walkable, 1 = wall, 2 = water)
    const tile = map.tiles[y][x];
    if (tile === 1 || tile === 2) {
      return false;
    }

    // Check for collision with objects
    for (const obj of this.objects) {
      if (obj.x === x && obj.y === y && obj.type !== 'nav_door' && obj.type !== 'nav_back') {
        return false;
      }
    }

    return true;
  }

  private createAgentSprite(agent: AgentInfo): void {
    const sprite = new AgentSprite(this, agent);
    this.agentSprites.set(agent.agent_id, sprite);

    // Click-to-follow: clicking an agent pans camera to them
    sprite.setInteractive();
    sprite.on('pointerdown', () => {
      if (this.cameraController) {
        this.cameraController.panTo(sprite.getX(), sprite.getY(), agent.agent_id);
      }
    });
  }

  private handleAction(result: ActionResultMessage): void {
    const sprite = this.agentSprites.get(result.agent_id);
    if (!sprite) return;

    switch (result.action) {
      case 'move':
        sprite.walkTo(
          result.params.x as number,
          result.params.y as number
        );
        // If following this agent, smoothly track the movement
        if (this.cameraController && this.cameraController.isFollowing(result.agent_id)) {
          const TILE_SIZE = 32;
          const targetX = (result.params.x as number) * TILE_SIZE + TILE_SIZE / 2;
          const targetY = (result.params.y as number) * TILE_SIZE + TILE_SIZE / 2;
          this.cameraController.panTo(targetX, targetY, result.agent_id);
        }
        break;

      case 'speak':
        this.scene.get('UIScene').events.emit('show-dialogue', {
          agent_id: result.agent_id,
          name: sprite.agentName,
          text: result.params.text as string,
          color: sprite.agentColor,
        });
        break;

      case 'think':
        // Show thought bubble above the agent
        this.thoughtBubble.show(
          sprite.getX(),
          sprite.getY(),
          result.params.text as string,
        );
        // Forward to UIScene for dialogue log
        this.scene.get('UIScene').events.emit('agent-thought', {
          agent_id: result.agent_id,
          text: result.params.text as string,
        });
        break;

      case 'skill':
        this.effectSystem.playSkillEffect(result.agent_id, result.params);
        break;

      case 'emote':
        sprite.showEmote(result.params.type as string);
        break;

      case 'wait':
        sprite.playIdle();
        break;

      case 'interact':
        sprite.playInteract();
        break;
    }
  }
}
