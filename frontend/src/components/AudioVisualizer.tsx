import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyserRef: React.RefObject<AnalyserNode | null>;
  isRecording: boolean;
}

export function AudioVisualizer({ analyserRef, isRecording }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fixed size array fallback if analyser is not yet active
    const bufferLength = analyserRef.current ? analyserRef.current.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!canvas || !ctx) return;
      
      const width = canvas.width;
      const height = canvas.height;

      animationRef.current = requestAnimationFrame(draw);

      if (isRecording && analyserRef.current) {
        analyserRef.current.getByteTimeDomainData(dataArray);
      }

      ctx.clearRect(0, 0, width, height);

      // Draw background slate style
      ctx.fillStyle = 'rgba(15, 23, 42, 0.1)';
      ctx.fillRect(0, 0, width, height);

      // Drawing styling
      ctx.lineWidth = 3;
      
      // Beautiful glowing gradient
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#3b82f6');    // Royal blue
      gradient.addColorStop(0.5, '#10b981');  // Emerald green
      gradient.addColorStop(1, '#8b5cf6');    // Violet purple
      
      ctx.strokeStyle = gradient;
      
      // Dynamic neon glow effect if recording
      if (isRecording) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(16, 185, 129, 0.6)';
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();

      if (isRecording && analyserRef.current) {
        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }
      } else {
        // Draw elegant lazy sine wave when inactive
        ctx.moveTo(0, height / 2);
        for (let i = 0; i < width; i++) {
          const y = height / 2 + Math.sin(i * 0.03 + Date.now() * 0.003) * 2;
          ctx.lineTo(i, y);
        }
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'; // Dim slate
      }

      ctx.stroke();
      ctx.shadowBlur = 0; // Reset
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRecording, analyserRef]);

  return (
    <div className="relative w-full h-24 overflow-hidden rounded-xl bg-slate-950/40 border border-slate-800/60 backdrop-blur-md">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        width={500}
        height={96}
      />
    </div>
  );
}
