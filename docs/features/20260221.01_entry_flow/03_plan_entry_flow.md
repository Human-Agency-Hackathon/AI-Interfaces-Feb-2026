# Plan: Entry Flow Redesign

## Phase 1: Restyle entry CSS in index.html

Retheme the onboarding CSS from blue sci-fi to dungeon aesthetic. This is the foundation everything else builds on.

**Tasks:**
1. Add Google Fonts link (`Cinzel Decorative`, `Cinzel`, `Cormorant Garamond`, `DM Mono`) to `<head>`
2. Update `<title>` from "AI Agent RPG" to "Agent Dungeon"
3. Replace `body` base styles: background `#0a0810` (Void), color `#e8dcd0` (Bone), font-family Cormorant Garamond
4. Restyle `.rpg-panel`: background `#1e1830` (Stone 2), border `1px solid #8a6a28` (Gold Dark), inner border `1px at 4px inset gold at 15% opacity`
5. Restyle `.rpg-btn`: border `#c45a28` (Flame), color `#c45a28`, font-family Cinzel, hover → flame gradient background
6. Restyle `.rpg-input`: background `#141020` (Stone 1), border `#3d3358` (Stone 4), focus border `#c45a28` (Flame)
7. Restyle `.screen-title`: font-family Cinzel, color `#e8c868` (Gold Bright)
8. Restyle `.screen-subtitle`: font-family Cormorant Garamond italic, color `#d0c0a8` (Parchment)
9. Add new `.splash-logo` class: Cinzel Decorative, warm text-shadow (flame glow instead of blue)
10. Restyle scrollbar to dungeon palette
11. Replace `#title-screen` container with `#splash-screen`, replace `#repo-screen` with `#setup-screen`
12. Remove dead CSS: `.realm-list`, `.realm-card`, `.realm-card-*`, `.realm-btn`, `.realm-btn-danger`, `.join-overlay`, `.join-panel`, `.join-label`, `.join-name-input`, `.join-color-row`, `.join-color-swatch`, `.join-btn`
13. Add new CSS for SetupScreen: `.setup-form`, `.setup-section`, `.setup-color-row`, `.setup-color-swatch`, `.setup-loading` (loading overlay state)

**Test:** Open `http://localhost:5173` — splash screen renders with dungeon palette and fonts. No blue `#6a8aff` visible on any entry screen. Build passes (`npm run build -w client`).

## Phase 2: Create SplashScreen

New file replacing TitleScreen with dungeon-themed branding.

**Tasks:**
1. Create `client/src/screens/SplashScreen.ts`
2. Mount on `#splash-screen` container
3. Render: "Agent Dungeon" in Cinzel Decorative with warm text-shadow, tagline in Cormorant Garamond italic (e.g. "AI agents brainstorm your hardest problems"), gold decorative dividers, "Enter the Dungeon" button (flame-styled)
4. `show()` / `hide()` methods matching existing pattern
5. Delete `client/src/screens/TitleScreen.ts`

**Test:** SplashScreen renders with correct branding. Button click fires callback. Build passes.

## Phase 3: Create SetupScreen

New file replacing RepoScreen + JoinScreen with a single combined form.

**Tasks:**
1. Create `client/src/screens/SetupScreen.ts`
2. Mount on `#setup-screen` container
3. Render sections:
   - Header: "Prepare Your Session" (Cinzel)
   - Name input (required, max 20 chars) with label "Your Name"
   - Color picker row (8 swatches, same colors as old JoinScreen, pre-select random)
   - Problem textarea (required) with label "What should agents brainstorm?" and placeholder
   - "Begin Session" button (flame-styled, disabled until name + problem filled)
   - Error area (hidden by default)
