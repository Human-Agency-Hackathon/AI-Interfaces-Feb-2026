# Branding & Tutorial Design

**Date:** 2026-02-23
**Author:** Behrang
**Status:** Approved

## Summary

Rebrand the app from "Agent Dungeon" to "The Agentic Journeys", add a "Built with Claude Code" badge, and introduce a slide-based tutorial accessible from the splash screen.

## Branding Changes

### Title
- **Old:** "Agent Dungeon"
- **New:** "The Agentic Journeys"
- Same Cinzel Decorative 700 font, gold `#e8c868`, multi-layer text shadow
- HTML `<title>` tag updated to match

### Tagline
- **Old:** "AI agents brainstorm your hardest problems"
- **New:** "Where AI heroes explore realms of ideas and code."
- Same Cormorant Garamond italic 300 style, muted tan `#d0c0a8`

### CTA Button
- **Old:** "Enter the Dungeon"
- **New:** "Explore a Realm"
- Same `rpg-btn` styling

### Decorative Dividers
- Unchanged — ✦ ✦ ✦ framing stays as-is

### "Built with Claude Code" Badge
- **Position:** Bottom-right corner of splash screen, fixed watermark
- **Content:** Claude Code pixel creature icon + "Built with Claude Code" text
- **Icon:** The pixel art creature (orange/coral body, dark square eyes, four legs) — rendered as a small image (~24px) or CSS pixel art
- **Text font:** DM Mono
- **Color:** Muted `#564a72` (matches existing version text) so it doesn't compete with the title
- **Behavior:** Static, always visible on splash screen

## Tutorial System

### Entry Point
- "How to Play" ghost button on splash screen, positioned below "Explore a Realm"
- Ghost button styling: text with subtle border, same gold/orange color family, clearly secondary to the primary CTA

### Navigation
- Bottom bar: **Previous** (left) | slide indicator dots (center) | **Next** (right)
- **"Skip Tutorial"** button: top-right corner, always visible, returns to splash
- Final slide: "Next" becomes **"Got it!"** → returns to splash

### Quick Track (5 Slides)

| Slide | Title | Content |
|-------|-------|---------|
| 1 | Welcome, Adventurer | What The Agentic Journeys is — you pose a problem, AI agents form a party and quest for solutions |
| 2 | The Realm | Overview of the map, agents as RPG characters, the visual metaphor |
| 3 | How Sessions Work | You describe a problem → agents are summoned → they brainstorm through stages → you get results |
| 4 | Your Commands | Key commands: `/approve`, `/inject`, `/skip`, `/redirect` — you're the party leader |
| 5 | Reading the UI | Quick tour: sidebar (dialogue log, agent details), map, agent roster, prompt bar |

### Learn More (Expanded Content)

Each quick track slide has a "Learn More" link that expands inline to 1-2 additional detail slides:

| From Slide | Expands To Cover |
|------------|-----------------|
| 2 (The Realm) | Fog of war, biomes, agent forts, room exploration |
| 3 (Sessions) | All 9 brainstorm stages, divergent vs convergent phases |
| 4 (Commands) | Full command reference with examples and when to use each |
| 5 (UI) | Each panel: minimap, quest log, stage progress bar, spectator mode |

### Visual Style
- RPG panel aesthetic: dark stone background, gold Cinzel headers, Cormorant Garamond body
- Decorative elements reused from BootScene pixel art (agent sprites, map tiles)
- Slide transitions: simple fade or slide-left animation

## Screen Flow

```mermaid
graph TD
    A[Splash Screen] -->|"Explore a Realm"| B[Setup Screen]
    B --> C[Game]
    A -->|"How to Play"| D[Tutorial Screen]
    D -->|Previous/Next| D
    D -->|"Learn More"| E[Expanded Content]
    E --> D
    D -->|"Skip Tutorial" / "Got it!"| A
```

## Files Changed

| File | Changes |
|------|---------|
| `client/index.html` | `<title>` → "The Agentic Journeys", add `#tutorial-screen` div, add Claude Code badge markup, add tutorial CSS |
| `client/src/screens/SplashScreen.ts` | New title, tagline, CTA text, add "How to Play" ghost button, add badge element |
| `client/src/screens/TutorialScreen.ts` | **New file** — slide-based tutorial with navigation, quick/expanded content |
| `client/src/main.ts` | Wire up TutorialScreen show/hide, connect "How to Play" button |

## Files NOT Changed

- BootScene, GameScene, UIScene, SetupScreen — no changes needed
- Server — purely client-side changes

## Asset

- Claude Code pixel creature icon: small PNG or inline image, scaled to ~24px for the badge
