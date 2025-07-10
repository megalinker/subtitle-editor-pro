import { useRef } from 'react';
import { Segment } from './types';

interface SegmentLineProps {
    segment: Segment;
    onTextChange: (newText: string) => void;
    onSpeakerChange: (newSpeaker: string) => void;
    onRenameSpeaker: (oldName: string, newName: string) => void;
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
    onRenameSpeaker,
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

    const handleSpeakerSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value === '__RENAME__') {
            const oldName = segment.speaker;
            if (oldName) {
                const newName = prompt(`Rename speaker "${oldName}" to:`);
                if (newName && newName.trim() !== "") {
                    onRenameSpeaker(oldName, newName.trim());
                }
            }
            e.target.value = segment.speaker || '';
        } else {
            onSpeakerChange(value);
        }
    };

    const lineClasses = `segment-line ${isActive ? 'active' : ''}`;

    return (
        <div className={lineClasses} onClick={onSeek}>
            <div className="segment-line__time">{formatTime(segment.start)}</div>
            <select value={segment.speaker || ''} onChange={handleSpeakerSelect}>
                <option value="" disabled>Speaker...</option>
                {uniqueSpeakers.map(id => <option key={id} value={id}>{id}</option>)}
                <option value="" disabled>──────────</option>
                <option value="__RENAME__">Rename Speaker...</option>
            </select>
            <input ref={inputRef} type="text" value={segment.text} onChange={(e) => onTextChange(e.target.value)} />
            <div className="segment-line__controls">
                <button onClick={handleSplit} title="Split segment at cursor (Ctrl+K)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H12.01" /><path d="M12 7H12.01" /><path d="M12 12H12.01" /><path d="M12 17H12.01" /><path d="M12 22H12.01" /></svg>
                </button>
                {!isLastSegment && (
                    <button onClick={onMergeDown} title="Merge with segment below (Ctrl+J)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="m7 10 5-5 5 5" /><path d="m7 14 5 5 5 5" /></svg>
                    </button>
                )}
            </div>
        </div>
    );
};