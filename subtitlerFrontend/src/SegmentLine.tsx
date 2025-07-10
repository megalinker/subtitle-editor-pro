import { useState, useRef, useEffect, useMemo } from 'react';
import { Segment } from './types';

interface SegmentLineProps {
    segment: Segment;
    currentTime: number;
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
    currentTime,
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
    const [isEditing, setIsEditing] = useState(false);
    const textInputRef = useRef<HTMLInputElement>(null);

    const activeWordIndex = useMemo(() => {
        if (!isActive || !segment.words || segment.words.length === 0) {
            return -1;
        }

        let wordIndex = -1;
        for (let i = 0; i < segment.words.length; i++) {
            const word = segment.words[i];
            if ((word.start ?? Infinity) <= currentTime) {
                wordIndex = i;
            } else {
                break;
            }
        }
        return wordIndex;
    }, [currentTime, isActive, segment.words]);


    useEffect(() => {
        if (isEditing) {
            textInputRef.current?.focus();
            textInputRef.current?.select();
        }
    }, [isEditing]);

    const handleSplitClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isEditing) {
            setIsEditing(true);
            setTimeout(() => onSplit(textInputRef.current?.selectionStart || 0), 0);
        } else {
            onSplit(textInputRef.current?.selectionStart || 0);
        }
    };

    const handleMergeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onMergeDown();
    }

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

            <div className="segment-line__text-editor" onClick={() => setIsEditing(true)}>
                {isEditing ? (
                    <input
                        ref={textInputRef}
                        type="text"
                        value={segment.text}
                        onChange={(e) => onTextChange(e.target.value)}
                        onBlur={() => setIsEditing(false)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') {
                                setIsEditing(false);
                            }
                        }}
                    />
                ) : (
                    <p className="segment-line__readonly-text">
                        {segment.words && segment.words.length > 0 ? (
                            segment.words.map((word, i) => (
                                <span
                                    key={i}
                                    className={i === activeWordIndex ? 'word highlighted' : 'word'}
                                >
                                    {word.word}
                                </span>
                            ))
                        ) : (
                            <span>{segment.text}</span>
                        )}
                    </p>
                )}
            </div>

            <div className="segment-line__controls">
                <button onClick={handleSplitClick} title="Split segment at cursor (Ctrl+K)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>
                </button>
                {!isLastSegment && (
                    <button onClick={handleMergeClick} title="Merge with segment below (Ctrl+J)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5"></path><path d="M8 3H3v5"></path><path d="M12 21v-10"></path><path d="m15 6-3-3-3 3"></path><path d="m9 18 3 3 3-3"></path></svg>
                    </button>
                )}
            </div>
        </div>
    );
};