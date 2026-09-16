import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '../../../shared/protocol';
import { socket } from '../socket';

export function Chat({ room, compact }: { room: RoomView; compact?: boolean }) {
  const canTeam = room.you.role === 'detective' && room.phase !== 'lobby';
  const [channel, setChannel] = useState<'all' | 'team'>(canTeam ? 'team' : 'all');
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const messages = room.chat.filter((m) => m.channel === channel || (channel === 'all' && m.playerId === 'system'));

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length, channel]);

  useEffect(() => {
    if (!canTeam && channel === 'team') setChannel('all');
  }, [canTeam, channel]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    socket.emit('chat:send', { channel, text });
    setText('');
  };

  return (
    <div className={`chat ${compact ? 'compact' : ''}`}>
      {canTeam && (
        <div className="seg">
          <button className={channel === 'team' ? 'on' : ''} onClick={() => setChannel('team')}>🔒 Detectives</button>
          <button className={channel === 'all' ? 'on' : ''} onClick={() => setChannel('all')}>Everyone</button>
        </div>
      )}
      <div className="chat-list" ref={list}>
        {!messages.length && <p className="muted small center">
          {channel === 'team' ? 'Private to detectives — Mr X can’t read this.' : 'No messages yet.'}
        </p>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.playerId === 'system' ? 'system' : ''} ${m.playerId === room.you.playerId ? 'mine' : ''}`}>
            {m.playerId !== 'system' && <b>{m.name}</b>}
            <span>{m.text}</span>
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={send}>
        <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)}
          placeholder={channel === 'team' ? 'Message detectives…' : 'Message everyone…'} />
        <button className="btn small">Send</button>
      </form>
    </div>
  );
}
