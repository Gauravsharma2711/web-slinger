/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React from 'react';

interface HeaderProps {
  stage?: string;
}

export const Header: React.FC<HeaderProps> = ({ stage = 'ENTRY' }) => {
  return (
    <header className="ws-header" role="banner">
      <div className="ws-header-inner">
        <a href="/" className="ws-header-brand" aria-label="Web-Slinger home">
          <div className="ws-mark" aria-hidden="true">
            <div className="ws-mark-glyph" />
          </div>
          <span className="ws-wordmark">Web-Slinger</span>
        </a>

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
