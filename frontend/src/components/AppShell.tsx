/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React from 'react';
import { Header } from './Header.js';

export interface AppShellProps {
  stage?: string;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ stage = 'ENTRY', children }) => {
  return (
    <div className="ws-app-root ws-canvas-texture">
      <Header stage={stage} />
      <main className="ws-content-shell" role="main">
        <div className="ws-content-rail">
          {children}
        </div>
      </main>
    </div>
  );
};
