import { useEffect, useMemo, useRef, useState } from 'react';
import { transportsAt } from '../../../shared/map/graph';
import { legalMoves, secondMovesAfter } from '../../../shared/rules/engine';
import { possibleLocations } from '../../../shared/rules/possibleLocations';
import type { Move, MoveTicket } from '../../../shared/rules/types';
import { HIDDEN, PING_LABELS, type RoomView } from '../../../shared/protocol';
import { MapView, type MapPiece } from '../map/MapView';
import { TravelLog } from '../panels/TravelLog';
import { Players } from '../panels/Players';
import { Chat } from '../panels/Chat';
import { MovePicker } from '../panels/MovePicker';
import { GameOver } from '../panels/GameOver';
import { HowToPlay } from '../panels/HowToPlay';
import {
  TICKET_COLOR, TICKET_ICON, areAdjacent, detectivesAtStep, nextRevealIn, threatZones, ticketsBetween,
} from '../lib/derive';
import { chime, vibrate } from '../lib/feedback';
import { request, socket } from '../socket';
import { useStore } from '../store';

type Tab = 'log' | 'players' | 'chat' | 'plan';

export function Game({ room }: { room: RoomView }) {
  const game = room.game!;
  const { you, settings } = room;
  const toast = useStore((s) => s.toast);
  const lastEvents = useStore((s) => s.lastEvents);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const leave = useStore((s) => s.leave);
  const sound = useStore((s) => s.sound);
  const setSound = useStore((s) => s.setSound);

  const isMrX = you.role === 'mrx';
  const isDetective = you.role === 'detective';
  const over = room.phase === 'over';
  const myTurn = !over && !room.paused && you.pieces.includes(game.turn);
  const turnPiece = game.pieces[game.turn];
  const turnOwner = room.players.find((p) => (game.turn === 0 ? p.role === 'mrx' : p.id === room.assignments[game.turn - 1]));

  const [tab, setTab] = useState<Tab>('log');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [picker, setPicker] = useState<{ station: number; tickets: MoveTicket[] } | null>(null);
  const [firstMove, setFirstMove] = useState<Move | null>(null);
  const [info, setInfo] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ station: number; nonce: number } | null>(null);
  const [helperOn, setHelperOn] = useState(settings.helper === 'on' && !isMrX);
  const [threatsOn, setThreatsOn] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<number[]>([]);
  const [replay, setReplay] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(over);
  const [now, setNow] = useState(Date.now());
  const [confirming, setConfirming] = useState<{ text: string; run: () => void } | null>(null);
  const [help, setHelp] = useState(false);
  const [seenChat, setSeenChat] = useState(room.chat.length);
  const [notify, setNotify] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted');

  // Unread counter: messages from other people that arrived while the chat tab wasn't visible.
  const chatVisible = tab === 'chat' && (sheetOpen || window.matchMedia('(min-width: 861px)').matches);
  useEffect(() => { if (chatVisible) setSeenChat(room.chat.length); }, [chatVisible, room.chat.length]);
  const unread = room.chat.slice(Math.min(seenChat, room.chat.length)).filter((m) => m.playerId !== you.playerId && m.playerId !== 'system').length;

  // Esc closes whatever dialog or popover is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPicker(null);
      setInfo(null);
      setConfirming(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const center = (station: number) => {
    setFocus({ station, nonce: Date.now() });
    setSheetOpen(false);
  };

  // Reset transient UI when the turn changes.
  useEffect(() => {
    setPicker(null);
    setFirstMove(null);
  }, [game.turn, game.log.length, room.phase]);

  useEffect(() => { if (over) setShowResult(true); else { setReplay(null); setShowResult(false); } }, [over]);

  // Turn start: vibrate, chime and centre the map on the piece that must move.
  const prevTurnKey = useRef<string>('');
  useEffect(() => {
    const key = `${game.log.length}-${game.turn}-${myTurn}`;
    if (myTurn && prevTurnKey.current !== key) {
      if (sound) chime('turn');
      vibrate([80, 60, 80]);
      if (notify && document.hidden) {
        try { new Notification('Scotland Yard — your move', { body: `${game.pieces[game.turn].name} is waiting for you.`, tag: 'sy-turn' }); } catch { /* unsupported */ }
      }
      const pos = game.pieces[game.turn].position;
      if (pos !== HIDDEN) center(pos);
    }
    prevTurnKey.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, game.turn, game.log.length]);

  // Toasts for things that happen on the board.
  useEffect(() => {
    if (!lastEvents) return;
    for (const e of lastEvents.events) {
      if (e.type === 'revealed') {
        toast(`👁 Mr X spotted at ${e.station}! (round ${e.round})`, 'reveal');
        if (sound) chime('reveal');
        if (!isMrX) center(e.station);
      } else if (e.type === 'moved' && e.pieceId === 'mrx' && !isMrX) {
        toast(`Mr X used ${e.ticket === 'black' ? 'a black ticket' : `a ${e.ticket} ticket`} (round ${e.round})`);
      } else if (e.type === 'skipped') {
        toast(`${game.pieces.find((p) => p.id === e.pieceId)?.name} has no legal moves and is skipped.`);
      } else if (e.type === 'gameOver') {
        if (sound) chime('end');
        vibrate([200, 100, 200]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvents?.id]);

  // Flash the tab title while it's your move and the tab is in the background.
  useEffect(() => {
    const base = 'Scotland Yard';
    if (!myTurn) { document.title = base; return; }
    let on = false;
    const t = setInterval(() => {
      on = document.hidden ? !on : false;
      document.title = on ? '🔔 Your move!' : base;
    }, 1000);
    return () => { clearInterval(t); document.title = base; };
  }, [myTurn]);

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return toast('Notifications aren’t supported here.', 'danger');
    if (notify) return setNotify(false);
    const permission = await Notification.requestPermission();
    if (permission === 'granted') { setNotify(true); toast('You’ll get a notification when it’s your move.'); }
    else toast(window.isSecureContext ? 'Notifications were blocked in browser settings.' : 'Notifications need the https (ngrok) link.', 'danger');
  };

  useEffect(() => {
    if (!room.turnDeadline) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [room.turnDeadline]);

  // ---- derived board state ----
  const detectives = game.pieces.slice(1).map((p) => p.position);

  const legal = useMemo(() => {
    const map = new Map<number, MoveTicket[]>();
    if (!myTurn || replay !== null || planning) return map;
    const moves = firstMove ? secondMovesAfter(game, firstMove) : legalMoves(game, game.turn);
    for (const m of moves) map.set(m.to, [...(map.get(m.to) ?? []), m.ticket]);
    return map;
  }, [game, myTurn, firstMove, replay, planning]);

  const possible = useMemo(() => {
    if (replay !== null) return possibleLocations(game.log.slice(0, replay), detectivesAtStep(game, replay));
    if (settings.helper === 'off' && !isMrX) return null;
    if (!helperOn || over) return null;
    return possibleLocations(game.log, detectives);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, helperOn, replay, over]);

  const threats = useMemo(() => (isMrX && threatsOn && !over ? threatZones(game) : null), [game, isMrX, threatsOn, over]);

  const logUntil = replay ?? game.log.length;
  const reveals = game.log.slice(0, logUntil).filter((l) => l.revealed !== null).map((l) => ({ station: l.revealed!, round: l.round }));

  const trail = useMemo(() => {
    if (replay !== null) return game.mrxPath.slice(0, replay + 1);
    if (over) return game.mrxPath;
    if (!isMrX) return null;
    const last = [...game.log].reverse().find((l) => l.revealed !== null);
    const path = game.mrxPath.slice(last ? last.round : 0);
    return firstMove ? [...path, firstMove.to] : path;
  }, [game, isMrX, over, replay, firstMove]);

  const pieces: MapPiece[] = useMemo(() => {
    const dets = replay !== null ? detectivesAtStep(game, replay) : detectives;
    const list: MapPiece[] = game.pieces.slice(1).map((p, i) => ({
      id: p.id, color: p.color, position: dets[i], label: p.name, active: !over && replay === null && game.turn === i + 1,
    }));
    const mrxPos = replay !== null ? game.mrxPath[replay] : firstMove ? firstMove.to : game.pieces[0].position;
    if (mrxPos && mrxPos !== HIDDEN) {
      list.push({ id: 'mrx', color: '#15171c', position: mrxPos, label: 'Mr X', isMrX: true, active: !over && replay === null && game.turn === 0 });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, replay, firstMove, over]);

  // Faint trail of each detective's most recent move, so everyone can see what just happened.
  const lastMoves = useMemo(() => {
    if (replay !== null) return [];
    // Each detective's latest move, if it happened in this round or the previous one.
    const latest = new Map<string, (typeof game.detectiveMoves)[number]>();
    for (const m of game.detectiveMoves) latest.set(m.pieceId, m);
    return [...latest.values()]
      .filter((m) => m.ticket && m.round >= game.log.length - 1)
      .map((m) => ({ from: m.from, to: m.to, color: game.pieces.find((p) => p.id === m.pieceId)!.color }));
  }, [game, replay]);

  const previews = room.previews.map((pv) => ({
    from: game.pieces[pv.pieceIndex].position, to: pv.to, color: game.pieces[pv.pieceIndex].color,
  }));

  // ---- actions ----
  const onStation = (station: number) => {
    if (replay !== null) return;
    if (planning && isMrX) {
      setPlan((p) => {
        const last = p.at(-1) ?? game.pieces[0].position;
        if (p.at(-1) === station) return p.slice(0, -1);
        if (!areAdjacent(last, station)) {
          toast(`${station} is not directly connected to ${last}.`, 'danger');
          return p;
        }
        return [...p, station];
      });
      return;
    }
    const tickets = legal.get(station);
    if (tickets) {
      setInfo(null);
      setPicker({ station, tickets });
      if (isDetective) socket.emit('team:preview', { pieceIndex: game.turn, to: station, ticket: null });
      return;
    }
    setInfo(info === station ? null : station);
  };

  const cancelPicker = () => {
    if (isDetective && picker) socket.emit('team:preview', { pieceIndex: game.turn, to: null, ticket: null });
    setPicker(null);
  };

  const confirm = async (ticket: MoveTicket, startDouble: boolean) => {
    if (!picker) return;
    const move = { ticket, to: picker.station };
    setPicker(null);
    if (isMrX && startDouble && !firstMove) {
      setFirstMove(move);
      toast('Double move: now pick your second destination.');
      return;
    }
    const res = firstMove
      ? await request('game:double', { first: firstMove, second: move })
      : await request('game:move', { pieceIndex: game.turn, ticket, to: picker.station });
    setFirstMove(null);
    if (!res.ok) toast(res.error, 'danger');
  };

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    if (!res.ok) toast(res.error ?? 'Failed', 'danger');
  };

  // ---- banner ----
  const revealIn = nextRevealIn(game);
  const secondsLeft = room.turnDeadline ? Math.max(0, Math.ceil((room.turnDeadline - now) / 1000)) : null;
  let banner: React.ReactNode;
  if (replay !== null) banner = <>Replay · after round {replay}</>;
  else if (over) banner = <>{game.winner === 'mrx' ? 'Mr X escaped' : game.winner ? 'Mr X was caught' : 'Game ended'}</>;
  else if (room.paused) banner = <>⏸ Paused by the host</>;
  else if (firstMove) banner = <>Double move · pick your second destination</>;
  else if (myTurn) banner = <>Your move · {turnPiece.name}</>;
  else banner = (
    <>
      {turnPiece.name}{turnOwner && turnOwner.id !== you.playerId ? ` (${turnOwner.name})` : ''} is moving…
      {turnOwner && !turnOwner.connected && <span className="offline"> waiting for them to reconnect</span>}
    </>
  );

  const myPiece = game.pieces[myTurn ? game.turn : you.pieces[0] ?? -1];
  const undoVotePending = room.undoVote && you.role !== 'spectator' && !room.undoVote.votes.includes(you.playerId);
  const infoTransports = info ? transportsAt(info) : [];

  const tabs: [Tab, string][] = [['log', '📜 Log'], ['players', '👥 Players'], ['chat', '💬 Chat']];
  if (isMrX && !over) tabs.push(['plan', '🗺 Plan']);

  return (
    <div className={`game ${isMrX && !over ? 'secret' : ''} ${myTurn ? 'my-turn' : ''}`}
      style={{ '--turn': game.turn === 0 ? '#c9ced8' : turnPiece.color } as React.CSSProperties}>
      <header className="topbar">
        <div className="turn-banner">
          <span className="turn-dot" style={{ background: turnPiece.color }}>{game.turn === 0 ? 'X' : ''}</span>
          <div className="grow">
            <div className="banner-main">{banner}</div>
            <div className="banner-sub">
              Round {Math.min(game.log.length + (game.turn === 0 && !over ? 1 : 0), settings.totalRounds)}/{settings.totalRounds}
              {revealIn !== null && !over && <> · 👁 reveal {revealIn === 1 ? 'next move' : `in ${revealIn}`}</>}
              {secondsLeft !== null && !over && <> · <span className={secondsLeft <= 10 ? 'bad' : ''}>⏱ {secondsLeft}s</span></>}
            </div>
          </div>
          {isMrX && !over && <button className="btn small ghost" onClick={() => setHidden(true)} title="Hide screen">🙈 Hide</button>}
        </div>
        <div className="round-strip" aria-hidden>
          {Array.from({ length: settings.totalRounds }, (_, i) => i + 1).map((r) => (
            <span key={r} className={`rs ${r <= game.log.length ? 'done' : ''} ${settings.revealRounds.includes(r) ? 'rv' : ''}`}
              style={game.log[r - 1] ? { background: TICKET_COLOR[game.log[r - 1].ticket] } : undefined} />
          ))}
        </div>
      </header>

      <main className="game-body">
        <MapView pieces={pieces} legal={legal} possible={possible} threats={threats} reveals={reveals} trail={trail}
          plan={planning ? [game.pieces[0].position, ...plan] : []} pings={room.pings} previews={previews} lastMoves={lastMoves}
          selected={info ?? picker?.station ?? null} focus={focus} dimOthers onStation={onStation}>

          <div className="map-toggles">
            {settings.helper !== 'off' && !isMrX && replay === null && !over && (
              <button className={`chip ${helperOn ? 'on' : ''}`} onClick={() => setHelperOn(!helperOn)}>
                🔍 {helperOn && possible ? `Mr X could be at ${possible.size} station${possible.size === 1 ? '' : 's'}` : 'Show where Mr X could be'}
              </button>
            )}
            {isMrX && !over && (
              <>
                <button className={`chip ${helperOn ? 'on' : ''}`} onClick={() => setHelperOn(!helperOn)}>
                  🕵️ {helperOn && possible ? `Detectives’ view: ${possible.size} spot${possible.size === 1 ? '' : 's'}` : 'Detectives’ view'}
                </button>
                <button className={`chip ${threatsOn ? 'on warn-chip' : ''}`} onClick={() => setThreatsOn(!threatsOn)}>⚠ Danger zones</button>
              </>
            )}
            {myPiece && myPiece.position !== HIDDEN && replay === null && (
              <button className="chip" onClick={() => center(firstMove?.to ?? myPiece.position)}>📍 My piece</button>
            )}
          </div>

          {replay !== null && (
            <div className="replay-bar">
              <button className="btn small" onClick={() => setReplay(Math.max(0, replay - 1))}>◀</button>
              <input type="range" min={0} max={game.log.length} value={replay} onChange={(e) => setReplay(+e.target.value)} />
              <button className="btn small" onClick={() => setReplay(Math.min(game.log.length, replay + 1))}>▶</button>
              <span className="replay-info">
                R{replay}: Mr X at <b>{game.mrxPath[replay]}</b>
                {possible && <> · detectives had {possible.size} candidate{possible.size === 1 ? '' : 's'}
                  {possible.has(game.mrxPath[replay]) ? '' : ' (off the helper!)'}</>}
                {replay > 0 && game.log[replay - 1] && <> · {TICKET_ICON[game.log[replay - 1].ticket]}</>}
              </span>
              <button className="btn small ghost" onClick={() => { setReplay(null); setShowResult(true); }}>Done</button>
            </div>
          )}

          {info !== null && replay === null && (
            <div className="station-info">
              <div className="row between">
                <b>Station {info}</b>
                <button className="icon-btn" onClick={() => setInfo(null)}>✕</button>
              </div>
              <div className="ticket-row">
                {infoTransports.map((t) => (
                  <span key={t} className="tk" style={{ borderColor: TICKET_COLOR[t] }}>{t}</span>
                ))}
              </div>
              {possible?.has(info) && <p className="warn good">Mr X could be here ({Math.round(possible.get(info)! * 100)}%).</p>}
              {myTurn && !legal.has(info) && <p className="muted small">You can’t reach this station this turn.</p>}
              {isDetective && !over && (
                <div className="ping-buttons">
                  {PING_LABELS.map((label) => (
                    <button key={label} className="btn small" onClick={() => { socket.emit('team:ping', { station: info, label }); setInfo(null); }}>
                      📌 {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </MapView>

        <aside className={`sidebar ${sheetOpen ? 'open' : ''}`}>
          <button className="sheet-handle" onClick={() => setSheetOpen(!sheetOpen)} aria-label="Toggle panel">
            <span />
          </button>

          {myPiece && (
            <div className="my-tickets" onClick={() => setSheetOpen(!sheetOpen)}>
              <span className="mt-name" style={{ color: myPiece.id === 'mrx' ? undefined : myPiece.color }}>
                {myPiece.id === 'mrx' ? '🎩 Mr X' : myPiece.name}
              </span>
              {(myPiece.id === 'mrx' ? (['taxi', 'bus', 'underground', 'black', 'double'] as const) : (['taxi', 'bus', 'underground'] as const)).map((t) => (
                <span key={t} className={`tk ${myPiece.tickets[t] === 0 ? 'empty' : ''}`} style={{ borderColor: TICKET_COLOR[t] }}>
                  {TICKET_ICON[t]} {myPiece.tickets[t]}
                </span>
              ))}
            </div>
          )}

          <nav className="tabs">
            {tabs.map(([id, label]) => (
              <button key={id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); setSheetOpen(true); }}>
                {label}
                {id === 'chat' && unread > 0 && !chatVisible && <i className="badge">{unread > 9 ? '9+' : unread}</i>}
              </button>
            ))}
          </nav>

          <div className="tab-body">
            {tab === 'log' && <TravelLog game={game} truePath={isMrX || over ? game.mrxPath : null} onStation={center} />}
            {tab === 'players' && <Players room={room} onStation={center} />}
            {tab === 'chat' && <Chat room={room} />}
            {tab === 'plan' && isMrX && (
              <div className="plan-panel">
                <p className="muted small">Sketch an escape route. Only you can see this — nothing is sent to anyone.</p>
                <button className={`btn ${planning ? 'primary' : ''}`} onClick={() => { setPlanning(!planning); setSheetOpen(false); }}>
                  {planning ? '✓ Stop planning' : '✏️ Start tapping stations'}
                </button>
                {plan.length > 0 && (
                  <>
                    <ol className="plan-steps">
                      {plan.map((s, i) => {
                        const from = i === 0 ? game.pieces[0].position : plan[i - 1];
                        const round = game.log.length + i + 1;
                        return (
                          <li key={i}>
                            <span>R{round}</span> {from} → <b>{s}</b>
                            <span className="plan-tickets">
                              {ticketsBetween(from, s).map((t) => <i key={t} style={{ background: TICKET_COLOR[t] }} title={t} />)}
                            </span>
                            {settings.revealRounds.includes(round) && <span className="bad"> 👁 revealed</span>}
                          </li>
                        );
                      })}
                    </ol>
                    <button className="btn small ghost" onClick={() => setPlan([])}>Clear route</button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="side-actions">
            {!over && you.role !== 'spectator' && room.canUndo && (
              <button className="btn small ghost" onClick={() => act(request('undo:request'))}>↶ Ask to undo</button>
            )}
            {you.isHost && !over && (
              <>
                <button className="btn small ghost" onClick={() => socket.emit('host:pause', !room.paused)}>
                  {room.paused ? '▶ Resume' : '⏸ Pause'}
                </button>
                <button className="btn small ghost danger" onClick={() => setConfirming({ text: 'End the game for everyone?', run: () => socket.emit('host:end') })}>End game</button>
              </>
            )}
            {over && <button className="btn small" onClick={() => setShowResult(true)}>Results</button>}
            <button className="btn small ghost" onClick={() => setHelp(true)} title="How to play">❓</button>
            <button className="btn small ghost" onClick={() => setSound(!sound)} title={sound ? 'Mute sounds' : 'Unmute sounds'}>{sound ? '🔊' : '🔇'}</button>
            {you.role !== 'spectator' && !over && (
              <button className={`btn small ghost ${notify ? 'on' : ''}`} onClick={enableNotifications} title="Notify me when it’s my move">{notify ? '🔔' : '🔕'}</button>
            )}
            <button className="btn small ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme">{theme === 'dark' ? '☀️' : '🌙'}</button>
            <button className="btn small ghost" onClick={() => setConfirming({ text: 'Leave this game? You can rejoin later with the room code.', run: leave })}>Leave</button>
          </div>
        </aside>
      </main>

      {undoVotePending && (
        <div className="vote-bar">
          <span>{room.players.find((p) => p.id === room.undoVote!.requestedBy)?.name} wants to undo the last move.</span>
          <button className="btn small primary" onClick={() => socket.emit('undo:vote', true)}>Allow</button>
          <button className="btn small" onClick={() => socket.emit('undo:vote', false)}>Decline</button>
        </div>
      )}

      {picker && (
        <MovePicker game={game} pieceIndex={game.turn} station={picker.station} tickets={picker.tickets}
          firstMove={firstMove} possible={possibleLocations(game.log, detectives)} onConfirm={confirm} onCancel={cancelPicker} />
      )}

      {firstMove && !picker && (
        <div className="vote-bar">
          <span>First step: {TICKET_ICON[firstMove.ticket]} to {firstMove.to}. Tap a highlighted station for the second step.</span>
          <button className="btn small" onClick={() => setFirstMove(null)}>Cancel double move</button>
        </div>
      )}

      {over && showResult && replay === null && (
        <GameOver room={room} onClose={() => setShowResult(false)} onReplay={() => { setShowResult(false); setReplay(0); }} />
      )}

      {help && <HowToPlay onClose={() => setHelp(false)} />}

      {confirming && (
        <div className="sheet-backdrop" onClick={() => setConfirming(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>{confirming.text}</h3>
            <div className="row gap">
              <button className="btn primary" onClick={() => { confirming.run(); setConfirming(null); }}>Yes</button>
              <button className="btn" onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {hidden && (
        <button className="privacy-screen" onClick={() => setHidden(false)}>
          <span>🎩</span>
          Screen hidden
          <small>Tap to show</small>
        </button>
      )}
    </div>
  );
}

