# Agent Dungeon — Design Specification

## Concept
Art Nouveau meets dungeon crawler. Organic whiplash curves and gold ornamental framing
contain a dark, torchlit RPG dungeon. The aesthetic tension: elegant botanical refinement
wrapping raw stone-and-shadow gameplay visuals.

The core interaction: a 3×3 grid of rooms with the throne room permanently centered.
Adjacent rooms spawn and despawn flush against the throne as subagents activate and return.
No corridors or gaps — rooms share walls directly, like a dungeon that grows and contracts
organically. A synchronized session log narrates the lifecycle alongside the visual map.

---

## Page Structure

| Section            | Content                                                    |
|--------------------|------------------------------------------------------------|
| Hero               | Title, tagline, description, CTA buttons                   |
| Interactive Map    | 3×3 dungeon grid (left) + session chronicle log (right)    |
| Room Showcase      | 4×2 card gallery of all 8 room types with labels           |
| How It Works       | Three illuminated panels: Spawn → Explore → Return         |
| Terminal           | Animated CLI session log (static, staggered reveal)        |
| CTA Gate           | Final call to action with ornamental frame                 |
| Footer             | Hackathon credit                                           |

---

## Color System

### Dungeon Stone (Backgrounds & Surfaces)
| Token           | Hex       | Usage                        |
|-----------------|-----------|------------------------------|
| Void            | `#0a0810` | Page background              |
| Stone 1         | `#141020` | Canvas / deep surface        |
| Stone 2         | `#1e1830` | Card / panel backgrounds     |
| Stone 3         | `#2a2240` | Elevated surfaces            |
| Stone 4         | `#3d3358` | Borders, dividers            |
| Stone 5         | `#564a72` | Muted UI elements            |
| Stone 6         | `#706490` | Secondary text               |

### Torch & Fire (Primary Accent)
| Token           | Hex       | Usage                        |
|-----------------|-----------|------------------------------|
| Flame Deep      | `#8b3a1a` | Dark fire shadow             |
| Flame           | `#c45a28` | Primary buttons, active CTA  |
| Flame Mid       | `#d87a3a` | Button hover, warm accent    |
| Flame Bright    | `#e8a050` | Highlights, torch glow       |
| Flame Glow      | `#f0c878` | Radial light halos           |
| Flame White     | `#f8e8c0` | Hottest point of light       |

### Gold Ornament (Art Nouveau Framing)
| Token           | Hex       | Usage                        |
|-----------------|-----------|------------------------------|
| Gold Dark       | `#8a6a28` | Frame borders, muted gold    |
| Gold            | `#b89038` | Section borders, ornament    |
| Gold Mid        | `#d0a848` | Active ornament              |
| Gold Bright     | `#e8c868` | Display text, highlight      |
| Gold Glow       | `#f0e0a0` | Ornament shimmer             |

### Agent Type Colors
| Agent Type      | Primary   | Light     | Usage                        |
|-----------------|-----------|-----------|------------------------------|
| Code / Debug    | `#6848a8` | `#a888e0` | Purple — laboratory rooms    |
| Research / Plan | `#3d6838` | `#7aaa60` | Green — botanical rooms      |
| Review / Test   | `#2868a0` | `#68a8d8` | Blue — armory/scriptorium    |

### Carpet Red (Secondary Accent)
| Token           | Hex       | Usage                        |
|-----------------|-----------|------------------------------|
| Carpet Dark     | `#581818` | Carpet edge, deep accent     |
| Carpet          | `#882828` | Throne room carpet, hearts   |
| Carpet Mid      | `#a83838` | Hover states on red elements |

### Text
| Token           | Hex       | Usage                        |
|-----------------|-----------|------------------------------|
| Bone            | `#e8dcd0` | Primary body text            |
| Parchment       | `#d0c0a8` | Secondary body, italic text  |
| Parchment Dark  | `#a89878` | Captions, labels, muted text |

---

## Typography

### Display — Cinzel Decorative
- **Use:** Hero titles, section titles, major headings
- **Weights:** 700 (bold), 900 (black)
- **Sizes:** 72px hero, 42px section, 34px CTA
- **Style notes:** Always uppercase or title case. Pair with generous letter-spacing (2–4px). Apply text-shadow for depth.

### Headings — Cinzel
- **Use:** Subheadings, nav links, labels, step titles, button text
- **Weights:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **Sizes:** 15px step titles, 12px nav/buttons, 11px labels, 10px legend/footer
- **Style notes:** Uppercase with wide letter-spacing (3–6px). This is the workhorse serif.

