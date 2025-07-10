import { useEffect, RefObject } from 'react';

interface VideoPlayerProps {
    videoRef: RefObject<HTMLVideoElement>;
    src: string;
    onTimeUpdate: (time: number) => void;
    seekTo: number | null;
    onPlay: () => void;
    onPause: () => void;
}

export const VideoPlayer = ({ videoRef, src, onTimeUpdate, seekTo, onPlay, onPause }: VideoPlayerProps) => {

    useEffect(() => {
        if (videoRef.current && seekTo !== null) {
            videoRef.current.currentTime = seekTo;
        }
    }, [seekTo, videoRef]);

    return (
        <div className="video-placeholder">
            {src ? (
                <video
                    ref={videoRef}
                    src={src}
                    controls
                    width="100%"
                    onTimeUpdate={() => onTimeUpdate(videoRef.current?.currentTime || 0)}
                    onPlay={onPlay}
                    onPause={onPause}
                    onEnded={onPause}
                />
            ) : (
                "Your video will appear here"
            )}
        </div>
    );
};