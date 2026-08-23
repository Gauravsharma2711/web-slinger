/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React, { useEffect, useRef } from 'react';

export const InteractiveDottedCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d', { alpha: true });
    } catch {
      ctx = null;
    }
    if (!ctx) return;

    // Check for prefers-reduced-motion safely
    const reducedMotionQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let prefersReducedMotion = reducedMotionQuery ? reducedMotionQuery.matches : false;

    const handleReducedMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
      drawStatic();
    };

    if (reducedMotionQuery?.addEventListener) {
      reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
    } else if (reducedMotionQuery?.addListener) {
      reducedMotionQuery.addListener(handleReducedMotionChange);
    }

    // Grid and dot configuration: balanced middle-ground paper texture
    const GRID_SIZE = 20;
    const RIPPLE_RADIUS = 95; // Radius of pointer influence in px
    const BASE_ALPHA = 0.175; // Low-contrast 17.5% opacity (16–19% range)
    const MAX_ALPHA = 0.28; // Gentle opacity lift on hover
    const SCALE_MULTIPLIER = 0.15; // Max 1.15x size growth (1.1–1.2x range)
    const DECAY_RATE = 0.88; // Settles smoothly within 250–350ms

    let width = 0;
    let height = 0;
    let dpr = 1;
    let isMobile = false;

    // Pointer state (all in closure/refs, zero React state overhead)
    let pointerX = -1000;
    let pointerY = -1000;
    let currentIntensity = 0; // 0 (idle) to 1 (active motion)
    let animationFrameId: number | null = null;
    let isLoopRunning = false;

    const resize = () => {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      isMobile = width < 768;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      if (ctx) {
        ctx.scale(dpr, dpr);
      }

      if (prefersReducedMotion || !isLoopRunning) {
        drawFrame();
      }
    };

    const drawFrame = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      // Desktop: 1.7px diameter (0.85px radius), Mobile: 1.5px diameter (0.75px radius)
      const baseRadius = isMobile ? 0.75 : 0.85;
      const cols = Math.ceil(width / GRID_SIZE) + 1;
      const rows = Math.ceil(height / GRID_SIZE) + 1;

      // Draw dot grid
      for (let i = 0; i < cols; i++) {
        const x = i * GRID_SIZE;
        for (let j = 0; j < rows; j++) {
          const y = j * GRID_SIZE;

          let radius = baseRadius;
          let alpha = BASE_ALPHA;

          if (!prefersReducedMotion && !isMobile && currentIntensity > 0.005) {
            const dx = x - pointerX;
            const dy = y - pointerY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < RIPPLE_RADIUS) {
              // Gentle single soft cosine wave falloff from center
              const normDist = dist / RIPPLE_RADIUS;
              const wave = Math.cos(normDist * Math.PI * 0.5); // 1 at center -> 0 at edge
              const factor = wave * currentIntensity;

              radius = baseRadius * (1 + factor * SCALE_MULTIPLIER);
              alpha = BASE_ALPHA + factor * (MAX_ALPHA - BASE_ALPHA);
            }
          }

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(26, 36, 28, ${alpha})`;
          ctx.fill();
        }
      }
    };

    const drawStatic = () => {
      currentIntensity = 0;
      drawFrame();
    };

    const animate = () => {
      if (prefersReducedMotion) {
        drawStatic();
        isLoopRunning = false;
        return;
      }

      // Settle intensity towards 0
      currentIntensity *= DECAY_RATE;

      drawFrame();

      if (currentIntensity > 0.005) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        currentIntensity = 0;
        drawFrame(); // Final clean frame
        isLoopRunning = false;
        animationFrameId = null;
      }
    };

    const startAnimation = () => {
      if (prefersReducedMotion) return;
      if (!isLoopRunning) {
        isLoopRunning = true;
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      // Touch events remain visually calm without sticky hover
      if (e.pointerType === 'touch') {
        return;
      }

      pointerX = e.clientX;
      pointerY = e.clientY;
      currentIntensity = 1.0;
      startAnimation();
    };

    const handlePointerLeave = () => {
      // Only animate settling if there is an active ripple
      if (currentIntensity > 0.005) {
        startAnimation();
      }
    };

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('mouseleave', handlePointerLeave, { passive: true });

    // Initial setup
    resize();
    drawFrame();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('mouseleave', handlePointerLeave);

      if (reducedMotionQuery?.removeEventListener) {
        reducedMotionQuery.removeEventListener('change', handleReducedMotionChange);
      } else if (reducedMotionQuery?.removeListener) {
        reducedMotionQuery.removeListener(handleReducedMotionChange);
      }

      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return <canvas ref={canvasRef} className="ws-interactive-canvas" aria-hidden="true" />;
};
