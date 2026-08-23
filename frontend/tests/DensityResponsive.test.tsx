import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AppShell } from '../src/components/AppShell.js';
import { StageContextPanel } from '../src/components/StageContextPanel.js';
import { EvidenceTrail } from '../src/components/EvidenceTrail.js';
import { WhatHappensNext } from '../src/components/WhatHappensNext.js';

describe('Layout and Visual Density Responsive Boundaries', () => {
  const VIEWPORT_WIDTHS = [1920, 1280, 768, 375];

  VIEWPORT_WIDTHS.forEach((width) => {
    it(`renders AppShell and density components cleanly at ${width}px width without forbidden 100vw or negative margins`, () => {
      window.innerWidth = width;

      const { container } = render(
        <AppShell currentStage="Choose" completedStages={['Discover']}>
          <StageContextPanel stage="Choose" />
          <EvidenceTrail
            items={[
              { type: 'job', label: 'Senior Dev', url: 'https://example.com' },
              { type: 'issue', label: '#123 Bug', url: 'https://github.com' },
            ]}
          />
          <WhatHappensNext stepName="Understand" description="Next step preview" />
        </AppShell>
      );

      // Verify root structure
      const root = container.querySelector('.ws-app-root');
      expect(root).toBeInTheDocument();
      expect(container.querySelector('.ws-progress-rail')).toBeInTheDocument();
      expect(container.querySelector('.ws-stage-context-panel')).toBeInTheDocument();
      expect(container.querySelector('.ws-evidence-trail')).toBeInTheDocument();
      expect(container.querySelector('.ws-what-next-card')).toBeInTheDocument();

      // Ensure no element has inline overflow-inducing styles
      const allElements = container.querySelectorAll('*');
      allElements.forEach((el) => {
        const style = el.getAttribute('style') || '';
        expect(style).not.toContain('width: 100vw');
        expect(style).not.toContain('margin-left: -');
      });
    });
  });
});
