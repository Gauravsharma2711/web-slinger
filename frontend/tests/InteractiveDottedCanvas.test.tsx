/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { InteractiveDottedCanvas } from '../src/components/InteractiveDottedCanvas.js';

describe('InteractiveDottedCanvas Component', () => {
  let mockContext: Partial<CanvasRenderingContext2D>;

  beforeEach(() => {
    mockContext = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      scale: vi.fn(),
    };

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockContext);

    window.requestAnimationFrame = vi.fn().mockImplementation(() => 1);
    window.cancelAnimationFrame = vi.fn();

    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders canvas element with proper class and aria-hidden', () => {
    const { container } = render(<InteractiveDottedCanvas />);
    const canvas = container.querySelector('canvas');

    expect(canvas).toBeInTheDocument();
    expect(canvas?.className).toContain('ws-interactive-canvas');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws initial static dot grid without errors', () => {
    render(<InteractiveDottedCanvas />);

    expect(mockContext.clearRect).toHaveBeenCalled();
    expect(mockContext.arc).toHaveBeenCalled();
    expect(mockContext.fill).toHaveBeenCalled();
  });

  it('handles pointermove events gracefully and requests animation frames', () => {
    render(<InteractiveDottedCanvas />);

    // Reset counts from initial render
    vi.clearAllMocks();

    const mouseEvent = new MouseEvent('pointermove', {
      clientX: 200,
      clientY: 300,
    });
    Object.defineProperty(mouseEvent, 'pointerType', { value: 'mouse' });
    window.dispatchEvent(mouseEvent);

    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });

  it('remains calm and does not trigger dynamic ripple loop on touch devices', () => {
    render(<InteractiveDottedCanvas />);

    vi.clearAllMocks();

    const touchEvent = new MouseEvent('pointermove', {
      clientX: 200,
      clientY: 300,
    });
    Object.defineProperty(touchEvent, 'pointerType', { value: 'touch' });
    window.dispatchEvent(touchEvent);

    // Touch event should be ignored to remain calm without sticky hover
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('respects prefers-reduced-motion by drawing static frame without motion', () => {
    const matchMediaMock = vi.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    window.matchMedia = matchMediaMock;

    render(<InteractiveDottedCanvas />);

    expect(mockContext.arc).toHaveBeenCalled();
  });
});