### Body — Cormorant Garamond
- **Use:** Descriptive prose, paragraphs, hero description, step descriptions
- **Weights:** 300 (light), 400 (regular), 500 (medium)
- **Sizes:** 19px hero description, 17px CTA description, 16px body paragraphs
- **Style notes:** Italic for flavor text and descriptions. Light weight for elegance. Line-height 1.7–1.8.

### Mono — DM Mono
- **Use:** Terminal/session log, code snippets, system status text
- **Weights:** 300 (light), 400 (regular)
- **Sizes:** 12px terminal body
- **Style notes:** Only appears in terminal/system contexts. Never in marketing copy.

### Font Pairing Rules
1. Never use more than one display font per view
2. Cinzel Decorative is reserved for the single largest element on screen
3. Cinzel handles everything structural (nav, labels, buttons)
4. Cormorant Garamond is always the readable layer — descriptions, body
5. DM Mono is quarantined to system/terminal UI only

---

## Art Nouveau Visual Language

### Framing
- Double-border system: outer 1–2px solid gold-dark, inner 1px at 4–8px inset with reduced opacity
- Corner flourishes on major containers (SVG or pseudo-elements)
- Top arch ornaments on gates/CTAs — whiplash curve with finial

### Ornament
- `✦` diamond glyph as section label decorators
- SVG vine borders along hero edges — sinuous paths with leaf ellipses
- Gold gradient line accents: `linear-gradient(90deg, transparent, gold, transparent)`
- No pixel-art squares — all decorative elements use organic curves

### Atmosphere
- Radial torch glow: subtle warm gradients emanating from light sources
- Stone mortar pattern: fine repeating linear gradients at low opacity
- Floor tile pattern: `repeating-conic-gradient` for checkerboard stone
- Inset box-shadows on all room/panel elements for carved-stone depth

---

## Dungeon Room Visual Spec

### Grid Position (3×3 Layout)

```
 ┌──────────────┬──────────────┬──────────────┐
 │ Test Chamber │   Library    │  Greenhouse  │
 │  (Review)    │  (Research)  │   (Plan)     │
 ├──────────────┼──────────────┼──────────────┤
 │  Laboratory  │ ★ THRONE ★  │   Armory     │
 │   (Code)     │ (Orchestr.)  │  (Review)    │
 ├──────────────┼──────────────┼──────────────┤
 │  Empty Cell  │    Forge     │  [empty]     │
 │  (Pending)   │   (Debug)    │              │
 └──────────────┴──────────────┴──────────────┘
```

- Throne room is always visible (center cell)
- All other rooms spawn/despawn based on agent activity
- Rooms are flush — 2px gap only (mortar line, not corridor)
- Bottom-right cell is an empty void slot (growth space)

### Room-to-Agent Mapping

| Grid Position | Room         | Agent Type      | Border Color | Agent Dot Color |
|---------------|--------------|-----------------|--------------|-----------------|
| [1,1]         | Test Chamber | Test Runner     | Water blue   | `#4888c0`       |
| [1,2]         | Library      | Research Agent  | Vine green   | `#7aaa60`       |
| [1,3]         | Greenhouse   | Plan Agent      | Vine green   | `#7aaa60`       |
| [2,1]         | Laboratory   | Code Agent      | Magic purple | `#8868c8`       |
| [2,2]         | Throne Room  | Orchestrator    | Gold         | `#e8c868`       |
| [2,3]         | Armory       | Review Agent    | Water blue   | `#4888c0`       |
| [3,1]         | Empty Cell   | Pending         | Stone dashed | —               |
| [3,2]         | Forge        | Debug Agent     | Magic purple | `#8868c8`       |
| [3,3]         | [empty]      | —               | —            | —               |

### Room Structure (for generated assets)
Each room is a top-down view, approximately square, showing:
- **Stone walls** — thick border, visible mortar lines
- **Floor tiles** — grid pattern, slightly varied tone
- **Torches** — 1–4 per room, mounted on walls, with visible flame and warm radial glow
- **Furnishings** — specific to room type (see below)
- **Shadow** — heavy vignette, darkest at walls, lighter toward center

### Room Types for Agent Classes

**Throne Room (Orchestrator)**
- Red/crimson carpet runner down center
- Throne or ornate chair at far wall
- Torches flanking throne (4 total)
- Royal banner or tapestry on back wall
- Small table with map/scroll

**Laboratory (Code Agent)**
- Alchemy table with bubbling potions (purples, greens)
- Bookshelves against walls
- Cauldron or brewing stand
- Scattered scrolls and vials
- Purple/violet ambient light from potions

**Library / Scriptorium (Research Agent)**
- Floor-to-ceiling bookshelves
- Central reading desk with open book
- Candelabra or reading lamp
- Scattered scrolls and quills
- Green ambient — ivy or moss growing on shelves

