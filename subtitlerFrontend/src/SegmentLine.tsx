import { useRef } from 'react';
import { Segment } from './types';

interface SegmentLineProps {
    segment: Segment;
    onTextChange: (newText: string) => void;
    onSpeakerChange: (newSpeaker: string) => void;
    uniqueSpeakers: string[];
    onSplit: (cursorPosition: number) => void;
    onMergeDown: () => void;
    isLastSegment: boolean;
    isActive: boolean;
    onSeek: () => void;
}

const formatTime = (seconds: number) => {
    return new Date(seconds * 1000).toISOString().substr(11, 12);
};

export const SegmentLine = ({
    segment,
    onTextChange,
    onSpeakerChange,
    uniqueSpeakers,
    onSplit,
    onMergeDown,
    isLastSegment,
    isActive,
    onSeek,
}: SegmentLineProps) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSplit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (inputRef.current) {
            onSplit(inputRef.current.selectionStart || 0);
        }
    };

    const lineClasses = `segment-line ${isActive ? 'active' : ''}`;

    return (
        <div className={lineClasses} onClick={onSeek}>
            <div className="segment-line__time">{formatTime(segment.start)}</div>
            <select value={segment.speaker || ''} onChange={(e) => onSpeakerChange(e.target.value)}>
                <option value="" disabled>Speaker...</option>
                {uniqueSpeakers.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
            <input ref={inputRef} type="text" value={segment.text} onChange={(e) => onTextChange(e.target.value)} />
            <div className="segment-line__controls">
                <button onClick={handleSplit} title="Split segment at cursor">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H12.01" /><path d="M12 7H12.01" /><path d="M12 12H12.01" /><path d="M12 17H12.01" /><path d="M12 22H12.01" /></svg>
                </button>
                {!isLastSegment && (
                    <button onClick={onMergeDown} title="Merge with segment below">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="m7 10 5-5 5 5" /><path d="m7 14 5 5 5 5" /></svg>
                    </button>
                )}
            </div>
        </div>
    );
};