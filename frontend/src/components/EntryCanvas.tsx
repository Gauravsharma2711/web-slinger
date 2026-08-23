/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React, { useState } from 'react';
import { SessionDocument } from '@web-slinger/shared';
import { createSession } from '../api/sessions.js';
import { StageContextPanel } from './StageContextPanel.js';
import { WhatHappensNext } from './WhatHappensNext.js';

const PRESET_TECHNOLOGIES = [
  'TypeScript',
  'React',
  'Node.js',
  'Python',
  'Go',
  'Rust',
  'PostgreSQL',
  'GraphQL',
];

interface EntryCanvasProps {
  onSessionCreated: (session: SessionDocument) => void;
}

export const EntryCanvas: React.FC<EntryCanvasProps> = ({ onSessionCreated }) => {
  const [selectedChips, setSelectedChips] = useState<string[]>(['TypeScript', 'React']);
  const [goalInput, setGoalInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleChip = (tech: string) => {
    setSelectedChips((prev) => {
      if (prev.includes(tech)) {
        return prev.filter((t) => t !== tech);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return [...prev, tech];
    });
    setErrorMessage(null);
  };

  const handleReset = () => {
    setSelectedChips([]);
    setGoalInput('');
    setErrorMessage(null);
  };

  const handleSubmit = async () => {
    if (selectedChips.length === 0) {
      setErrorMessage('Please select at least 1 technology.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const isExplicitDemo =
      (typeof window !== 'undefined' &&
        ((window as unknown as { __DEMO_MODE__?: boolean }).__DEMO_MODE__ === true ||
          window.location.search.includes('demo=true') ||
          window.localStorage.getItem('DEMO_MODE') === 'true')) ||
      (import.meta as unknown as { env?: Record<string, string | undefined> }).env
        ?.VITE_DEMO_MODE === 'true';

    try {
      const session = await createSession({
        stack: selectedChips.slice(0, 5),
        goal: goalInput.trim() ? goalInput.trim().slice(0, 280) : undefined,
        mode: isExplicitDemo ? 'demo' : 'live',
      });
      onSessionCreated(session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to create session. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasSelection = selectedChips.length > 0 || goalInput.trim().length > 0;

  return (
    <div className="ws-page-canvas">
      <h1 className="ws-prompt-heading">What stack are you exploring?</h1>
      <p className="ws-prompt-description">
        Select 1 to 5 technologies. Web-Slinger will find matching public engineering opportunities
        and candidate open-source issues.
      </p>

      <StageContextPanel
        stage="Discover"
        stack={selectedChips}
        customExplanation="Searching public developer job descriptions for matching stack requirements and verified repository links."
      />

      <div className="ws-chip-group" role="group" aria-label="Preset technologies">
        {PRESET_TECHNOLOGIES.map((tech) => {
          const isSelected = selectedChips.includes(tech);
          return (
            <button
              key={tech}
              type="button"
              className={`ws-chip ${isSelected ? 'selected' : ''}`}
              onClick={() => toggleChip(tech)}
              aria-pressed={isSelected}
            >
              {tech}
            </button>
          );
        })}
      </div>

      <div className="ws-input-container">
        <label htmlFor="goal-input" style={{ display: 'none' }}>
          Contribution goal or specific focus area
        </label>
        <input
          id="goal-input"
          type="text"
          className="ws-text-input"
          placeholder="Optional goal (e.g. Find developer tooling issues or performance bugs)..."
          value={goalInput}
          maxLength={280}
          onChange={(e) => {
            setGoalInput(e.target.value);
            setErrorMessage(null);
          }}
        />
        {errorMessage && (
          <div className="ws-error-card" role="alert" style={{ marginTop: 'var(--ws-space-3)' }}>
            <div className="ws-error-title">Unable to create session</div>
            <p className="ws-error-body"><strong>What happened:</strong> {errorMessage}</p>
            <p className="ws-error-body"><strong>What is saved:</strong> Your selected technologies are preserved.</p>
            <p className="ws-error-body"><strong>Next action:</strong> Please check your connection and click Find opportunities again.</p>
          </div>
        )}
      </div>

      <div className="ws-actions">
        <button
          type="button"
          className="ws-button-primary"
          disabled={selectedChips.length === 0 || isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting ? 'Creating session...' : 'Find opportunities'}
        </button>

        {hasSelection && (
          <button
            type="button"
            className="ws-button-secondary"
            disabled={isSubmitting}
            onClick={handleReset}
          >
            Reset
          </button>
        )}
      </div>

      <WhatHappensNext
        stepName="Choose"
        description="After creating your session, Web-Slinger searches live job descriptions and ranks the top 5 matching opportunities."
      />

      <details className="ws-details-section">
        <summary className="ws-details-summary">Details</summary>
        <div className="ws-details-content">
          <div>Session-scoped • Evidence-grounded • Human-verified</div>
        </div>
      </details>
    </div>
  );
};

