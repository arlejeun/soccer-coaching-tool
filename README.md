# U10 Sub Manager

A mobile-friendly coaching tool for managing roster, positions, and fair substitutions for a U10 competitive 7v7 team playing a **2-3-1** formation.

## Features

- **Roster** — Manage your 11 players with jersey numbers and positions (GK, Defender, Midfield, Striker)
- **Game Planner** — Configure half length, rotation frequency, and subs per rotation; auto-generates a balanced substitution schedule
- **Match Day** — Live match clock with current lineup, bench, and upcoming substitution alerts

## Data storage

**Roster** and **coaching ratings** sync to a Google Spreadsheet (edit in the app or directly in the sheet).

**Game-day data** (availability, substitution plan, match clock) stays in your browser.

See **[Google Sheets setup guide](docs/GOOGLE_SHEETS_SETUP.md)** for one-time configuration.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 on your phone or tablet for sideline use.

## How Substitutions Work

With 11 players and 7 on the field, each player should get roughly **64%** of total game time (~32 min in a 50-min match).

The planner:
1. Builds a starting lineup matching positions to the 2-3-1 formation
2. Divides the game into segments (quarters by default)
3. At each rotation, swaps the players with the **most** minutes for bench players with the **least** minutes who fit the position
4. Shows projected minutes per player so you can verify fairness before kickoff

## Customize Positions

The roster is pre-loaded from your PlayMetrics team. **Review and adjust each player's primary position** on the Roster tab — positions were not in the export, so defaults are placeholders.

## Game Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Half length | 25 min | Duration of each half |
| Rotations per half | 2 | Creates quarter breaks |
| Subs per rotation | 2 | Players swapped each break |

Adjust based on your league rules and substitution windows.

## Live site

Deployed via GitHub Pages from the `main` branch:

**https://arlejeun.github.io/soccer-coaching-tool/**

Connect Google Sheets in the app (URL + shared secret). Do not commit `.env`.
