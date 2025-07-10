import { useEffect, useRef } from 'react';
import { useWavesurfer } from '@wavesurfer/react';

interface AudioWaveformProps {
    mediaElement: HTMLVideoElement | null;
    onSeek: (time: number) => void;
}

export const AudioWaveform = ({ mediaElement, onSeek }: AudioWaveformProps) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const { wavesurfer } = useWavesurfer({
        container: containerRef,
        waveColor: '#a0a0a0',
        progressColor: '#4a90e2',
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 100,
        media: mediaElement || undefined,
    });

    useEffect(() => {
        if (!wavesurfer) return;

        const onInteraction = (newTime: number) => {
            onSeek(newTime);
        };

        wavesurfer.on('interaction', onInteraction);

        return () => {
            wavesurfer.un('interaction', onInteraction);
        };
    }, [wavesurfer, onSeek]);

    return <div ref={containerRef} />;
};