# Handoff: Room Background Diorama — for Ken

## What was done

Replaced the procedural 32x32 tile rendering with hand-made room illustration backgrounds. The 8 room images (from `dungeon_visuals/`) are now loaded as full backdrops in the Phaser client.

**Latest commit** (`f38b848` on main): "Fit room as centered diorama with gold frame border"

## Current state

The room background system works end-to-end:
- 8 JPG room images in `client/public/rooms/`
- `BootScene.ts` preloads them
- `RoomBackground.ts` selects, crops (center-crop to match aspect ratio), and displays the image
- `MapRenderer.ts` has a `backgroundMode` flag that skips tile rendering
- `CameraController.ts` uses `fitRoom()` to zoom/center the camera so the entire room is visible as a contained "diorama" with a gold frame border
- The dark game background (`#1a1a2e`) shows around the edges

## What needs finishing / tuning

1. **Visual verification** — Ida hasn't seen the diorama framing yet. The camera zoom approach should make the room a centered, contained view (not full-bleed), but needs eyes on it to confirm it looks right. If rooms are still too big or too small, adjust `ROOM_PADDING` in `CameraController.ts` (currently 24px).

2. **Agent sprite sizing** — Agents are at 1.5x scale (set in `AgentSprite.ts`). The `PlayerSprite.ts` (Behrang's addition) is NOT scaled up — it's still at 1x. You may want to either:
   - Scale PlayerSprite to 1.5x to match agents
   - Or adjust both based on how they look against the room backgrounds

3. **Frame styling** — The gold frame border (`RoomBackground.ts`, bottom of `show()`) is minimal right now (3px gold + 1px dark inset). Could be made more ornate to match the Art Nouveau aesthetic from the design spec.

4. **Room-to-image mapping** — Currently: root path → throne room, all other paths → hash-based selection from 8 images. Once the process-stage pivot lands (Behrang's tasks), the mapping should probably be: agent role → specific room image (e.g., code agent → lab, research agent → library). This mapping lives in `getRoomKey()` in `RoomBackground.ts`.

5. **Nav door visibility** — With the camera zoomed out, nav door sprites and click targets may need size adjustments to stay usable.

## Key files

| File | What it does |
|------|-------------|
| `client/public/rooms/*.jpg` | 8 room background images |
| `client/src/systems/RoomBackground.ts` | Image selection, cropping, framing |
| `client/src/systems/CameraController.ts` | Camera zoom-to-fit (diorama mode) |
| `client/src/systems/MapRenderer.ts` | `backgroundMode` bypass |
| `client/src/scenes/BootScene.ts` | Image preloading |
| `client/src/scenes/GameScene.ts` | Wiring it all together |
| `client/src/systems/AgentSprite.ts` | 1.5x scaled sprites |

## How to test

```bash
cd ha-agent-rpg
npm run dev:server   # terminal 1
npm run dev:client   # terminal 2
```

Open `localhost:5173`, start a brainstorming session. You should see the throne room as a centered diorama with the gold border, agents inside it, dark background around the edges.

## Design reference

- Room images were generated with Nano Banana — prompts are in `agent-dungeon-design-spec.md`
- Landing page (`landing.html`) shows the visual target: contained room cards, not full-bleed
- The plan file is at `.claude/plans/floating-dancing-gadget.md` if you want the full original plan