**Armory / Inspection Hall (Review Agent)**
- Weapon racks on walls
- Armor stands
- Inspection table in center
- Blue crystal or magical light source
- Shields with heraldry on walls

**Greenhouse / Garden (Plan Agent)**
- Overgrown with vines and plants
- Central planning table with map
- Potted plants, terrariums
- Natural light from skylight/opening
- Green, lush, organized chaos

**Forge (Debug Agent)**
- Anvil and workbench center
- Forge fire (warm orange glow)
- Tools hanging on walls — hammers, tongs
- Broken items being repaired
- Sparks, smoke, heat shimmer

**Test Chamber (Test Runner)**
- Obstacle course elements
- Target dummies
- Rune circles on floor
- Crystal orbs for observation
- Blue and white lighting

**Dungeon Cell (Pending/Idle)**
- Barred door or gate
- Empty, dark, minimal furnishing
- Cobwebs, dust
- Single dim torch
- Waiting to be claimed

---

## Image Generation Prompts for Nano Banana

Use these prompts to generate room assets. Each follows the same structural template
to ensure visual consistency across the set.

### Style Preamble (prepend to every prompt)

> Top-down overhead view of a dark fantasy dungeon room, pixel art style, 16-bit RPG aesthetic, dark moody lighting with warm torchlight, visible stone tile floor grid, thick stone walls with mortar lines, Art Nouveau ornamental details on furniture edges, muted color palette with selective warm highlights, slight vignette shadow at walls, game asset style, no characters visible, square aspect ratio

### Throne Room — Orchestrator
> [style preamble] A grand throne room. Crimson and gold carpet runner leads to an ornate stone throne with Art Nouveau carved details. Four wall-mounted torches cast overlapping warm light pools on the stone floor. A small wooden table holds a rolled map. Faded royal banners with botanical motifs hang on the back wall. Red and gold accent colors.

### Laboratory — Code Agent  
> [style preamble] An alchemist's laboratory. A long wooden worktable holds bubbling glass flasks with glowing purple and green liquids. Bookshelves line two walls stacked with leather tomes. A large iron cauldron sits in one corner with faint violet steam. Scattered scrolls, quill pens, and glass vials on the floor. Purple and violet ambient glow from the potions.

### Library — Research Agent
> [style preamble] A scholar's library. Floor-to-ceiling wooden bookshelves on three walls overflowing with books and scrolls. A central reading desk with an open illuminated manuscript and brass candelabra. Rolled maps lean in corners. Faint green ivy grows along the top shelf edges. Warm candlelight mixed with soft green botanical tones.

### Armory — Review Agent
> [style preamble] An inspection armory. Weapon racks displaying swords and shields line the walls. Two armor stands with plate armor flank a central inspection table. A glowing blue crystal mounted on the wall provides cool magical light. Shields with Art Nouveau heraldic designs hang between torches. Blue and steel accent colors.

### Greenhouse — Plan Agent
> [style preamble] An indoor greenhouse planning room. Lush vines and potted plants fill the edges. A large stone table in the center holds an unrolled map with pins and markers. Climbing ivy frames an overhead skylight letting in pale natural light. Terracotta pots, garden tools, botanical charts on the walls. Rich greens and earth tones.

### Forge — Debug Agent
> [style preamble] A blacksmith's forge workshop. A glowing forge fire in the back wall casts intense orange light. An iron anvil sits center with a half-repaired sword. Tool racks on walls hold hammers, tongs, and files. Broken gears and mechanical parts scattered on a workbench. Visible heat shimmer and floating sparks. Orange and dark iron palette.

### Test Chamber — Test Runner
> [style preamble] A magical testing chamber. Glowing blue rune circles inscribed on the stone floor. Crystal observation orbs float on iron pedestals in corners. Target dummies made of straw and wood stand against one wall. A rack of practice weapons nearby. Cool blue and white magical lighting mixed with warm torch accents.

### Empty Cell — Pending Agent
> [style preamble] An empty dungeon cell, dark and abandoned. Iron-barred door slightly ajar. Cobwebs in corners, dust on the stone floor. A single dim wall torch barely illuminates the small room. Bare stone walls, a rusted chain on the floor. Extremely dark and moody, waiting to be occupied. Minimal detail, maximum shadow.

---

## Animation Tokens

