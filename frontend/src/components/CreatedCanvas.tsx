/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React from 'react';
import { SessionDocument } from '@web-slinger/shared';

interface CreatedCanvasProps {
  session: SessionDocument;
  onReset: () => void;
}

export const CreatedCanvas: React.FC<CreatedCanvasProps> = ({ session, onReset }) => {
  return (
    <div className="ws-page-canvas">
      <div className="ws-meta-bar">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--ws-space-2)',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: 'var(--ws-safe)',
            }}
          />
          <span className="ws-session-indicator">
            SESSION ACTIVE • ID: {session.session_id.slice(0, 8)}... • 24H TTL
          </span>
        </div>
      </div>

      <h1 className="ws-prompt-heading">Target stack confirmed.</h1>
      <p className="ws-prompt-description">
        Your technical profile has been saved. We are ready to research public job opportunities,
        discover matching companies, and find candidate GitHub issues.
      </p>

      <div style={{ marginBottom: 'var(--ws-space-6)' }}>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--ws-font-mono)',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--ws-muted)',
            marginBottom: 'var(--ws-space-2)',
          }}
        >
          CONFIRMED TECHNOLOGIES
        </span>
        <div className="ws-chip-group" role="group" aria-label="Confirmed technologies">
          {session.stack.map((tech) => (
            <div
              key={tech}
              className="ws-chip selected"
              style={{ cursor: 'default' }}
            >
              {tech}
            </div>
          ))}
        </div>
      </div>

      {session.goal && (
        <div
          style={{
            padding: 'var(--ws-space-4)',
            backgroundColor: 'var(--ws-surface)',
            border: 'var(--ws-rule-width) solid var(--ws-rule)',
            borderRadius: 'var(--ws-radius-sm)',
            marginBottom: 'var(--ws-space-6)',
            maxWidth: '42rem',
          }}
        >
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--ws-font-mono)',
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--ws-muted)',
              marginBottom: 'var(--ws-space-1)',
            }}
          >
            STATED GOAL
          </span>
          <p
            style={{
              margin: 0,
              fontSize: '14px',
              color: 'var(--ws-ink)',
              lineHeight: 1.5,
            }}
          >
            {session.goal}
          </p>
        </div>
      )}

      <div className="ws-actions">
        <button
          type="button"
          className="ws-button-primary"
          disabled
          title="Research pipeline unlocks in subsequent stage"
        >
          Begin opportunity research
        </button>

        <button
          type="button"
          className="ws-button-secondary"
          onClick={onReset}
        >
          New session
        </button>
      </div>

      <div className="ws-footer-note">
        SESSION SCOPED • EVIDENCE GROUNDED • HUMAN VERIFIED
      </div>
    </div>
  );
};
