/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React from 'react';

export interface HeaderProps {
  stage?: string;
  onBack?: () => void;
  backLabel?: string;
}

export const Header: React.FC<HeaderProps> = ({
  stage = 'Discover',
  onBack,
  backLabel = 'Back',
}) => {
  return (
    <header className="ws-header" role="banner">
      <div className="ws-header-inner">
        <div className="ws-header-left">
          <a href="/" className="ws-header-brand" aria-label="Web-Slinger home">
            <div className="ws-mark" aria-hidden="true">
              <div className="ws-mark-glyph" />
            </div>
            <span className="ws-wordmark">Web-Slinger</span>
          </a>

          {onBack && (
            <button
              type="button"
              className="ws-header-back-btn"
              onClick={onBack}
              aria-label={`Go back to ${backLabel}`}
            >
              ← {backLabel}
            </button>
          )}
        </div>

        <div className="ws-header-right">
          <span className="ws-stage-badge" aria-label={`Current stage: ${stage}`}>
            {stage}
          </span>
          <a
            href="#how-it-works"
            className="ws-quiet-link"
            onClick={(e) => {
              e.preventDefault();
            }}
          >
            How it works
          </a>
        </div>
      </div>
    </header>
  );
};
