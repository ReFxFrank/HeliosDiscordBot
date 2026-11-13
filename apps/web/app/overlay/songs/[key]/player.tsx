'use client';

import { useEffect, useRef, useState } from 'react';

interface Song {
  id: string;
  videoId: string;
  title: string;
  requestedBy: string;
}

interface PlayerState {
  playing: Song | null;
  queued: number;
  volume: number;
}

interface YTPlayer {
  loadVideoById(id: string): void;
  stopVideo(): void;
  setVolume(volume: number): void;
  playVideo(): void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        options: {
          height: string;
          width: string;
          playerVars: Record<string, number>;
          events: {
            onReady: () => void;
            onStateChange: (event: { data: number }) => void;
            onError: () => void;
          };
        },
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

/**
 * Plays the queue with YouTube's embedded player. Every few seconds it asks
 * the server what should be playing, so skips from chat or the dashboard
 * take effect, and it starts the next song when one ends.
 */
export function SongPlayer({ apiKey }: { apiKey: string }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const loaded = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<Song | null>(null);
  const [queued, setQueued] = useState(0);
  const [started, setStarted] = useState(false);

  const api = (method: 'GET' | 'POST', body?: Record<string, unknown>) =>
    fetch(`/api/songs/${apiKey}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
      .then((res) => (res.ok ? (res.json() as Promise<PlayerState>) : null))
      .catch(() => null);

  const apply = (state: PlayerState | null) => {
    if (!state || !player.current) return;
    player.current.setVolume(state.volume);
    setQueued(state.queued);
    setNow(state.playing);
    if (state.playing && state.playing.id !== loaded.current) {
      loaded.current = state.playing.id;
      player.current.loadVideoById(state.playing.videoId);
    } else if (!state.playing && loaded.current) {
      loaded.current = null;
      player.current.stopVideo();
    }
  };

  useEffect(() => {
    if (window.YT?.Player) {
      setReady(true);
      return;
    }
    window.onYouTubeIframeAPIReady = () => setReady(true);
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!ready || !host.current || !window.YT) return;
    player.current = new window.YT.Player(host.current, {
      height: '100%',
      width: '100%',
      playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => void api('POST', { action: 'next' }).then(apply),
        onStateChange: (event) => {
          if (event.data === 1) setStarted(true);
          // 0 = ended: finish this song and start the next.
          if (event.data === 0 && loaded.current) {
            const id = loaded.current;
            void api('POST', { action: 'ended', id })
              .then(() => api('POST', { action: 'next' }))
              .then(apply);
          }
        },
        onError: () => {
          const id = loaded.current;
          if (!id) return;
          void api('POST', { action: 'error', id })
            .then(() => api('POST', { action: 'next' }))
            .then(apply);
        },
      },
    });
    const timer = setInterval(() => {
      // Nothing playing: try to start the next song; otherwise just sync.
      void api('POST', { action: loaded.current ? 'sync' : 'next' }).then(apply);
    }, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'transparent',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, opacity: started ? 1 : 0 }}>
        <div ref={host} />
      </div>
      {!started && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            fontSize: 14,
            textShadow: '0 1px 3px #000',
          }}
        >
          {now ? `▶ ${now.title}` : `Song player ready · ${queued} in queue`}
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            In OBS this starts on its own. In a normal browser, click the page once to allow sound.
          </div>
        </div>
      )}
    </div>
  );
}
