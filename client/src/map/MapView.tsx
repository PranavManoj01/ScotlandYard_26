import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { EDGES, MAP_HEIGHT, MAP_WIDTH, STATIONS, STATION_BY_ID, transportsAt } from '../../../shared/map/graph';
import type { MoveTicket } from '../../../shared/rules/types';
import type { Ping } from '../../../shared/protocol';
import { TICKET_COLOR } from '../lib/derive';

export interface MapPiece { id: string; color: string; position: number; label: string; isMrX?: boolean; ghost?: boolean; active?: boolean }

export interface MapViewProps {
  pieces: MapPiece[];
  legal?: Map<number, MoveTicket[]>;
  possible?: Map<number, number> | null;
  threats?: Map<number, 1 | 2> | null;
  reveals?: { station: number; round: number }[];
  trail?: number[] | null;
  plan?: number[];
  pings?: Ping[];
  previews?: { from: number; to: number; color: string }[];
  lastMoves?: { from: number; to: number; color: string }[];
  selected?: number | null;
  focus?: { station: number; nonce: number } | null;
  dimOthers?: boolean;
  onStation?: (station: number) => void;
  children?: ReactNode;
}

const pos = (id: number) => STATION_BY_ID.get(id)!;

const BaseLayer = memo(function BaseLayer() {
  const layers: Array<{ type: string; width: number; dash?: string }> = [
    { type: 'underground', width: 9 },
    { type: 'bus', width: 5.5 },
    { type: 'taxi', width: 2.2 },
    { type: 'ferry', width: 3, dash: '10 8' },
  ];
  return (
    <g>
      <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} className="map-bg" rx={24} />
      <defs>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" className="map-grid" fill="none" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#grid)" rx={24} />
      {layers.map((layer) => (
        <g key={layer.type} stroke={TICKET_COLOR[layer.type]} strokeWidth={layer.width} strokeDasharray={layer.dash}
          strokeLinecap="round" opacity={layer.type === 'taxi' ? 0.9 : 0.75}>
          {EDGES.filter((e) => e[2] === layer.type).map(([a, b]) => {
            const pa = pos(a); const pb = pos(b);
            return <line key={`${a}-${b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} />;
          })}
        </g>
      ))}
    </g>
  );
});

const StationLayer = memo(function StationLayer() {
  return (
    <g className="stations">
      {STATIONS.map((s) => {
        const types = transportsAt(s.id);
        const ring = types.includes('underground') ? TICKET_COLOR.underground : types.includes('bus') ? TICKET_COLOR.bus : TICKET_COLOR.taxi;
        return (
          <g key={s.id} transform={`translate(${s.x} ${s.y})`}>
            <circle r={17} fill={ring} />
            {types.includes('underground') && types.includes('bus') && (
              <path d="M -17 0 A 17 17 0 0 0 17 0 Z" fill={TICKET_COLOR.bus} />
            )}
            <circle r={12.5} className="station-core" />
            <text className="station-num" textAnchor="middle" dy="4.2">{s.id}</text>
          </g>
        );
      })}
    </g>
  );
});

function ringSegments(tickets: MoveTicket[], r: number) {
  const c = 2 * Math.PI * r;
  const seg = c / tickets.length;
  return tickets.map((t, i) => (
    <circle key={t} r={r} fill="none" stroke={TICKET_COLOR[t]} strokeWidth={5}
      strokeDasharray={tickets.length === 1 ? undefined : `${seg - 3} ${c - seg + 3}`}
      strokeDashoffset={-seg * i} className={t === 'black' ? 'ring-black' : undefined} />
  ));
}

export function MapView(props: MapViewProps) {
  const { pieces, legal, possible, threats, reveals = [], trail, plan = [], pings = [], previews = [], lastMoves = [], selected, focus, onStation } = props;
  const wrapper = useRef<HTMLDivElement>(null);
  const api = useRef<ReactZoomPanPinchRef>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useLayoutEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitScale = Math.min(size.w / MAP_WIDTH, size.h / MAP_HEIGHT) * 0.98;

  const centerOn = (station: number, scale = Math.max(fitScale * 2.2, 0.9)) => {
    const s = pos(station);
    // Keep the board filling the view where possible, so edge stations don't leave half the screen empty.
    const clamp = (v: number, viewport: number, content: number) =>
      content <= viewport ? (viewport - content) / 2 : Math.min(0, Math.max(viewport - content, v));
    const x = clamp(size.w / 2 - s.x * scale, size.w, MAP_WIDTH * scale);
    const y = clamp(size.h / 2 - s.y * scale, size.h, MAP_HEIGHT * scale);
    api.current?.setTransform(x, y, scale, 450, 'easeOut');
  };
  const fit = () => {
    api.current?.setTransform((size.w - MAP_WIDTH * fitScale) / 2, (size.h - MAP_HEIGHT * fitScale) / 2, fitScale, 300, 'easeOut');
  };

  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && size.w > 100) {
      fitted.current = true;
      setTimeout(() => api.current?.setTransform((size.w - MAP_WIDTH * fitScale) / 2, (size.h - MAP_HEIGHT * fitScale) / 2, fitScale, 0), 0);
    }
  }, [size, fitScale]);

  useEffect(() => {
    if (focus) centerOn(focus.station);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  const maxP = possible ? Math.max(...possible.values(), 0.0001) : 1;
  const click = (station: number, e: React.MouseEvent) => {
    const start = down.current;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return;
    onStation?.(station);
  };

  const revealPath = reveals.map((r) => pos(r.station));

  return (
    <div className={`map-wrap ${legal?.size && props.dimOthers ? 'has-legal' : ''}`} ref={wrapper}
      onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}>
      <TransformWrapper ref={api} minScale={0.15} maxScale={5} limitToBounds={false} initialScale={fitScale}
        doubleClick={{ disabled: true }} wheel={{ step: 0.12 }} pinch={{ step: 6 }}>
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
          <svg width={MAP_WIDTH} height={MAP_HEIGHT} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="map-svg">
            <defs>
              <radialGradient id="glow">
                <stop offset="0%" stopColor="#ff3b4a" stopOpacity="0.95" />
                <stop offset="60%" stopColor="#ff3b4a" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#ff3b4a" stopOpacity="0" />
              </radialGradient>
              <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodOpacity="0.55" />
              </filter>
            </defs>
            <BaseLayer />

            {threats && [...threats].map(([s, level]) => (
              <circle key={`t${s}`} cx={pos(s).x} cy={pos(s).y} r={level === 1 ? 26 : 22}
                className={level === 1 ? 'threat-1' : 'threat-2'} />
            ))}

            {possible && [...possible].map(([s, p]) => (
              <circle key={`p${s}`} cx={pos(s).x} cy={pos(s).y} r={30 + 16 * (p / maxP)} fill="url(#glow)"
                opacity={0.35 + 0.65 * (p / maxP)} className="possible" />
            ))}

            {revealPath.length > 1 && (
              <polyline points={revealPath.map((p) => `${p.x},${p.y}`).join(' ')} className="reveal-path" fill="none" />
            )}

            <StationLayer />

            {legal && [...legal].map(([s, tickets]) => (
              <g key={`l${s}`} transform={`translate(${pos(s).x} ${pos(s).y})`} className="legal">
                {ringSegments(tickets, 22)}
              </g>
            ))}

            {selected && (
              <circle cx={pos(selected).x} cy={pos(selected).y} r={27} className="selected-ring" />
            )}

            {reveals.map((r, i) => {
              const p = pos(r.station);
              const latest = i === reveals.length - 1;
              return (
                <g key={`r${r.round}`} transform={`translate(${p.x} ${p.y})`} className="reveal-ghost" opacity={latest ? 1 : 0.55}>
                  <circle r={19} className="ghost-ring" />
                  <text textAnchor="middle" dy="7" className="ghost-x">X</text>
                  <g transform="translate(0 -32)">
                    <rect x={-20} y={-11} width={40} height={20} rx={10} className="ghost-pill" />
                    <text textAnchor="middle" dy="4" className="ghost-label">R{r.round}</text>
                  </g>
                </g>
              );
            })}

            {trail && trail.length > 1 && (
              <polyline points={trail.map((s) => `${pos(s).x},${pos(s).y}`).join(' ')} className="mrx-trail" fill="none" />
            )}

            {plan.length > 0 && (
              <g className="plan">
                <polyline points={plan.map((s) => `${pos(s).x},${pos(s).y}`).join(' ')} fill="none" />
                {plan.map((s, i) => (
                  <g key={`plan${i}`} transform={`translate(${pos(s).x + 16} ${pos(s).y + 16})`}>
                    <circle r={10} />
                    <text textAnchor="middle" dy="4">{i}</text>
                  </g>
                ))}
              </g>
            )}

            {lastMoves.map((m, i) => {
              const a = pos(m.from); const b = pos(m.to);
              return (
                <g key={`lm${i}`} className="last-move">
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={m.color} />
                  <circle cx={a.x} cy={a.y} r={8} stroke={m.color} />
                </g>
              );
            })}

            {previews.map((pv, i) => {
              const a = pos(pv.from); const b = pos(pv.to);
              return <line key={`pv${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={pv.color} className="preview-line" />;
            })}

            {pings.map((pg) => {
              const p = pos(pg.station);
              return (
                <g key={pg.id} transform={`translate(${p.x} ${p.y - 24})`} className="ping" filter="url(#shadow)">
                  <path d="M0 18 L-9 2 A 11 11 0 1 1 9 2 Z" />
                  <text textAnchor="middle" dy="-2">!</text>
                  <g transform="translate(0 -24)">
                    <rect x={-(pg.label.length * 3.6 + 30)} y={-10} width={pg.label.length * 7.2 + 60} height={19} rx={9.5} />
                    <text textAnchor="middle" dy="4" className="ping-label">{pg.name.split(' ')[0]}: {pg.label}</text>
                  </g>
                </g>
              );
            })}

            {pieces.map((pc) => {
              const p = pos(pc.position);
              if (!p) return null;
              return (
                // CSS transform (not the SVG attribute) so pawns glide to their new station.
                <g key={pc.id} style={{ transform: `translate(${p.x}px, ${p.y}px)` }} className={`piece ${pc.active ? 'active' : ''} ${pc.ghost ? 'ghost' : ''}`}
                  filter="url(#shadow)">
                  {pc.active && <circle r={30} className="active-ring" stroke={pc.isMrX ? '#fff' : pc.color} />}
                  <circle r={17} fill={pc.color} className={pc.isMrX ? 'pawn-mrx' : 'pawn'} />
                  <text textAnchor="middle" dy="5" className="pawn-label">{pc.isMrX ? 'X' : pc.position}</text>
                </g>
              );
            })}

            {/* Transparent hit targets on top so taps always land on a station. */}
            <g className="hits">
              {STATIONS.map((s) => (
                <circle key={s.id} id={`st-${s.id}`} cx={s.x} cy={s.y} r={24} fill="transparent"
                  onClick={(e) => click(s.id, e)} style={{ cursor: onStation ? 'pointer' : 'default' }} />
              ))}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>
      <div className="map-controls">
        <button onClick={() => api.current?.zoomIn(0.4)} aria-label="Zoom in">＋</button>
        <button onClick={() => api.current?.zoomOut(0.4)} aria-label="Zoom out">－</button>
        <button onClick={fit} aria-label="Fit map">⤢</button>
      </div>
      <MapLegend />
      {props.children}
    </div>
  );
}

function MapLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className={`legend ${open ? 'open' : ''}`}>
      <button onClick={() => setOpen(!open)}>{open ? 'Hide key' : 'Key'}</button>
      {open && (
        <ul>
          <li><i style={{ background: TICKET_COLOR.taxi }} /> Taxi</li>
          <li><i style={{ background: TICKET_COLOR.bus }} /> Bus</li>
          <li><i style={{ background: TICKET_COLOR.underground }} /> Underground</li>
          <li><i className="dashed" /> Ferry (black ticket only)</li>
          <li><i className="glow" /> Where Mr X could be</li>
          <li><i className="ghost" /> Mr X last seen</li>
        </ul>
      )}
    </div>
  );
}
