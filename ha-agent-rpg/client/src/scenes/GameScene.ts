import { WebSocketClient } from '../network/WebSocketClient';
import { MapRenderer } from '../systems/MapRenderer';
import { AgentSprite } from '../systems/AgentSprite';
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
  private effectSystem!: EffectSystem;
  private cameraController: CameraController | null = null;
  private mapObjectSprites: MapObjectSprite[] = [];
  private thoughtBubble!: ThoughtBubble;
  private objects: MapObject[] = [];

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.effectSystem = new EffectSystem(this, this.agentSprites);
    this.thoughtBubble = new ThoughtBubble(this);
    this.wsClient = new WebSocketClient('ws://localhost:3001');

    this.wsClient.on('world:state', (msg) => {
      const state = msg as unknown as WorldStateMessage;
      // Only render map once
      if (!this.mapRenderer) {
        this.mapRenderer = new MapRenderer(this, state.map);
        this.mapRenderer.render();

        // Create camera controller with actual map dimensions
        this.cameraController = new CameraController(
          this,
          state.map.width,
          state.map.height,
          state.map.tile_size,
        );

        // Snap to oracle, then pan down to reveal nav doors at map bottom
        const oracle = state.agents.find((a) => a.agent_id === 'oracle');
        const tileSize = state.map.tile_size;
        if (oracle) {
          this.cameraController.snapTo(
            oracle.x * tileSize + tileSize / 2,
            oracle.y * tileSize + tileSize / 2,
          );
        }
        // Pan down after a short delay to show nav doors near the map bottom
        const navDoor = state.objects.find(o => o.type === 'nav_door');
        if (navDoor) {
          this.time.delayedCall(900, () => {
            this.cameraController?.panTo(
              navDoor.x * tileSize + tileSize / 2,
              navDoor.y * tileSize + tileSize / 2,
            );
          });
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
        if (!this.agentSprites.has(agent.agent_id)) {
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
