/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React from 'react';
import { StageName } from './ProgressRail.js';

export interface StageContextPanelProps {
  stage: StageName;
  stack?: string[];
  rankingNote?: string;
  relationshipLabel?: string;
  sourceCount?: number;
  reviewedSourceCount?: number;
  recordedCheckCount?: number;
  customExplanation?: string;
  className?: string;
}

export const StageContextPanel: React.FC<StageContextPanelProps> = ({
  stage,
  stack = [],
  rankingNote,
  relationshipLabel,
  sourceCount,
  reviewedSourceCount,
  recordedCheckCount,
  customExplanation,
  className = '',
}) => {
  return (
    <div className={`ws-stage-context-panel ${className}`} role="region" aria-label={`${stage} stage context`}>
      <div className="ws-stage-context-header">
        <span className="ws-stage-context-pill">{stage} Context</span>
        {relationshipLabel && (
          <span className="ws-stage-context-rel">{relationshipLabel}</span>
        )}
      </div>

      <div className="ws-stage-context-body">
        {stage === 'Discover' && (
          <>
            {stack.length > 0 && (
              <div className="ws-stage-context-chips">
                <span className="ws-stage-context-label">Selected stack:</span>
                {stack.map((item) => (
                  <span key={item} className="ws-chip ws-chip-sm">
                    {item}
                  </span>
                ))}
              </div>
            )}
            <p className="ws-stage-context-text">
              {customExplanation ||
                'Searching public developer job descriptions for matching stack requirements and verified repository links.'}
            </p>
          </>
        )}

        {stage === 'Choose' && (
          <>
            <div className="ws-stage-context-highlight">
              <strong>Top 5 ranked options</strong>
            </div>
            <p className="ws-stage-context-text">
              {rankingNote ||
                'Ranked deterministically by selected-stack keyword relevance, verified repository health, and documented contribution guidance.'}
            </p>
          </>
        )}

        {stage === 'Understand' && (
          <>
            <div className="ws-stage-context-meta-row">
              {typeof sourceCount === 'number' && (
                <span className="ws-stage-context-stat">
                  <strong>{sourceCount}</strong> {sourceCount === 1 ? 'verified source citation' : 'verified source citations'}
                </span>
              )}
            </div>
            <p className="ws-stage-context-text">
              {customExplanation ||
                'Decide whether this issue scope and guidance match your goals before opening the workbench.'}
            </p>
          </>
        )}

        {stage === 'Draft' && (
          <>
            <div className="ws-stage-context-meta-row">
              {typeof reviewedSourceCount === 'number' && (
                <span className="ws-stage-context-stat">
                  <strong>{reviewedSourceCount}</strong> {reviewedSourceCount === 1 ? 'source file retrieved' : 'source files retrieved'}
                </span>
              )}
            </div>
            <p className="ws-stage-context-warning">
              ⚠ Draft patch text only. Web-Slinger never modifies your local repository or runs unverified commands.
            </p>
          </>
        )}

        {stage === 'Verify' && (
          <>
            <div className="ws-stage-context-meta-row">
              {typeof recordedCheckCount === 'number' && (
                <span className="ws-stage-context-stat">
                  <strong>{recordedCheckCount}</strong> {recordedCheckCount === 1 ? 'manual check available' : 'manual checks available'}
                </span>
              )}
            </div>
            <p className="ws-stage-context-text">
              {customExplanation ||
                'Record only test results you personally observed. You own all local verification before creating a contribution.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
};
