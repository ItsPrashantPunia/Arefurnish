'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { GripVertical } from 'lucide-react';

interface CompareSliderProps {
  originalImage: string;
  generatedImage: string;
}

export default function CompareSlider({ originalImage, generatedImage }: CompareSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = Math.max(0, Math.min((x / rect.width) * 100, 100));
    setSliderPosition(percent);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (e.buttons !== 1) return;
    handleMove(e.clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-[4/3] max-h-[600px] overflow-hidden rounded-2xl cursor-ew-resize select-none bg-zinc-100"
      onMouseMove={onMouseMove}
      onTouchMove={onTouchMove}
      onMouseDown={(e) => handleMove(e.clientX)}
    >
      {/* Original Image (Bottom) */}
      <div className="absolute inset-0">
        <Image 
          src={originalImage} 
          alt="Original Room" 
          fill 
          className="object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm">
          Original
        </div>
      </div>

      {/* Generated Image (Top) */}
      <div 
        className="absolute inset-0 border-r-2 border-white shadow-[0_0_10px_rgba(0,0,0,0.5)]"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <Image 
          src={generatedImage} 
          alt="AI Generated Room" 
          fill 
          className="object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-4 left-4 bg-black/50 text-white px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm">
          Reimagined
        </div>
      </div>

      {/* Slider Handle */}
      <div 
        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize flex items-center justify-center"
        style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
      >
        <div className="w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-zinc-800">
          <GripVertical size={16} />
        </div>
      </div>
    </div>
  );
}
