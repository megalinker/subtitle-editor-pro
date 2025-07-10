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
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>
                </button>
                {!isLastSegment && (
                    <button onClick={onMergeDown} title="Merge with segment below (Ctrl+J)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5"></path><path d="M8 3H3v5"></path><path d="M12 21v-10"></path><path d="m15 6-3-3-3 3"></path><path d="m9 18 3 3 3-3"></path></svg>
                    </button>
                )}
            </div>
        </div>
    );
};