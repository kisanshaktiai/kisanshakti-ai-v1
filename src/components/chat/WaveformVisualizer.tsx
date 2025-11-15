import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface WaveformVisualizerProps {
  isListening: boolean;
  stream: MediaStream | null;
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({ 
  isListening, 
  stream 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const analyzerRef = useRef<AnalyserNode>();

  useEffect(() => {
    if (!isListening || !stream) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const audioContext = new AudioContext();
    const analyzer = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    
    analyzer.fftSize = 256;
    const bufferLength = analyzer.frequencyBinCount;
    
    source.connect(analyzer);
    analyzerRef.current = analyzer;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (!analyzerRef.current) return;

      animationRef.current = requestAnimationFrame(draw);

      const dataArray = new Uint8Array(bufferLength);
      analyzerRef.current.getByteTimeDomainData(dataArray);

      const width = canvas.width;
      const height = canvas.height;

      ctx.fillStyle = 'transparent';
      ctx.clearRect(0, 0, width, height);

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#10b981'; // emerald-500
      ctx.beginPath();

      const sliceWidth = width / dataArray.length;
      let x = 0;

      for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      source.disconnect();
      audioContext.close();
    };
  }, [isListening, stream]);

  if (!isListening) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 20 }}
      className="absolute bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-md z-50"
    >
      <div className="bg-gradient-to-r from-emerald-500/20 to-green-500/20 backdrop-blur-xl rounded-2xl border border-emerald-500/30 p-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex gap-1">
            {[0, 0.1, 0.2].map((delay, i) => (
              <motion.div
                key={i}
                className="w-1 h-8 bg-emerald-500 rounded-full"
                animate={{
                  height: ['16px', '32px', '16px'],
                }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay,
                  ease: "easeInOut"
                }}
              />
            ))}
          </div>
          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            Listening...
          </span>
        </div>
        <canvas 
          ref={canvasRef} 
          width={400} 
          height={80}
          className="w-full h-20 rounded-lg"
        />
      </div>
    </motion.div>
  );
};
