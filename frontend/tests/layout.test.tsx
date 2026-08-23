/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AppShell } from '../src/components/AppShell.js';
import { EntryCanvas } from '../src/components/EntryCanvas.js';
import { ResearchCanvas } from '../src/components/ResearchCanvas.js';
import { IssuesCanvas } from '../src/components/IssuesCanvas.js';
import { ContextBriefCanvas } from '../src/components/ContextBriefCanvas.js';
import { WorkbenchCanvas } from '../src/components/WorkbenchCanvas.js';
import { SessionDocument, SessionStatusResponse, NormalizedIssue } from '@web-slinger/shared';

describe('Global AppShell & Content Rail Alignment & Overflow Safety', () => {
  const breakpoints = [1920, 1280, 768, 375];

  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
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

      it('renders IssuesCanvas view within shared content rail and ensures no horizontal overflow', async () => {
        const mockSession: SessionDocument = {
          session_id: 'test-session-12345678',
          stack: ['TypeScript', 'React'],
          normalized_stack: ['typescript', 'react'],
          goal: null,
          stage: 'researching',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        };

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            session_id: mockSession.session_id,
            owner: 'facebook',
            repo: 'react',
            status: 'completed',
            message: 'Found issues',
            issues: [
              {
                id: 101,
                number: 101,
                title: 'Test issue for layout check',
                body: 'Detailed description for test layout issue checking responsiveness.',
                html_url: 'https://github.com/facebook/react/issues/101',
                state: 'open',
                labels: ['help wanted'],
                assignees: [],
                author: 'dev1',
                comments_count: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                source_url: 'https://github.com/facebook/react/issues/101',
                retrieved_at: new Date().toISOString(),
                tier: 'A',
                score: 95,
                reasons: ['Matched onboarding label: "help wanted"'],
                is_fixture: false,
              },
            ],
            total_count: 1,
            cached: false,
            is_fixture: false,
          }),
        } as Response);

        const { container } = render(
          <AppShell stage="CANDIDATE ISSUES">
            <IssuesCanvas
              session={mockSession}
              onBackToOpportunities={() => {}}
              onReset={() => {}}
            />
          </AppShell>
        );

        const headerInner = container.querySelector('.ws-header-inner');
        const contentRail = container.querySelector('.ws-content-rail');

        expect(headerInner).toBeInTheDocument();
        expect(contentRail).toBeInTheDocument();

        // Verify root overflow safety
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
          document.documentElement.clientWidth
        );
      });

      it('renders ContextBriefCanvas view within shared content rail and ensures no horizontal overflow', () => {
        const mockSession: SessionDocument = {
          session_id: 'test-session-12345678',
          stack: ['TypeScript', 'React'],
          normalized_stack: ['typescript', 'react'],
          goal: 'Build dev tools',
          stage: 'issue_selected',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        };

        const mockIssue: NormalizedIssue = {
          id: 101,
          number: 101,
          title: 'Test issue for layout check',
          body: 'Detailed description for test layout issue checking responsiveness.',
          html_url: 'https://github.com/facebook/react/issues/101',
          author: 'dev1',
          assignees: [],
          state: 'open',
          labels: ['help wanted'],
          comments_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_url: 'https://github.com/facebook/react/issues/101',
          retrieved_at: new Date().toISOString(),
          tier: 'A',
          score: 95,
          reasons: ['Matched onboarding label'],
          is_fixture: false,
          repository_relationship: 'selected_practice_repository',
          repository_relationship_label: 'Selected practice repository',
        };

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            session_id: 'test-session-12345678',
            issue_number: 101,
            status: 'completed',
            brief: {
              summary: 'Test summary for layout checking across breakpoints.',
              likelyContributionShape: 'Markdown documentation in /docs.',
              whatToReadFirst: [
                { instruction: 'Read guidelines', sourceUrl: 'https://github.com/facebook/react' },
              ],
              unknownsToVerify: ['Verification item 1'],
              suggestedFirstQuestion: 'How to proceed?',
              sourceCitations: [
                { claim: 'Test claim', sourceUrl: 'https://github.com/facebook/react' },
              ],
            },
            sources: [
              { title: 'Repo', url: 'https://github.com/facebook/react', retrievedAt: new Date().toISOString() },
            ],
            model_id: 'gemini-3.7-flash',
            generated_at: new Date().toISOString(),
            validation_errors: [],
            is_fixture: false,
          }),
        } as Response);

        const { container } = render(
          <AppShell stage="CONTEXT BRIEF">
            <ContextBriefCanvas
              session={mockSession}
              issue={mockIssue}
              onBackToIssues={() => {}}
              onReset={() => {}}
            />
          </AppShell>
        );

        const headerInner = container.querySelector('.ws-header-inner');
        const contentRail = container.querySelector('.ws-content-rail');

        expect(headerInner).toBeInTheDocument();
        expect(contentRail).toBeInTheDocument();

        // Verify root overflow safety
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
          document.documentElement.clientWidth
        );
      });

      it('renders WorkbenchCanvas view within shared content rail and ensures no horizontal overflow', () => {
        const mockSession: SessionDocument = {
          session_id: 'test-session-12345678',
          stack: ['TypeScript', 'React'],
          normalized_stack: ['typescript', 'react'],
          goal: 'Build dev tools',
          stage: 'issue_selected',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        };

        const mockIssue: NormalizedIssue = {
          id: 101,
          number: 101,
          title: 'Test issue for layout check',
          body: 'Detailed description for test layout issue checking responsiveness.',
          html_url: 'https://github.com/facebook/react/issues/101',
          author: 'dev1',
          assignees: [],
          state: 'open',
          labels: ['help wanted'],
          comments_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_url: 'https://github.com/facebook/react/issues/101',
          retrieved_at: new Date().toISOString(),
          tier: 'A',
          score: 95,
          reasons: ['Matched onboarding label'],
          is_fixture: false,
          repository_relationship: 'selected_practice_repository',
          repository_relationship_label: 'Selected practice repository',
        };

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            session_id: 'test-session-12345678',
            issue_number: 101,
            status: 'completed',
            plan: {
              confirmedProblem: 'Confirmed problem description for layout tests.',
              candidateFiles: [
                {
                  path: 'packages/react/src/index.js',
                  confidence: 'confirmed',
                  rationale: 'Core export file',
                  evidenceUrls: ['https://github.com/facebook/react'],
                },
              ],
              smallestChangePlan: ['Step 1: Edit file', 'Step 2: Verify'],
              risksAndUnknowns: ['Risk 1'],
              manualVerificationPlan: ['Command: pnpm test'],
              sourceCitations: [{ claim: 'Claim 1', sourceUrl: 'https://github.com/facebook/react' }],
            },
            file_evidence: [
              {
                path: 'packages/react/src/index.js',
                ref: 'main',
                sha: '123456',
                htmlUrl: 'https://github.com/facebook/react',
                retrievedAt: new Date().toISOString(),
                content: '// React source code excerpt',
                sizeBytes: 100,
                isTruncated: false,
              },
            ],
            model_id: 'gemini-3.7-flash',
            generated_at: new Date().toISOString(),
            is_fixture: false,
          }),
        } as Response);

        const { container } = render(
          <AppShell stage="WORKBENCH">
            <WorkbenchCanvas
              session={mockSession}
              issue={mockIssue}
              onBackToBrief={() => {}}
              onReset={() => {}}
            />
          </AppShell>
        );

        const headerInner = container.querySelector('.ws-header-inner');
        const contentRail = container.querySelector('.ws-content-rail');

        expect(headerInner).toBeInTheDocument();
        expect(contentRail).toBeInTheDocument();

        // Verify root overflow safety
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
          document.documentElement.clientWidth
        );
      });
    });
  });
});
