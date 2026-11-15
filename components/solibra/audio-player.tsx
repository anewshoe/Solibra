'use client';

import { useRef, useState } from 'react';
import { Pause } from 'lucide-react';
import { useNotice } from './shell';
import { formatDuration } from './voice/use-voice-preview';

const bars = [8,25,13,30,18,35,23,11,28,16,33,21,9,26,14,31,19,36,24,12,29,17,34,22,10,27,15,32,20,8,25,13];
export function AudioPlayer({ src, durationMs = 102_000, label = 'Original recording', showUnavailable = true }: { src?: string; durationMs?: number; label?: string; showUnavailable?: boolean }) {
  const notice = useNotice();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(durationMs / 1000);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    if (!src) { notice('Sample recording', 'This sample has no playable audio file. Record your own story to preview original audio here.'); return; }
    try { setError(null); if (audio.current?.paused) await audio.current.play(); else audio.current?.pause(); }
    catch { setError('This recording could not play. Try again or use another browser.'); }
  }
  return <div className="sol-player">
    {src && <audio ref={audio} src={src} preload="metadata" aria-label={label} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={() => setPosition(audio.current?.currentTime || 0)} onLoadedMetadata={() => { if (audio.current && Number.isFinite(audio.current.duration)) setDuration(audio.current.duration); }} onError={() => { setPlaying(false); setError('Audio is unavailable. The transcript is still here.'); }} />}
    <div className="audio-controls">
      <button className="audio-play" aria-label={`${playing ? 'Pause' : 'Play'} ${label}${src ? '' : ' (sample audio unavailable)'}`} onClick={() => void toggle()}>{playing ? <Pause size={20} /> : <img src="/solibra/play.svg" width={44} height={44} alt="" />}</button>
      <div className="player-waveform">
        <div className="audio-waveform" aria-hidden="true">{bars.map((height, index) => <span key={index} style={{ height }} className={src ? index / bars.length > position / (duration || 1) ? 'wave-unplayed' : '' : index > 12 ? 'wave-unplayed' : ''} />)}</div>
        {src && <input type="range" aria-label={`Seek ${label}`} min={0} max={duration || 1} step={.1} value={Math.min(position, duration)} onChange={(event) => { try { if (audio.current) audio.current.currentTime = Number(event.target.value); setPosition(Number(event.target.value)); } catch { setError('Start playback before seeking in this browser.'); } }} />}
      </div>
      <span className="audio-duration">{formatDuration((playing ? position : duration) * 1000)}</span>
    </div>
    {!src && showUnavailable && <p className="audio-unavailable">Sample audio unavailable</p>}
    {error && <p className="voice-error" role="alert">{error}</p>}
  </div>;
}
