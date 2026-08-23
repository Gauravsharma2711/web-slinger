import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProgressRail } from '../src/components/ProgressRail.js';

describe('ProgressRail Component', () => {
  it('renders all 5 canonical stages without percentages or dashboard charts', () => {
    render(<ProgressRail currentStage="Discover" />);

    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Choose')).toBeInTheDocument();
    expect(screen.getByText('Understand')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Verify')).toBeInTheDocument();

    // Must not contain percentage or metric charts
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('marks current step clearly with aria-current="step"', () => {
    render(
      <ProgressRail
        currentStage="Understand"
        completedStages={['Discover', 'Choose']}
      />
    );

    const currentStep = screen.getByText('Understand').closest('.ws-progress-step-static');
    expect(currentStep).toHaveAttribute('aria-current', 'step');
  });

  it('renders completed steps as interactive buttons that call onNavigate', () => {
    const handleNavigate = vi.fn();
    render(
      <ProgressRail
        currentStage="Understand"
        completedStages={['Discover', 'Choose']}
        onNavigate={handleNavigate}
      />
    );

    const discoverBtn = screen.getByRole('button', { name: /Go to completed step 1: Discover/i });
    expect(discoverBtn).toBeInTheDocument();

    fireEvent.click(discoverBtn);
    expect(handleNavigate).toHaveBeenCalledWith('Discover');
  });

  it('renders future steps as locked and disabled', () => {
    render(
      <ProgressRail
        currentStage="Choose"
        completedStages={['Discover']}
      />
    );

    const verifyStep = screen.getByText('Verify').closest('.ws-progress-step-static');
    expect(verifyStep).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: /Verify/i })).not.toBeInTheDocument();
  });
});
