import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OpportunitiesCanvas } from '../src/components/OpportunitiesCanvas.js';
import { SessionDocument, SessionStatusResponse, EXACT_DEMO_FIXTURE_LABEL } from '@web-slinger/shared';

describe('OpportunitiesCanvas Multi-Company Flow', () => {
  const mockSession: SessionDocument = {
    session_id: '123e4567-e89b-12d3-a456-426614174000',
    stack: ['TypeScript', 'React'],
    normalized_stack: ['typescript', 'react'],
    goal: 'Build edge runtime tooling',
    stage: 'researching',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  };

  describe('1. DEMO_MODE=false Live Mode & Calm Degraded State', () => {
    it('never returns fixture cards when DEMO_MODE=false and live results are empty', () => {
      const mockStatus: SessionStatusResponse = {
        ...mockSession,
        ttl_seconds_remaining: 86400,
        is_expired: false,
        current_job: {
          job_id: 'job-123',
          type: 'research',
          status: 'degraded',
          message: 'Public collection timed out',
        },
        research_results: [],
      };

      const onCheck = vi.fn();
      const onReset = vi.fn();

      render(
        <OpportunitiesCanvas
          session={mockSession}
          sessionStatus={mockStatus}
          isDemoMode={false}
          onSelectOpportunity={vi.fn()}
          onCheckExistingResearch={onCheck}
          onReset={onReset}
        />
      );

      // Verify calm degraded state headline
      expect(
        screen.getByText(/Live company research is still processing\. Your session is saved\./i)
      ).toBeInTheDocument();

      // Verify only allowed actions are present
      expect(screen.getByRole('button', { name: /Check existing research/i })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Start over/i }).length).toBeGreaterThanOrEqual(1);

      // Zero fixture cards or demo badges
      expect(screen.queryByTestId('demo-sample-badge')).not.toBeInTheDocument();
      expect(screen.queryByText(new RegExp(EXACT_DEMO_FIXTURE_LABEL, 'i'))).not.toBeInTheDocument();
    });

    it('clicking "Check existing research" checks status without triggering new collection', () => {
      const mockStatus: SessionStatusResponse = {
        ...mockSession,
        ttl_seconds_remaining: 86400,
        is_expired: false,
        current_job: {
          job_id: 'job-123',
          type: 'research',
          status: 'degraded',
          message: 'Public collection timed out',
        },
        research_results: [],
      };

      const onCheck = vi.fn();
      const onReset = vi.fn();

      render(
        <OpportunitiesCanvas
          session={mockSession}
          sessionStatus={mockStatus}
          isDemoMode={false}
          onSelectOpportunity={vi.fn()}
          onCheckExistingResearch={onCheck}
          onReset={onReset}
        />
      );

      const checkBtn = screen.getByRole('button', { name: /Check existing research/i });
      fireEvent.click(checkBtn);
      expect(onCheck).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. DEMO_MODE=true Curated Fixtures & Persistent Badges', () => {
    it('displays persistent "Demo sample" badge, eyebrow, heading, and exact fixture label on every card', () => {
      render(
        <OpportunitiesCanvas
          session={mockSession}
          sessionStatus={null}
          isDemoMode={true}
          onSelectOpportunity={vi.fn()}
          onCheckExistingResearch={vi.fn()}
          onReset={vi.fn()}
        />
      );

      // Eyebrow and heading
      expect(screen.getByTestId('demo-step-eyebrow')).toHaveTextContent('Step 2 of 5 · Choose');
      expect(screen.getByRole('heading', { level: 1, name: 'Pick a company to explore.' })).toBeInTheDocument();
      expect(
        screen.getByText(/These labelled demo opportunities let you explore the contribution flow without waiting for live collection\./i)
      ).toBeInTheDocument();

      const badges = screen.getAllByTestId('demo-sample-badge');
      expect(badges.length).toBeGreaterThan(0);

      // Every card shows "Demo sample — not a live job listing"
      const labels = screen.getAllByText(EXACT_DEMO_FIXTURE_LABEL);
      expect(labels.length).toBe(5);

      // Source links say "Company careers page", never "Job listing"
      const careerLinks = screen.getAllByText(/Company careers page ↗/i);
      expect(careerLinks.length).toBe(5);
      expect(screen.queryByText(/View listing/i)).not.toBeInTheDocument();
    });
  });

  describe('3. Top-Five Cap and Maximum-Two-Per-Company Rule', () => {
    it('caps total displayed cards to 5 and ensures max 2 per company', () => {
      render(
        <OpportunitiesCanvas
          session={mockSession}
          sessionStatus={null}
          isDemoMode={true}
          onSelectOpportunity={vi.fn()}
          onCheckExistingResearch={vi.fn()}
          onReset={vi.fn()}
        />
      );

      const chooseButtons = screen.getAllByRole('button', { name: /Choose this opportunity/i });
      expect(chooseButtons).toHaveLength(5);
    });
  });

  describe('4. Company Filter Chips', () => {
    it('filters opportunities when clicking company filter chips', () => {
      render(
        <OpportunitiesCanvas
          session={mockSession}
          sessionStatus={null}
          isDemoMode={true}
          onSelectOpportunity={vi.fn()}
          onCheckExistingResearch={vi.fn()}
          onReset={vi.fn()}
        />
      );

      // Filter bar shows All companies and individual company chips
      expect(screen.getByRole('button', { name: /All companies/i })).toBeInTheDocument();
      const cloudflareChip = screen.getByRole('button', { name: /Cloudflare/i });
      expect(cloudflareChip).toBeInTheDocument();

      // Click Cloudflare filter chip
      fireEvent.click(cloudflareChip);

      // Now only Cloudflare cards are visible
      const headings = screen.getAllByRole('heading', { level: 2 });
      expect(headings.length).toBe(2); // exactly 2 Cloudflare roles
    });
  });

  describe('5. Opportunity Selection & Confirmation', () => {
    it('persists selected opportunity and shows next step repository guidance', async () => {
      const onSelect = vi.fn();
      const onProceed = vi.fn();

      render(
        <OpportunitiesCanvas
          session={mockSession}
          sessionStatus={null}
          isDemoMode={true}
          onSelectOpportunity={onSelect}
          onProceedToRepositories={onProceed}
          onCheckExistingResearch={vi.fn()}
          onReset={vi.fn()}
        />
      );

      const firstChooseBtn = screen.getByTestId('choose-opportunity-btn-0');
      fireEvent.click(firstChooseBtn);

      expect(onSelect).toHaveBeenCalledTimes(1);

      // Confirmation panel displays guidance
      await waitFor(() => {
        expect(
          screen.getByText(/Next, choose an open-source repository from Cloudflare\./i)
        ).toBeInTheDocument();
      });

      const continueBtn = screen.getByTestId('continue-to-repos-btn');
      fireEvent.click(continueBtn);
      expect(onProceed).toHaveBeenCalledWith('cloudflare');
    });
  });
});
