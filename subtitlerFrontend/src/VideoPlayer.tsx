import { useRef, useEffect, RefObject } from 'react';

interface VideoPlayerProps {
    videoRef: RefObject<HTMLVideoElement>;
    src: string;
    onTimeUpdate: (time: number) => void;
    seekTo: number | null;
}

export const VideoPlayer = ({ videoRef, src, onTimeUpdate, seekTo }: VideoPlayerProps) => {
    // Use the passed-in ref
    const internalRef = useRef<HTMLVideoElement>(null);
    const resolvedRef = videoRef || internalRef;

    useEffect(() => {
        if (resolvedRef.current && seekTo !== null) {
            resolvedRef.current.currentTime = seekTo;
        }
    }, [seekTo, resolvedRef]);

    return (
        <div className="video-placeholder">
            {src ? (
                <video
                    ref={resolvedRef}
                    src={src}
                    controls
                    width="100%"
                    onTimeUpdate={() => onTimeUpdate(resolvedRef.current?.currentTime || 0)}
                />
            ) : (
                "Your video will appear here"
            )}
        </div>
    );
};