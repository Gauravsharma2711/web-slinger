/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React from 'react';

export type StageName = 'Discover' | 'Choose' | 'Understand' | 'Draft' | 'Verify';

export interface ProgressRailProps {
  currentStage: StageName;
  completedStages?: StageName[];
  onNavigate?: (stage: StageName) => void;
}

const STAGES: { name: StageName; label: string; number: number }[] = [
  { name: 'Discover', label: 'Discover', number: 1 },
  { name: 'Choose', label: 'Choose', number: 2 },
  { name: 'Understand', label: 'Understand', number: 3 },
  { name: 'Draft', label: 'Draft', number: 4 },
  { name: 'Verify', label: 'Verify', number: 5 },
];

export const ProgressRail: React.FC<ProgressRailProps> = ({
  currentStage,
  completedStages = [],
  onNavigate,
}) => {
  return (
    <nav className="ws-progress-rail" aria-label="Contribution workflow progress">
      <ol className="ws-progress-list">
        {STAGES.map((st, idx) => {
          const isCurrent = st.name === currentStage;
          const isCompleted = completedStages.includes(st.name) && !isCurrent;
          const isLocked = !isCurrent && !isCompleted;

          const stateClass = isCurrent
            ? 'ws-progress-item-current'
            : isCompleted
            ? 'ws-progress-item-completed'
            : 'ws-progress-item-locked';

          return (
            <li key={st.name} className={`ws-progress-item ${stateClass}`}>
              {idx > 0 && <span className="ws-progress-divider" aria-hidden="true">→</span>}
              {isCompleted && onNavigate ? (
                <button
                  type="button"
                  className="ws-progress-btn"
                  onClick={() => onNavigate(st.name)}
                  aria-label={`Go to completed step ${st.number}: ${st.label}`}
                >
                  <span className="ws-progress-step-num">{st.number}</span>
                  <span className="ws-progress-step-label">{st.label}</span>
                </button>
              ) : (
                <div
                  className="ws-progress-step-static"
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-disabled={isLocked ? 'true' : undefined}
                >
                  <span className="ws-progress-step-num">{st.number}</span>
                  <span className="ws-progress-step-label">{st.label}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
