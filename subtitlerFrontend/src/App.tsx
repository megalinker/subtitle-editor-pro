import { useState, useMemo, useEffect, useRef } from 'react';
import { Segment } from './types';
import { transcribeFile, resyncTranscript, renameSpeakers, refineDiarization } from './api';
import { SegmentLine } from './SegmentLine';
import { VideoPlayer } from './VideoPlayer';
import { AudioWaveform } from './AudioWaveform';
import './App.css';

type Status = 'idle' | 'transcribing' | 'resyncing' | 'renaming' | 'refining';

const downloadSrt = (filename: string, segments: Segment[], options: any) => {
  let srtContent = "";
  let counter = 1;

  segments.forEach(segment => {
    const formatSrtTime = (seconds: number) => new Date(seconds * 1000).toISOString().substr(11, 12).replace('.', ',');
    const start = formatSrtTime(segment.start);
    const end = formatSrtTime(segment.end);

    let text = segment.text.trim();
    if (options.showSpeakers && segment.speaker) {
      text = `[${segment.speaker}]: ${text}`;
    }

    let lines: string[] = [text];
    if (options.autoLineBreak) {
      lines = [];
      const words = text.split(' ');
      let currentLine = '';
      for (const word of words) {
        if ((currentLine + ' ' + word).trim().length > options.maxChars && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = (currentLine + ' ' + word).trim();
        }
      }
      lines.push(currentLine);
      if (lines.length > options.maxLines) {
        lines = lines.slice(0, options.maxLines);
      }
    }

    srtContent += `${counter++}\n`;
    srtContent += `${start} --> ${end}\n`;
    srtContent += `${lines.join('\n')}\n\n`;
  });

  const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename.split('.')[0] || 'subtitles'}.srt`;
  a.click();
  URL.revokeObjectURL(url);
};

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const [exportOptions, setExportOptions] = useState({
    showSpeakers: true,
    autoLineBreak: true,
    maxLines: 2,
    maxChars: 42,
  });

  const videoRef = useRef<HTMLVideoElement>(null);

  const uniqueSpeakers = useMemo(
    () => Array.from(new Set(segments.map(s => s.speaker).filter((s): s is string => typeof s === 'string' && !!s))).sort(),
    [segments]
  );

  useEffect(() => {
    if (file && (file.type.startsWith('video/') || file.type.startsWith('audio/'))) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      return () => URL.revokeObjectURL(url);
    }
    setVideoSrc('');
  }, [file]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') {
        return;
      }

      e.preventDefault();

      if (e.code === 'Space') {
        videoRef.current?.paused ? videoRef.current?.play() : videoRef.current?.pause();
      }

      const isModKey = e.metaKey || e.ctrlKey;

      if (isModKey && activeSegmentIndex !== null) {
        if (e.key === 'j') {
          handleMergeDown(activeSegmentIndex);
        }
        if (e.key === 'k') {
          const segmentText = segments[activeSegmentIndex].text;
          handleSplit(activeSegmentIndex, Math.floor(segmentText.length / 2));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeSegmentIndex, segments]);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setSegments([]);
    setSpeakerMap({});
    setCurrentTime(0);
    setActiveSegmentIndex(null);
  };

  const handleTranscribe = async () => {
    if (!file) return;
    setStatus('transcribing');
    setError('');
    setSegments([]);
    setSpeakerMap({});
    try {
      const response = await transcribeFile(file);
      setSegments(response.data.segments);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An unknown error occurred.');
    } finally {
      setStatus('idle');
    }
  };

  const handleSegmentTextChange = (index: number, newText: string) => {
    const updatedSegments = [...segments];
    updatedSegments[index].text = newText;
    setSegments(updatedSegments);
  };

  const handleSegmentSpeakerChange = (index: number, newSpeaker: string) => {
    const updatedSegments = [...segments];
    updatedSegments[index].speaker = newSpeaker;
    setSegments(updatedSegments);
  };

  const handleRenameSpeakerInPlace = (oldName: string, newName: string) => {
    setSpeakerMap(prevMap => {
      const newMap = { ...prevMap };
      newMap[oldName] = newName;
      for (const key in newMap) {
        if (newMap[key] === oldName) {
          newMap[key] = newName;
        }
      }
      return newMap;
    });

    setSegments(prevSegments =>
      prevSegments.map(seg =>
        seg.speaker === oldName ? { ...seg, speaker: newName } : seg
      )
    );
  };

  const handleMergeDown = (index: number) => {
    if (index >= segments.length - 1) return;
    const segmentA = segments[index];
    const segmentB = segments[index + 1];
    if (!segmentA || !segmentB) return;

    const mergedSegment: Segment = {
      start: segmentA.start,
      end: segmentB.end,
      text: `${segmentA.text.trim()} ${segmentB.text.trim()}`,
      speaker: segmentA.speaker,
    };

    setSegments([
      ...segments.slice(0, index),
      mergedSegment,
      ...segments.slice(index + 2),
    ]);
  };

  const handleSplit = (index: number, cursorPosition: number) => {
    const segment = segments[index];
    if (!segment || cursorPosition === 0 || cursorPosition === segment.text.length) return;

    const textA = segment.text.substring(0, cursorPosition).trim();
    const textB = segment.text.substring(cursorPosition).trim();
    if (!textA || !textB) return;

    const duration = segment.end - segment.start;
    const splitRatio = cursorPosition / segment.text.length;
    const splitTime = segment.start + (duration * splitRatio);

    const segmentA: Segment = { ...segment, end: splitTime, text: textA };
    const segmentB: Segment = { ...segment, start: splitTime, text: textB };

    setSegments([
      ...segments.slice(0, index),
      segmentA,
      segmentB,
      ...segments.slice(index + 1),
    ]);
  };

  const handleResync = async () => {
    if (!file || segments.length === 0) return;
    setStatus('resyncing');
    setError('');
    const editedTranscript = segments.map(seg => seg.text).join('\n');
    try {
      const response = await resyncTranscript(file, editedTranscript);
      setSegments(response.data.segments);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An unknown error occurred.');
    } finally {
      setStatus('idle');
    }
  };

  const handleRenameSpeakers = async () => {
    if (uniqueSpeakers.length === 0) return;
    setStatus('renaming');
    setError('');
    try {
      const response = await renameSpeakers(segments, speakerMap);
      setSegments(response.data.segments);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An unknown error occurred.');
    } finally {
      setStatus('idle');
    }
  };

  const handleRefine = async () => {
    if (!file || segments.length === 0) return;
    setStatus('refining');
    setError('');
    try {
      const response = await refineDiarization(file, segments);
      setSegments(response.data.segments);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An unknown error occurred.');
    } finally {
      setStatus('idle');
    }
  };

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
    setSeekTo(null);

    const activeIndex = segments.findIndex(s => time >= s.start && time <= s.end);
    if (activeIndex !== -1) {
      setActiveSegmentIndex(activeIndex);
    }
  };

  const handleSeek = (time: number) => {
    setSeekTo(time);
  };

  return (
    <div className="app-container">
      <header className="app-header">Subtitle Editor Pro</header>

      <main className="app-main">
        <div className="left-panel">
          <div className="control-panel">
            <h3>1. Load Media</h3>
            <div className="file-input-group">
              <input type="file" onChange={handleFileChange} />
              <div className="actions-group">
                <button onClick={handleTranscribe} disabled={status !== 'idle' || !file}>
                  {status === 'transcribing' ? 'Transcribing...' : 'Transcribe'}
                </button>
                <button onClick={handleResync} disabled={status !== 'idle' || segments.length === 0}>
                  {status === 'resyncing' ? 'Resyncing...' : 'Resync Edits'}
                </button>
                <button onClick={() => downloadSrt(file?.name || 'subtitles', segments, exportOptions)} disabled={status !== 'idle' || segments.length === 0}>
                  Download .srt
                </button>
              </div>
            </div>
            {error && <p style={{ color: 'var(--danger)' }}>Error: {error}</p>}
          </div>

          <div className="options-panel">
            <h3>Export Options</h3>
            <div className="options-grid">
              <div className="option-item">
                <label>Show Speakers</label>
                <label className="toggle-switch">
                  <input type="checkbox" checked={exportOptions.showSpeakers} onChange={e => setExportOptions({ ...exportOptions, showSpeakers: e.target.checked })} />
                  <span className="slider"></span>
                </label>
              </div>
              <div className="option-item">
                <label>Auto Line Break</label>
                <label className="toggle-switch">
                  <input type="checkbox" checked={exportOptions.autoLineBreak} onChange={e => setExportOptions({ ...exportOptions, autoLineBreak: e.target.checked })} />
                  <span className="slider"></span>
                </label>
              </div>
              <div className="option-item">
                <label htmlFor="max-lines">Max Lines ({exportOptions.maxLines})</label>
                <input type="range" id="max-lines" min="1" max="10" value={exportOptions.maxLines} onChange={e => setExportOptions({ ...exportOptions, maxLines: +e.target.value })} disabled={!exportOptions.autoLineBreak} />
              </div>
              <div className="option-item">
                <label htmlFor="max-chars">Max Chars/Line ({exportOptions.maxChars})</label>
                <input type="range" id="max-chars" min="20" max="100" value={exportOptions.maxChars} onChange={e => setExportOptions({ ...exportOptions, maxChars: +e.target.value })} disabled={!exportOptions.autoLineBreak} />
              </div>
            </div>
          </div>

          {uniqueSpeakers.length > 0 && (
            <div className="speaker-editor">
              <h3>Edit & Refine Speakers</h3>
              <div className="speaker-inputs">
                {uniqueSpeakers.map(id => (
                  <div key={id}>
                    <label>{id}</label>
                    <input type="text" placeholder="New name..." value={speakerMap[id] || ''} onChange={(e) => setSpeakerMap({ ...speakerMap, [id]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div className="actions-group" style={{ marginTop: '1rem' }}>
                <button onClick={handleRenameSpeakers} disabled={status !== 'idle'}>
                  {status === 'renaming' ? 'Applying...' : 'Apply Names'}
                </button>
                <button onClick={handleRefine} disabled={status !== 'idle'}>
                  {status === 'refining' ? 'Refining...' : 'Refine with AI'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="right-panel">
          <VideoPlayer videoRef={videoRef} src={videoSrc} onTimeUpdate={handleTimeUpdate} seekTo={seekTo} />

          {videoSrc && (
            <div className="waveform-container">
              <AudioWaveform mediaElement={videoRef.current} onSeek={handleSeek} />
            </div>
          )}

          <div className="subtitle-editor-header">
            <h3>Transcript</h3>
          </div>
          <div className="subtitle-editor-list">
            {segments.map((segment, index) => {
              const isActive = currentTime >= segment.start && currentTime <= segment.end;
              return (
                <SegmentLine
                  key={`${index}-${segment.start}-${segment.end}`}
                  segment={segment}
                  isActive={isActive}
                  onSeek={() => handleSeek(segment.start)}
                  onTextChange={(newText) => handleSegmentTextChange(index, newText)}
                  uniqueSpeakers={uniqueSpeakers}
                  onSpeakerChange={(newSpeaker) => handleSegmentSpeakerChange(index, newSpeaker)}
                  onRenameSpeaker={handleRenameSpeakerInPlace}
                  onSplit={(cursor) => handleSplit(index, cursor)}
                  onMergeDown={() => handleMergeDown(index)}
                  isLastSegment={index === segments.length - 1}
                />
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;