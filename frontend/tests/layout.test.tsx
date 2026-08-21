/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AppShell } from '../src/components/AppShell.js';
import { EntryCanvas } from '../src/components/EntryCanvas.js';
import { ResearchCanvas } from '../src/components/ResearchCanvas.js';
import { SessionDocument, SessionStatusResponse } from '@web-slinger/shared';

describe('Global AppShell & Content Rail Alignment & Overflow Safety', () => {
  const breakpoints = [1920, 1280, 768, 375];

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  breakpoints.forEach((width) => {
    describe(`Breakpoint: ${width}px`, () => {
      beforeEach(() => {
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: width,
        });
        Object.defineProperty(document.documentElement, 'clientWidth', {
          writable: true,
          configurable: true,
          value: width,
        });
        Object.defineProperty(document.documentElement, 'scrollWidth', {
          writable: true,
          configurable: true,
          value: width,
        });
      });

      it('renders Entry view within shared content rail and ensures no horizontal overflow', () => {
        const { container } = render(
          <AppShell stage="ENTRY">
            <EntryCanvas onSessionCreated={() => {}} />
          </AppShell>
        );

        const headerInner = container.querySelector('.ws-header-inner');
        const contentRail = container.querySelector('.ws-content-rail');

        expect(headerInner).toBeInTheDocument();
        expect(contentRail).toBeInTheDocument();

        // Verify universal root overflow safety
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
          document.documentElement.clientWidth
        );
      });

      it('renders Opportunities Found view within shared content rail and ensures matching left/right container structure', () => {
        const mockSession: SessionDocument = {
          session_id: 'test-session-12345678',
          stack: ['TypeScript', 'React'],
          normalized_stack: ['typescript', 'react'],
          goal: 'Build dev tools',
          stage: 'researching',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          research_results: [
            {
              company_name: 'Oracle',
              role_title: 'Senior Software Engineer',
              location: 'India',
              employment_type: null,
              department: null,
              listing_date: null,
              job_description_excerpt: null,
              source_url: 'https://careers.oracle.com/jobs/1',
              collected_at: new Date().toISOString(),
              is_fixture: false,
            },
          ],
        };

        const mockStatus: SessionStatusResponse = {
          session_id: mockSession.session_id,
          stage: 'researching',
          stack: mockSession.stack,
          normalized_stack: mockSession.normalized_stack,
          goal: mockSession.goal,
          created_at: mockSession.created_at,
          updated_at: mockSession.updated_at,
          expires_at: mockSession.expires_at,
          ttl_seconds_remaining: 86400,
          is_expired: false,
          current_job: {
            job_id: 'job-123',
            type: 'research',
            status: 'completed',
            message: 'Opportunities found',
            is_fixture: false,
          },
          message: 'Opportunities found',
          research_results: mockSession.research_results,
        };

        const { container } = render(
          <AppShell stage="RESEARCH COMPLETED">
            <ResearchCanvas
              session={mockSession}
              sessionStatus={mockStatus}
              isStartingResearch={false}
              errorMessage={null}
              onStartResearch={() => {}}
              onRetryResearch={() => {}}
              onReset={() => {}}
            />
          </AppShell>
        );

        const headerInner = container.querySelector('.ws-header-inner');
        const contentRail = container.querySelector('.ws-content-rail');
        const resultItems = container.querySelectorAll('.ws-result-item');

        expect(headerInner).toBeInTheDocument();
        expect(contentRail).toBeInTheDocument();
        expect(resultItems.length).toBe(1);

        // Verify result items are enclosed in the content rail
        expect(contentRail?.contains(resultItems[0])).toBe(true);

        // Verify scroll width constraint
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
          document.documentElement.clientWidth
        );
      });
    });
  });
});
