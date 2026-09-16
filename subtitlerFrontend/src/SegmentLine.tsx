//--- File: subtitlerFrontend/src/SegmentLine.tsx ---

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
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
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
    const textInputRef = useRef<HTMLTextAreaElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to active element
    useEffect(() => {
        if (isActive && cardRef.current) {
            cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [isActive]);

    // Auto-resize textarea
    useEffect(() => {
        if (isEditing && textInputRef.current) {
            textInputRef.current.style.height = 'auto';
            textInputRef.current.style.height = textInputRef.current.scrollHeight + 'px';
            textInputRef.current.focus();
        }
    }, [isEditing]);

    const activeWordIndex = useMemo(() => {
        if (!isActive || !segment.words || segment.words.length === 0) return -1;
        let wordIndex = -1;
        for (let i = 0; i < segment.words.length; i++) {
            if ((segment.words[i].start ?? Infinity) <= currentTime) wordIndex = i;
            else break;
        }
        return wordIndex;
    }, [currentTime, isActive, segment.words]);

    const handleSplitClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSplit(textInputRef.current?.selectionStart || 0); // Simplified for this view
    };

    const handleSpeakerSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        e.stopPropagation();
        const value = e.target.value;
        if (value === '__RENAME__') {
            const oldName = segment.speaker;
            if (oldName) {
                const newName = prompt(`Rename speaker "${oldName}" to:`);
                if (newName && newName.trim() !== "") onRenameSpeaker(oldName, newName.trim());
            }
            e.target.value = segment.speaker || '';
        } else {
            onSpeakerChange(value);
        }
    };

    return (
        <div 
            ref={cardRef}
            className={`segment-card ${isActive ? 'active' : ''}`} 
            onClick={onSeek}
        >
            <div className="segment-meta">
                <span>{formatTime(segment.start)}</span>
                <span style={{opacity: 0.5}}>↓</span>
                <span>{formatTime(segment.end)}</span>
            </div>

            <div className="segment-body">
                <select 
                    className="speaker-select" 
                    value={segment.speaker || ''} 
                    onChange={handleSpeakerSelect}
                    onClick={(e) => e.stopPropagation()}
                >
                    <option value="" disabled>Unknown Speaker</option>
                    {uniqueSpeakers.map(id => <option key={id} value={id}>{id}</option>)}
                    <option value="__RENAME__">Rename...</option>
                </select>

                <div onClick={() => setIsEditing(true)}>
                    {isEditing ? (
                        <textarea
                            ref={textInputRef}
                            className="segment-text-editor"
                            value={segment.text}
                            onChange={(e) => onTextChange(e.target.value)}
                            onBlur={() => setIsEditing(false)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    setIsEditing(false);
                                }
                            }}
                        />
                    ) : (
                        <p className="readonly-text">
                            {segment.words && segment.words.length > 0 ? (
                                segment.words.map((word, i) => (
                                    <span
                                        key={i}
                                        className={i === activeWordIndex ? 'word highlighted' : 'word'}
                                    >
                                        {word.word}{' '}
                                    </span>
                                ))
                            ) : (
                                <span>{segment.text}</span>
                            )}
                        </p>
                    )}
                </div>
            </div>

            <div className="segment-actions">
                <button className="icon-btn" onClick={handleSplitClick} title="Split">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M9 21H4v-5"/></svg>
                </button>
                {!isLastSegment && (
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onMergeDown(); }} title="Merge Down">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                    </button>
                )}
            </div>
        </div>
    );
};