4. Form validation: name and problem required before submit
5. Loading state: `showLoading()` swaps form content for themed loading overlay ("Agents assembling in the dungeon..." with animated dots). `hideLoading()` restores form.
6. `showError(message)` / `clearError()` matching current pattern
7. `show()` / `hide()` methods
8. Export collected identity: `getIdentity(): { name: string, color: number }`
9. Callback: `onSubmit(problem: string)` fires when user clicks "Begin Session"
10. Back link: `onBack()` callback to return to splash
11. Delete `client/src/screens/RepoScreen.ts`
12. Delete `client/src/screens/JoinScreen.ts`

**Test:** SetupScreen renders all fields. Validation prevents empty submit. Loading state toggles correctly. `getIdentity()` returns entered name + selected color. Build passes.

## Phase 4: Rewire main.ts

Connect the new screens and remove dead code.

**Tasks:**
1. Replace imports: `SplashScreen` instead of `TitleScreen`, `SetupScreen` instead of `RepoScreen`, remove `JoinScreen` import
2. Instantiate `SplashScreen` with callback → hide splash, show setup
3. Instantiate `SetupScreen` with:
   - `onSubmit(problem)` → `setupScreen.showLoading()`, `ws.send({ type: 'player:start-process', problem })`
   - `onBack()` → hide setup, show splash
4. On `process:started` → call `startGame()` with identity from `setupScreen.getIdentity()`
5. Modify `startGame()`:
   - Accept `identity: { name: string, color: number }` parameter
   - Remove all JoinScreen code (creation, show, destroy)
   - Send `spectator:register` automatically: `ws.send({ type: 'spectator:register', name: identity.name, color: identity.color })`
6. On `error` → `setupScreen.showError(data.message)`
7. Remove realm-related handlers: `player:list-realms` send on splash click, `realm:list` handler, `realm:removed` handler
8. Update `stopGame()` → return to `setupScreen.show()` instead of `repoScreen.show()`
9. Remove unused type imports (`RealmListMessage`, `RealmRemovedMessage`, etc.)

**Test:** Full flow works: Splash → Setup → enter name/problem → Begin Session → loading → game appears → PromptBar shows spectator identity immediately. Quit game returns to SetupScreen. Build passes. Server tests still pass (`npm run test -w server`).

## Test List

- [ ] SplashScreen renders with "Agent Dungeon" branding and dungeon palette
- [ ] SplashScreen "Enter the Dungeon" button fires onStart callback
- [ ] SetupScreen renders name input, color picker, problem textarea, submit button
- [ ] SetupScreen validates: empty name prevents submit
- [ ] SetupScreen validates: empty problem prevents submit
- [ ] SetupScreen color picker: clicking swatch changes selection
- [ ] SetupScreen `getIdentity()` returns correct name and selected color
- [ ] SetupScreen `showLoading()` hides form, shows loading overlay
- [ ] SetupScreen `hideLoading()` restores form
- [ ] SetupScreen `showError()` displays error text
- [ ] Full flow: splash → setup → begin → loading visible → game starts
- [ ] Spectator identity auto-registered on game start (no JoinScreen)
- [ ] PromptBar receives spectator identity immediately
- [ ] Quit game returns to SetupScreen (not broken)
- [ ] No `#6a8aff` blue in any entry-screen CSS
- [ ] All entry-screen text uses Cinzel / Cormorant / DM Mono (no Courier New)
- [ ] `npm run build -w client` passes with zero errors
- [ ] `npm run test -w server` still passes (no server changes)
- [ ] Old files deleted: TitleScreen.ts, RepoScreen.ts, JoinScreen.ts

## Definition of Done

- [ ] Entry flow is: Splash → Setup → Loading → Game (2 screens + transition)
- [ ] All entry CSS uses dungeon stone/flame/gold palette from design spec
- [ ] All entry text uses Cinzel / Cormorant Garamond / DM Mono font hierarchy
- [ ] JoinScreen is gone; spectator identity collected on SetupScreen and auto-sent
- [ ] No dead repo-exploration code in entry screens
- [ ] Client builds cleanly
- [ ] Server tests pass
- [ ] Committed and pushed to main
