# Progress: Agent Speech Bubbles

## Status

Phase 4 (Implement) in progress. Owner: Ken. Phases 1-3 complete and committed. Phase 4 (system messages/edge indicators) and Phase 5 (cleanup) remaining.

## Completed

- [x] Codebase exploration: traced full message flow from server → client → DialogueLog
- [x] Identified all relevant files and current architecture
- [x] Created feature folder
- [x] Brief written
- [x] Brief review — decisions resolved (hybrid persistence, collapsible sidebar, edge indicators)
- [x] Architecture written
- [x] Architecture review — approved
- [x] Plan written
- [x] Plan review — approved
- [x] Phase 1: SpeechBubbleManager created with show/hide/update/clear API, positioned above agent sprites
- [x] Phase 2: GameScene wired to route agent dialogue to speech bubbles instead of DialogueLog right panel
- [x] Phase 3: DialogueLog sidebar made collapsible; UIScene and index.html updated for toggle behavior

## In Progress

- [ ] Phase 4: System messages (floating announcements for stage transitions, findings posts) and edge indicators for off-screen speakers
- [ ] Phase 5: Polish pass, dead code cleanup (ThoughtBubble.ts, DialogueLog.ts legacy code), diagram updates

## Remaining

- [ ] Review
- [ ] Push (Phases 1-3 already committed and pushed)

## Files Touched

- `ha-agent-rpg/client/src/ui/SpeechBubbleManager.ts` — **created.** Core speech bubble system: manages per-agent DOM bubbles positioned above sprites, auto-dismiss with configurable duration, typewriter effect, queue support.
- `ha-agent-rpg/client/src/scenes/GameScene.ts` — **modified.** Wired SpeechBubbleManager into agent message handling; routes dialogue to speech bubbles instead of DialogueLog right panel.
- `ha-agent-rpg/client/src/scenes/UIScene.ts` — **modified.** Updated to support collapsible sidebar toggle; adjusted layout for speech bubble coexistence.
- `ha-agent-rpg/client/index.html` — **modified.** Added sidebar collapse toggle button and CSS for collapsible sidebar behavior.
- `ha-agent-rpg/client/src/main.ts` — **modified.** Updated initialization to include SpeechBubbleManager setup.
- `ha-agent-rpg/client/src/__tests__/SpeechBubbleManager.test.ts` — **created.** 18 unit tests covering show/hide/update/clear/queue/positioning/auto-dismiss.

## Test Results

18 new tests in `SpeechBubbleManager.test.ts`. All 40 client tests pass (`npm run test -w client`).

## Changes from Plan

_N/A_

## Follow-ups

- Floating system messages for stage announcements and findings (Phase 4)
- Dead code cleanup: `ThoughtBubble.ts` and `DialogueLog.ts` have legacy code that can be removed once speech bubbles fully replace them
- Diagram updates needed in `docs/diagrams/client-rendering.md` to reflect new SpeechBubbleManager component
