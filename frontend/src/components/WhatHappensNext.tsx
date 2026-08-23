/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React from 'react';

export interface WhatHappensNextProps {
  stepName: string;
  description: string;
  className?: string;
}

export const WhatHappensNext: React.FC<WhatHappensNextProps> = ({
  stepName,
  description,
  className = '',
}) => {
  return (
    <aside className={`ws-what-next-card ${className}`} aria-label="What happens next">
      <div className="ws-what-next-header">
        <span className="ws-what-next-pill">What happens next</span>
        <span className="ws-what-next-step">{stepName}</span>
      </div>
      <p className="ws-what-next-desc">{description}</p>
    </aside>
  );
};
