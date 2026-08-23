import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StageContextPanel } from '../src/components/StageContextPanel.js';

describe('StageContextPanel Component', () => {
  it('renders Discover stage context with stack chips and explanation', () => {
    render(<StageContextPanel stage="Discover" stack={['TypeScript', 'React']} />);

    expect(screen.getByText('Discover Context')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText(/Searching public developer job descriptions/i)).toBeInTheDocument();

    // Verify NO raw session IDs, TTLs, or fake metrics appear
    expect(screen.queryByText(/session_id/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ttl/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/86400/)).not.toBeInTheDocument();
  });

  it('renders Choose stage context with ranking note', () => {
    render(
      <StageContextPanel
        stage="Choose"
        relationshipLabel="Selected practice repository"
        rankingNote="Ranked deterministically by stack match and guidelines."
      />
    );

    expect(screen.getByText('Choose Context')).toBeInTheDocument();
    expect(screen.getByText('Selected practice repository')).toBeInTheDocument();
    expect(screen.getByText('Top 5 ranked options')).toBeInTheDocument();
    expect(screen.getByText('Ranked deterministically by stack match and guidelines.')).toBeInTheDocument();
  });

  it('renders Understand stage context with source count', () => {
    render(
      <StageContextPanel
        stage="Understand"
        sourceCount={3}
        relationshipLabel="Verified company repository"
      />
    );

    expect(screen.getByText('Understand Context')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/verified source citations/i)).toBeInTheDocument();
    expect(screen.getByText(/Decide whether this issue scope/i)).toBeInTheDocument();
  });

  it('renders Draft stage context with draft warning', () => {
    render(
      <StageContextPanel
        stage="Draft"
        reviewedSourceCount={2}
      />
    );

    expect(screen.getByText('Draft Context')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/source files retrieved/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft patch text only/i)).toBeInTheDocument();
  });

  it('renders Verify stage context with manual check count and truth notice', () => {
    render(
      <StageContextPanel
        stage="Verify"
        recordedCheckCount={4}
      />
    );

    expect(screen.getByText('Verify Context')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(/manual checks available/i)).toBeInTheDocument();
    expect(screen.getByText(/Record only test results you personally observed/i)).toBeInTheDocument();
  });
});
