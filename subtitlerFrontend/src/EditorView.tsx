import { useState, useMemo, useEffect, useRef } from 'react';
import { Project, Segment, FileSignature } from './types';
import { transcribeFile, resyncTranscript, renameSpeakers, refineDiarization } from './api';
import { SegmentLine } from './SegmentLine';
import { VideoPlayer } from './VideoPlayer';
import { AudioWaveform } from './AudioWaveform';

type Status = 'idle' | 'transcribing' | 'resyncing' | 'renaming' | 'refining';

// ... [Keep downloadSrt and createFileSignature helper functions exactly as they were] ...
// (Omitting helper function code for brevity, assume it is unchanged from previous version)
const downloadSrt = (filename: string, segments: Segment[], options: any) => {
    const formatSrtTime = (totalSeconds: number) => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const milliseconds = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
        const pad = (num: number, size: number = 2) => num.toString().padStart(size, '0');
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`;
    };

    let srtContent = "";
    let counter = 1;

    if (options.useStrictMode) {
        const maxChars = 7;
        const maxDuration = 1.2;

        segments.forEach(segment => {
            if (!segment.words || segment.words.length === 0) {
                srtContent += `${counter++}\n`;
                srtContent += `${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n`;
                srtContent += `${segment.text.trim() || ''}\n\n`;
                return;
            }

            let currentLineText = '';
            let currentLineStartTime: number | null = null;
            let lastWordEnd: number | null = null;

            const writeCurrentLine = () => {
                if (currentLineText && currentLineStartTime !== null && lastWordEnd !== null) {
                    const endTime = Math.max(lastWordEnd, currentLineStartTime + 0.001);
                    srtContent += `${counter++}\n`;
                    srtContent += `${formatSrtTime(currentLineStartTime)} --> ${formatSrtTime(endTime)}\n`;
                    srtContent += `${currentLineText}\n\n`;
                }
            };

            segment.words.forEach((word) => {
                if (word.start === undefined || word.end === undefined || !word.word) return;

                if (currentLineStartTime === null) {
                    currentLineText = word.word;
                    currentLineStartTime = word.start;
                    lastWordEnd = word.end;
                } else {
                    const potentialText = `${currentLineText} ${word.word}`;
                    const potentialDuration = word.end - currentLineStartTime;

                    if ((potentialText.length > maxChars && currentLineText.length > 0) || potentialDuration > maxDuration) {
                        writeCurrentLine();
                        currentLineText = word.word;
                        currentLineStartTime = word.start;
                        lastWordEnd = word.end;
                    } else {
                        currentLineText = potentialText;
                        lastWordEnd = word.end;
                    }
                }
            });
            writeCurrentLine();
        });
    } else {
        segments.forEach(segment => {
            let fullText = segment.text.trim();
            if (options.showSpeakers && segment.speaker) {
                fullText = `[${segment.speaker}]: ${fullText}`;
            }

            if (!options.autoLineBreak || !fullText) {
                srtContent += `${counter++}\n`;
                srtContent += `${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n`;
                srtContent += `${fullText || ''}\n\n`;
                return;
            }

            const allLines: string[] = [];
            const words = fullText.split(' ');
            let currentLine = '';

            for (const word of words) {
                if ((currentLine + ' ' + word).trim().length > options.maxChars && currentLine.length > 0) {
                    allLines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = (currentLine + ' ' + word).trim();
                }
            }
            if (currentLine) {
                allLines.push(currentLine);
            }

            const totalChunks = Math.ceil(allLines.length / options.maxLines);
            const segmentDuration = segment.end - segment.start;

            for (let i = 0; i < allLines.length; i += options.maxLines) {
                const lineChunk = allLines.slice(i, i + options.maxLines);
                const chunkIndex = i / options.maxLines;
                const chunkDuration = segmentDuration / totalChunks;
                const chunkStart = segment.start + (chunkIndex * chunkDuration);
                let chunkEnd = segment.start + ((chunkIndex + 1) * chunkDuration);

                if (chunkIndex === totalChunks - 1) chunkEnd = segment.end;
                if (chunkEnd <= chunkStart) chunkEnd = chunkStart + 0.001;

                srtContent += `${counter++}\n`;
                srtContent += `${formatSrtTime(chunkStart)} --> ${formatSrtTime(chunkEnd)}\n`;
                srtContent += `${lineChunk.join('\n')}\n\n`;
            }
        });
    }

    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename.split('.')[0] || 'subtitles'}.srt`;
    a.click();
    URL.revokeObjectURL(url);
};

const createFileSignature = (file: File): FileSignature => ({
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
});

interface EditorViewProps {
    project: Project;
    onSave: (project: Project) => void;
    onClose: () => void;
    initialFile: File | null;
}

export const EditorView = ({ project, onSave, onClose, initialFile }: EditorViewProps) => {
    // ... [State declarations remain unchanged] ...
    const [projectName, setProjectName] = useState(project.name);
    const [file, setFile] = useState<File | null>(initialFile);
    const [videoSrc, setVideoSrc] = useState<string>('');
    const [segments, setSegments] = useState<Segment[]>(project.segments);
    const [speakerMap, setSpeakerMap] = useState<Record<string, string>>(project.speakerMap);
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState('');
    const [currentTime, setCurrentTime] = useState(0);
    const [seekTo, setSeekTo] = useState<number | null>(null);
    const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
    const [fileMismatch, setFileMismatch] = useState(false);
    const [exportOptions, setExportOptions] = useState({
        showSpeakers: true,
        autoLineBreak: true,
        maxLines: 2,
        maxChars: 42,
        useStrictMode: false,
    });

    const videoRef = useRef<HTMLVideoElement>(null);
    const animationFrameId = useRef<number>();
    const transcriptRef = useRef<HTMLDivElement>(null); // For auto-scroll
    const transcribeInFlightRef = useRef(false);

    const uniqueSpeakers = useMemo(
        () => Array.from(new Set(segments.map(s => s.speaker).filter((s): s is string => typeof s === 'string' && !!s))).sort(),
        [segments]
    );

    // ... [Effects and Handlers remain unchanged] ...
    useEffect(() => {
        if (!file) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'audio/*,video/*';
            input.onchange = (e) => {
                const selectedFile = (e.target as HTMLInputElement).files?.[0];
                if (selectedFile) handleFileChange(selectedFile);
                else onClose();
            };
            input.click();
        }
    }, []);

    useEffect(() => {
        if (file) {
            const url = URL.createObjectURL(file);
            setVideoSrc(url);
            const currentSignature = createFileSignature(file);
            const isNewProject = project.segments.length === 0;
            const signaturesMatch = JSON.stringify(currentSignature) === JSON.stringify(project.fileSignature);
            setFileMismatch(!signaturesMatch && !isNewProject);
            if (isNewProject) handleTranscribe();
            return () => URL.revokeObjectURL(url);
        }
        setVideoSrc('');
    }, [file]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
            // e.preventDefault(); // Removing this to allow default browser shortcuts if needed
            if (e.code === 'Space') {
                e.preventDefault();
                videoRef.current?.paused ? videoRef.current?.play() : videoRef.current?.pause();
            }
            const isModKey = e.metaKey || e.ctrlKey;
            if (isModKey && activeSegmentIndex !== null) {
                if (e.key === 'j') handleMergeDown(activeSegmentIndex);
                if (e.key === 'k') handleSplit(activeSegmentIndex, Math.floor(segments[activeSegmentIndex].text.length / 2));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeSegmentIndex, segments]);

    const animationLoop = () => {
        if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
        animationFrameId.current = requestAnimationFrame(animationLoop);
    };

    const handlePlay = () => {
        animationFrameId.current = requestAnimationFrame(animationLoop);
    };

    const handlePause = () => {
        if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };

    const handleFileChange = (selectedFile: File) => {
        setFile(selectedFile);
        setCurrentTime(0);
        setActiveSegmentIndex(null);
    };

    const handleTranscribe = async () => {
        if (!file || transcribeInFlightRef.current) return;
        transcribeInFlightRef.current = true;
        setStatus('transcribing');
        setError('');
        setSegments([]);
        setSpeakerMap({});
        try {
            const response = await transcribeFile(file);
            setSegments(response.data.segments);
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || 'An unknown error occurred.');
        } finally {
            transcribeInFlightRef.current = false;
            setStatus('idle');
        }
    };

    const handleSave = () => {
        if (!file) { alert("Cannot save without a media file."); return; }
        onSave({ ...project, name: projectName, segments, speakerMap, fileSignature: createFileSignature(file) });
        // alert("Project saved!"); // Removed alert for smoother UX, maybe add a toast later
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
            for (const key in newMap) if (newMap[key] === oldName) newMap[key] = newName;
            return newMap;
        });
        setSegments(prevSegments => prevSegments.map(seg => seg.speaker === oldName ? { ...seg, speaker: newName } : seg));
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
            words: [...(segmentA.words || []), ...(segmentB.words || [])]
        };
        setSegments([...segments.slice(0, index), mergedSegment, ...segments.slice(index + 2)]);
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
        const segmentA: Segment = { ...segment, end: splitTime, text: textA, words: undefined };
        const segmentB: Segment = { ...segment, start: splitTime, text: textB, words: undefined };
        setSegments([...segments.slice(0, index), segmentA, segmentB, ...segments.slice(index + 1)]);
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
        if (activeIndex !== -1 && activeIndex !== activeSegmentIndex) {
            setActiveSegmentIndex(activeIndex);
            // Auto-scroll logic could go here
        }
    };

    const handleSeek = (time: number) => {
        setSeekTo(time);
        // Optimistic update
        setCurrentTime(time);
    };

    return (
        <div className="app-container">
            {/* 1. Header */}
            <header className="app-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={onClose} className="icon-btn" title="Back">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>
                    <input
                        type="text"
                        value={projectName}
                        onChange={e => setProjectName(e.target.value)}
                        style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', fontWeight: 600, padding: 0 }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={handleSave} disabled={status !== 'idle'}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        Save
                    </button>
                    <button className="primary" onClick={() => downloadSrt(file?.name || 'subtitles', segments, exportOptions)} disabled={status !== 'idle' || segments.length === 0}>
                        Download .srt
                    </button>
                </div>
            </header>

            <main className="app-main">
                {/* 2. Left Panel: Tools */}
                <div className="sidebar-panel">
                    <div className="tool-section">
                        <h3>AI Tools</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <button onClick={handleTranscribe} disabled={status !== 'idle' || !file || segments.length > 0}>
                                {status === 'transcribing' ? 'Processing...' : 'Start Transcription'}
                            </button>
                            <button onClick={handleResync} disabled={status !== 'idle' || !file || segments.length === 0}>
                                {status === 'resyncing' ? 'Aligning...' : 'Resync Text'}
                            </button>
                        </div>
                        {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '1rem' }}>{error}</div>}
                    </div>

                    <div className="tool-section">
                        <h3>Export Settings</h3>
                        <div className="toggle-row">
                            <label>Show Speakers</label>
                            <input type="checkbox" checked={exportOptions.showSpeakers} onChange={e => setExportOptions({ ...exportOptions, showSpeakers: e.target.checked })} />
                        </div>
                        <div className="toggle-row">
                            <label>Auto Line Break</label>
                            <input type="checkbox" checked={exportOptions.autoLineBreak} onChange={e => setExportOptions({ ...exportOptions, autoLineBreak: e.target.checked })} />
                        </div>
                        <div className="toggle-row">
                             <label>Strict Timing</label>
                             <input type="checkbox" checked={exportOptions.useStrictMode} onChange={e => setExportOptions({ ...exportOptions, useStrictMode: e.target.checked })} />
                        </div>
                        
                        {exportOptions.autoLineBreak && !exportOptions.useStrictMode && (
                            <div style={{marginTop: '1rem'}}>
                                <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.8rem', marginBottom:'0.5rem'}}>
                                    <span>Max Chars</span>
                                    <span>{exportOptions.maxChars}</span>
                                </div>
                                <input type="range" min="20" max="80" value={exportOptions.maxChars} onChange={e => setExportOptions({ ...exportOptions, maxChars: +e.target.value })} />
                            </div>
                        )}
                    </div>

                    {uniqueSpeakers.length > 0 && (
                        <div className="tool-section">
                            <h3>Speakers</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {uniqueSpeakers.map(id => (
                                    <input 
                                        key={id} 
                                        type="text" 
                                        value={speakerMap[id] || id} 
                                        placeholder={id}
                                        onChange={(e) => setSpeakerMap({ ...speakerMap, [id]: e.target.value })}
                                        style={{ fontSize: '0.9rem' }}
                                    />
                                ))}
                            </div>
                            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                                <button onClick={handleRenameSpeakers} disabled={status !== 'idle'} style={{flex: 1, fontSize:'0.8rem'}}>Apply</button>
                                <button onClick={handleRefine} disabled={status !== 'idle' || !file} style={{flex: 1, fontSize:'0.8rem'}}>Refine AI</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. Middle Panel: Video & Waveform */}
                <div className="video-panel">
                    <div className="video-wrapper">
                        <VideoPlayer
                            videoRef={videoRef}
                            src={videoSrc}
                            onTimeUpdate={handleTimeUpdate}
                            seekTo={seekTo}
                            onPlay={handlePlay}
                            onPause={handlePause}
                        />
                    </div>
                    {videoSrc && (
                        <div className="waveform-wrapper">
                            <AudioWaveform mediaElement={videoRef.current} onSeek={handleSeek} />
                        </div>
                    )}
                </div>

                {/* 4. Right Panel: Transcript */}
                <div className="transcript-panel" ref={transcriptRef}>
                    {segments.length === 0 ? (
                        <div style={{textAlign:'center', color: 'var(--text-muted)', marginTop:'40%'}}>
                            <p>No transcript yet.</p>
                        </div>
                    ) : (
                        segments.map((segment, index) => {
                            const isActive = currentTime >= segment.start && currentTime <= segment.end;
                            return (
                                <SegmentLine
                                    key={`${index}-${segment.start}-${segment.end}`}
                                    segment={segment}
                                    isActive={isActive}
                                    currentTime={currentTime}
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
                        })
                    )}
                </div>
            </main>
        </div>
    );
};
