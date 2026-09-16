# Scotland Yard

A browser version of the Scotland Yard board game, played on the classic 199-station London map.
One person hosts the game on their computer. Everyone else joins from their own phone or laptop.

## Quick start

```bash
npm install
npm run host          # builds the client and starts the server on http://localhost:3000
ngrok http 3000       # in a second terminal
```

Create a game, and the lobby's **Invite players** card shows a link and a QR code to share. If you opened the game on `localhost`, the link automatically uses your running ngrok tunnel. Without ngrok, it falls back to your Wi-Fi address.
On ngrok's free plan, each player sees a one-time "You are about to visit…" page. Clicking **Visit Site** gets past it.
Players on the same Wi-Fi can also use the `Network:` URL that the server prints when it starts.

## Development

```bash
npm run dev                          # server (tsx watch) + Vite dev server with hot reload
npm test                             # rules engine + room/security tests
npm run typecheck
npx tsx scripts/bots.ts CODE 2       # add 2 bot players to a room so you can play alone
npx tsx scripts/simulate.ts          # full 5-player socket game against a running server
```

## Features

- **Turn alerts.** You hear a chime, your phone vibrates, and the tab title flashes when it's your move. Tap 🔔 to also get a browser notification (this needs the https ngrok link). Tap 🔊 to mute.
- **How-to-play guide.** Open it from the home screen, the lobby or the game (❓).

- **Lobby.** Room codes and share links. Players pick roles, or the host can pick Mr X at random.
  Detective seats let one person control several detectives. The host sets the rounds, reveal rounds, turn timer and the helper mode.
- **Mr X stays secret.** The server only sends Mr X's position to Mr X, and to everyone after the game ends.
  Detectives and spectators can't find it with dev tools.
- **Tracking Mr X.**
  - The travel log shows each ticket he used, with his station on reveal rounds.
  - The map marks his last-seen stations and joins them in a trail.
  - The "where could he be" overlay estimates how likely each station is, using only public information.
- **Detectives.**
  - Reachable stations are highlighted, and a ticket picker shows how many tickets are left.
  - Team pins and live previews of the move a teammate is choosing.
  - A detectives-only chat.
- **Mr X.**
  - Danger zones show where detectives can reach.
  - A "Detectives' view" toggle shows what they can work out.
  - Warnings before reveal rounds, and a hint showing how many possible stations each ticket choice would leave.
  - Black tickets, a double-move flow, a private route planner and a quick-hide screen.
- **Host tools.** Pause, end the game, and reassign seats (for example when someone disconnects).
  Players can ask to undo a move, and everyone has to agree.
- **After the game.** Results and stats, a round-by-round replay of Mr X's real route next to what the detectives believed, and a rematch (optionally passing Mr X to the next player).
- **Survives interruptions.** Refreshing or reconnecting puts you back in your seat. Rooms are saved to `data/rooms.json`, so a game survives a server restart.

Map data (station positions and connections): [AlexElvers/scotland-yard-data](https://github.com/AlexElvers/scotland-yard-data).