| Animation        | Duration | Easing                              | Usage                          |
|------------------|----------|-------------------------------------|--------------------------------|
| torch-dance      | 1.5s     | infinite                            | Flame scale + brightness cycle |
| glow-pulse       | 1.8s     | ease-in-out infinite                | Agent dot aura, radial light   |
| throneGlow       | 4s       | ease-in-out infinite                | Throne room box-shadow pulse   |
| spawnRoom        | 0.6s     | cubic-bezier(0.34, 1.56, 0.64, 1)  | Room appears: scale 0.3→1.04→1, brightness flash |
| despawnRoom      | 0.5s     | ease-in                             | Room disappears: scale 1→0.3, fade + dim |
| agentFloat       | 1.2s     | ease-in-out infinite                | Agent dot idle bounce          |
| fade-up          | 0.3–1s   | ease-out                            | Content entrance, log entries  |
| cursor-blink     | 1s       | step-end infinite                   | Terminal / log cursor          |

### Spawn/Despawn Sequence Timing
The interactive dungeon runs a scripted sequence on page load and on replay:

| Time (ms) | Event                                    |
|-----------|------------------------------------------|
| 300       | Throne Room log entry                    |
| 800       | Command echo in log                      |
| 1400      | Laboratory spawns + log                  |
| 2000      | Armory spawns + log                      |
| 2600      | Library spawns + log                     |
| 3200      | Forge spawns + log                       |
| 3800      | Test Chamber spawns + log                |
| 4400      | Greenhouse spawns + log                  |
| 5200      | Pending cell appears (no log)            |
| 6500      | Library despawns + return log            |
| 7300      | Test Chamber despawns + return log       |
| 8100      | Laboratory despawns + return log         |
| 8900      | Greenhouse despawns + return log         |
| 9700      | Forge despawns + return log              |
| 10500     | Armory despawns + return log             |
| 11300     | Cell despawns                            |
| 12000     | "Quest complete" log, sequence ends      |

Total cycle: ~12 seconds. Replay via click.

---

## Spacing System

Base unit: 4px

| Token  | Value | Usage                    |
|--------|-------|--------------------------|
| xs     | 4px   | Icon gaps                |
| sm     | 8px   | Tight padding            |
| md     | 16px  | Standard padding         |
| lg     | 24px  | Card gaps, section inner |
| xl     | 32px  | Section padding          |
| 2xl    | 48px  | Major section gaps       |
| 3xl    | 80px  | Section vertical padding |
| 4xl    | 120px | Hero/major sections      |

---

## Component Patterns

### Dungeon Map (Interactive)
- **Layout:** 3×3 CSS grid, `gap: 2px`, background void
- **Frame:** Gold-dark double border with SVG corner flourishes
- **Throne tile:** Always visible, `throneGlow` animation, gold border
- **Agent tiles:** Hidden by default (`transform: scale(0); opacity: 0`). Activated via JS class toggle → `spawnRoom` animation. Deactivated via `despawnRoom` animation.
- **Room images:** Square aspect ratio, `object-fit: cover`, base brightness 0.8 (1.0 on hover)
- **Pending tile:** Dashed border, image at 0.4 brightness
- **Empty slot:** Pure void, no border
- **Room borders by type:** Gold (throne), purple/magic (code/debug), green/vine (research/plan), blue/water (review/test)

### Agent Dots
- 10×10px circles, positioned absolutely within room tiles
- Color matches agent type (gold, purple, green, blue)
- `agentFloat` animation (1.2s ease-in-out infinite)
- Glow aura: `::after` pseudo-element, 26px radial gradient at 30–70% opacity pulsing
- Hidden when room is inactive; shown via `data-agent` attribute + JS `display` toggle

### Session Chronicle (Log Panel)
- Same frame style as terminal (gold-dark border, inner frame, dot header)
- Sits beside the map in a flex layout (`flex: 1 1 280px; max-width: 360px`)
- Log entries: DM Mono 10px, colored per type (gold, dim, agent, room, ok)
- Entries append with `fade-up 0.3s` animation
- Blinking cursor shown during active sequence
- Stacks below map on mobile (768px breakpoint)

### Room Showcase Gallery
- 4×2 grid (2×4 on mobile), `gap: 16px`
- Cards: 1px stone-4 border, hover → gold border + translateY(-4px)
- Images: square, brightness 0.75 → 1.0 on hover
- Label overlay: gradient fade from transparent to 90% void, Cinzel name + Cormorant role

### Buttons
- Primary: flame gradient background, void text, flame-bright border, warm box-shadow
- Secondary: transparent, gold text, gold-dark border, subtle shadow
- Both: Cinzel font, 12px, 600 weight, 3px letter-spacing, uppercase

### Cards / Panels
- Background: stone-2
- Border: 1px gold-dark
- Inner border: 1px at 4px inset, gold at 10–20% opacity
- Hover: border transitions to gold

### Terminal (Static)
- Background: near-black (#0a0810 at 95%)
- Border: 1px gold-dark with inner frame
- Header bar: stone-2, three colored dots (carpet, gold, vine)
- Body: DM Mono 12px, staggered fade-up animation on lines
