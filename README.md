# 🎲 LudoVerse

> **A modern, aesthetically beautiful, free-to-use, online multiplayer Ludo platform for friends.**  
> Built with React, TypeScript, Tailwind CSS, Express, Socket.IO, Web Audio API, and WebRTC.

---

## 🌟 Key Features

- **Board First Principle**: The board is the visual centerpiece on both desktop and mobile screens. Chat, leaderboard, and settings open in lightweight, non-blocking slide-over drawers without interrupting gameplay.
- **Game Modes**:
  - **Traditional (2–4 Players)**: Classic 15×15 cross board, 52-cell track, 8 safe squares, yard exit on 6, extra turn on 6 or capture, three consecutive 6s forfeit penalty, and exact roll for victory.
  - **Custom Radial Multiplayer (5–9 Players)**: Symmetrical regular $N$-gon radial board geometry with $N$ player spokes and equidistant runways:
    - **Normal Rules (Classic)**: 4 tokens per player for the full, epic Ludo group experience.
    - **Rapid Game (Rapid)**: 2 tokens per player for intense, high-collision, fast-paced matches (15–20 min).
- **Social & Media Second**:
  - Peer-to-peer WebRTC voice chat with on-demand permission handling (mic off by default).
  - Audio waveform speaking indicator rings around player avatars.
  - Rate-limited text chat and quick emoji reactions.
  - Web Audio API procedural sound effects ($0 external asset downloads, zero bandwidth).
- **Live Hunter Leaderboard & Awards**:
  - Live $N \times N$ capture matrix tracking who captured whom and how many times.
  - Idempotent append-only event ledger preventing duplicate counts over spotty network connections.
  - Post-match awards: **Champion**, **Hunter** (most captures), **Most Targeted**, and **Survivor**.
- **Unanimous Early-End Voting**:
  - Any player can propose early end; requires 100% agreement from active players to resolve.
- **Zero-Drift Reconnection**:
  - Session tokens saved in client storage; automatic full-state snapshot rehydration upon cell tower switch, page refresh, or screen unlock.
- **PWA Installation**:
  - Web App Manifest and offline shell support for full-screen home screen installation on iOS and Android.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Node.js v18+ (tested on Node v24)
- npm v9+

### 2. Install Dependencies
```bash
npm install
```

### 3. Build Shared Packages
```bash
npm run build
```

### 4. Run the Automated Test Suite (40 Tests)
```bash
npm test
```

### 5. Launch the Development Servers
In one terminal, start the backend server:
```bash
npm run dev:server
```
*(Server starts on `http://localhost:3001` with WebSocket gateway ready)*

In a second terminal, start the Vite frontend:
```bash
npm run dev:client
```
*(Frontend opens on `http://localhost:5173`)*

---

## 📁 Monorepo Structure

```text
LudoVerse/
├── client/                     # Frontend (React 18, Vite, Tailwind CSS)
│   ├── src/
│   │   ├── components/
│   │   │   ├── board/          # Traditional 4P & Radial 5-9P SVG board renderers
│   │   │   ├── game/           # Dice roller, Player badges, HUD action bar
│   │   │   ├── leaderboard/    # Live Hunter matrix drawer
│   │   │   └── social/         # Chat panel, floating reactions
│   │   ├── hooks/              # useSocket, useGameRoom, useVoiceChat
│   │   ├── lib/                # sound.ts (Web Audio synthesizer), constants
│   │   └── pages/              # LandingPage, LobbyPage, GamePage, ResultsPage
│   └── public/                 # Favicon, Web App Manifest
├── server/                     # Backend (Node.js, Express, Socket.IO)
│   ├── src/
│   │   ├── engine/             # LudoEngine, HunterTracker, VoteEngine
│   │   ├── rooms/              # RoomManager (room codes, host auth, reconnection)
│   │   └── sockets/            # Socket.IO handlers
├── shared/                     # Pure TypeScript contracts and board geometry
│   └── src/
│       ├── types/              # GameState, PlayerState, TokenState
│       ├── constants/          # Board metrics, colors, safe squares
│       └── events/             # Socket request & response signatures
└── tests/                      # Automated Vitest test suite (40 tests)
```

---

## ☁️ Free-Tier Deployment Guide

| Service | Recommended Host | Cost | Setup |
|---|---|---|---|
| **Frontend** | Vercel / Netlify / Cloudflare Pages | **$0** (Free forever) | Connect repo, set root directory to `client`, build command: `npm run build` |
| **Backend & WebSockets** | Render / Railway / Fly.io | **$0** (Free tier) | Connect repo, set directory to `server`, start command: `npm start` |
| **Database (Optional)** | MongoDB Atlas M0 | **$0** (Free tier) | 512 MB free tier stores >250,000 matches |
| **Audio & SFX** | Web Audio API | **$0** | Client-side synthesized waveforms (0 bandwidth cost) |
