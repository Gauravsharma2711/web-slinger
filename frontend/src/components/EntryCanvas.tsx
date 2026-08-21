/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React, { useState } from 'react';
import { SessionDocument } from '@web-slinger/shared';
import { createSession } from '../api/sessions.js';

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

    try {
      const session = await createSession({
        stack: selectedChips.slice(0, 5),
        goal: goalInput.trim() ? goalInput.trim().slice(0, 280) : undefined,
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
      <h1 className="ws-prompt-heading">What stack are you targeting?</h1>
      <p className="ws-prompt-description">
        Select 1 to 5 technologies and optionally describe your contribution goal. Web-Slinger
        will initialize a session to research public opportunities and matching GitHub issues.
      </p>

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
          <p
            style={{
              margin: 'var(--ws-space-1) 0 0 0',
              color: 'var(--ws-danger)',
              fontSize: '13px',
            }}
            role="alert"
          >
            {errorMessage}
          </p>
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

      <div className="ws-footer-note">
        SESSION SCOPED • EVIDENCE GROUNDED • HUMAN VERIFIED
      </div>
    </div>
  );
};
