/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React from 'react';
import { Header } from './Header.js';
import { InteractiveDottedCanvas } from './InteractiveDottedCanvas.js';
import { ProgressRail, StageName } from './ProgressRail.js';

export interface AppShellProps {
  stage?: string;
  currentStage?: StageName;
  completedStages?: StageName[];
  onNavigateStage?: (stage: StageName) => void;
  onBack?: () => void;
  backLabel?: string;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  stage = 'Discover',
  currentStage = 'Discover',
  completedStages = [],
  onNavigateStage,
  onBack,
  backLabel,
  children,
}) => {
  // Normalize stage to StageName if possible
  const canonicalStage: StageName =
    currentStage ||
    (stage === 'Choose' || stage === 'Understand' || stage === 'Draft' || stage === 'Verify'
      ? stage
      : 'Discover');

  return (
    <div className="ws-app-root ws-canvas-texture">
      <InteractiveDottedCanvas />
      <Header stage={stage} onBack={onBack} backLabel={backLabel} />
      <ProgressRail
        currentStage={canonicalStage}
        completedStages={completedStages}
        onNavigate={onNavigateStage}
      />
      <main className="ws-content-shell" role="main">
        <div className="ws-content-rail">
          {children}
        </div>
      </main>
    </div>
  );
};

// PageShell alias for semantic consistency across product routes
export const PageShell = AppShell;
export type PageShellProps = AppShellProps;

