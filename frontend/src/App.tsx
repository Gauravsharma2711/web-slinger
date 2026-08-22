/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SessionDocument, SessionStatusResponse, NormalizedIssue } from '@web-slinger/shared';
import { AppShell } from './components/AppShell.js';
import { EntryCanvas } from './components/EntryCanvas.js';
import { ResearchCanvas } from './components/ResearchCanvas.js';
import { IssuesCanvas } from './components/IssuesCanvas.js';
import { ContextBriefCanvas } from './components/ContextBriefCanvas.js';
import { WorkbenchCanvas } from './components/WorkbenchCanvas.js';
import { startResearch, getSessionStatus } from './api/sessions.js';

const SESSION_STORAGE_KEY = 'web-slinger-session-id';
const VIEW_STORAGE_KEY = 'web-slinger-view';
const SELECTED_ISSUE_KEY = 'web-slinger-selected-issue';

type ActiveView = 'entry' | 'research' | 'issues' | 'brief' | 'workbench';

export const App: React.FC = () => {
  const [activeSession, setActiveSession] = useState<SessionDocument | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatusResponse | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('entry');
  const [selectedIssue, setSelectedIssue] = useState<NormalizedIssue | null>(null);
  const [isStartingResearch, setIsStartingResearch] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearPollInterval = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(
    async (sessionId: string) => {
      try {
        const status = await getSessionStatus(sessionId);
        setSessionStatus(status);
        setActiveSession((prev) => {
          if (!prev) {
            return {
              session_id: status.session_id,
              stack: status.stack,
              normalized_stack: status.normalized_stack,
              goal: status.goal,
              stage: status.stage,
              created_at: status.created_at,
              updated_at: status.updated_at,
              expires_at: status.expires_at,
              current_job_id: status.current_job?.job_id,
              snapshot_id: status.snapshot_id ?? status.current_job?.snapshot_id ?? null,
              health: status.health,
              research_results: status.research_results,
              discovered_issues: status.discovered_issues,
            };
          }
          return {
            ...prev,
            stack: prev.stack.length > 0 ? prev.stack : status.stack,
            normalized_stack:
              prev.normalized_stack.length > 0
                ? prev.normalized_stack
                : status.normalized_stack,
            goal: prev.goal ?? status.goal ?? null,
            stage: status.stage,
            snapshot_id: status.snapshot_id ?? status.current_job?.snapshot_id ?? prev.snapshot_id ?? null,
            health: status.health,
            research_results: status.research_results,
            discovered_issues: status.discovered_issues,
          };
        });

        // If job completed, degraded, or failed, stop polling
        const jobStatus = status.current_job?.status;
        if (
          jobStatus === 'completed' ||
          jobStatus === 'degraded' ||
          jobStatus === 'failed'
        ) {
          clearPollInterval();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to check status';
        setErrorMessage(msg);
        clearPollInterval();
      }
    },
    [clearPollInterval]
  );

  // Resume session from sessionStorage on mount
  useEffect(() => {
    const savedSessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
    const savedView = (sessionStorage.getItem(VIEW_STORAGE_KEY) as ActiveView) || 'research';
    const savedIssueJson = sessionStorage.getItem(SELECTED_ISSUE_KEY);

    if (savedIssueJson) {
      try {
        const parsed = JSON.parse(savedIssueJson) as NormalizedIssue;
        if (parsed && parsed.number) {
          setSelectedIssue(parsed);
        }
      } catch {
        // Ignore JSON error
      }
    }

    if (savedSessionId) {
      fetchStatus(savedSessionId);
      if (savedView === 'workbench' && savedIssueJson) {
        setActiveView('workbench');
      } else if (savedView === 'brief' && savedIssueJson) {
        setActiveView('brief');
      } else if (savedView === 'issues') {
        setActiveView('issues');
      } else {
        setActiveView('research');
      }
    }
  }, [fetchStatus]);

  // Manage 2-second polling loop when job is queued or running
  useEffect(() => {
    const jobStatus = sessionStatus?.current_job?.status;
    const isJobActive = jobStatus === 'queued' || jobStatus === 'running';

    if (activeSession && (isJobActive || isStartingResearch)) {
      clearPollInterval();
      pollIntervalRef.current = setInterval(() => {
        fetchStatus(activeSession.session_id);
      }, 2000);
    } else {
      clearPollInterval();
    }

    return () => {
      clearPollInterval();
    };
  }, [activeSession, sessionStatus, isStartingResearch, fetchStatus, clearPollInterval]);

  const handleSessionCreated = (session: SessionDocument) => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, session.session_id);
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'research');
    sessionStorage.removeItem(SELECTED_ISSUE_KEY);
    setActiveSession(session);
    setActiveView('research');
    setSelectedIssue(null);
    setSessionStatus(null);
    setErrorMessage(null);
  };

  const handleStartResearch = async (forceNew = false) => {
    if (!activeSession) return;
    setIsStartingResearch(true);
    setErrorMessage(null);

    try {
      const response = await startResearch(activeSession.session_id, forceNew);
      setSessionStatus({
        session_id: activeSession.session_id,
        stage: 'researching',
        stack: activeSession.stack,
        normalized_stack: activeSession.normalized_stack,
        goal: activeSession.goal,
        created_at: activeSession.created_at,
        updated_at: new Date().toISOString(),
        expires_at: activeSession.expires_at,
        ttl_seconds_remaining: 86400,
        is_expired: false,
        current_job: {
          job_id: response.job_id,
          type: 'research',
          status: response.status,
          message: response.message,
          snapshot_id: response.snapshot_id,
        },
        snapshot_id: response.snapshot_id,
        message: response.message,
      });
      // Trigger immediate status check
      await fetchStatus(activeSession.session_id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start research';
      setErrorMessage(msg);
    } finally {
      setIsStartingResearch(false);
    }
  };

  const handleNavigateToIssues = () => {
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'issues');
    setActiveView('issues');
  };

  const handleBackToOpportunities = () => {
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'research');
    setActiveView('research');
  };

  const handleSelectIssue = (issue: NormalizedIssue) => {
    setSelectedIssue(issue);
    sessionStorage.setItem(SELECTED_ISSUE_KEY, JSON.stringify(issue));
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'brief');
    setActiveView('brief');
  };

  const handleOpenWorkbench = () => {
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'workbench');
    setActiveView('workbench');
  };

  const handleBackToBrief = () => {
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'brief');
    setActiveView('brief');
  };

  const handleBackToIssues = () => {
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'issues');
    setActiveView('issues');
  };

  const handleResetSession = () => {
    clearPollInterval();
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(VIEW_STORAGE_KEY);
    sessionStorage.removeItem(SELECTED_ISSUE_KEY);
    setActiveSession(null);
    setActiveView('entry');
    setSelectedIssue(null);
    setSessionStatus(null);
    setErrorMessage(null);
  };

  // Determine stage label for Header
  let stageLabel = 'ENTRY';
  if (activeSession) {
    if (activeView === 'workbench') {
      stageLabel = 'WORKBENCH';
    } else if (activeView === 'brief') {
      stageLabel = 'CONTEXT BRIEF';
    } else if (activeView === 'issues') {
      stageLabel = 'CANDIDATE ISSUES';
    } else {
      const jobStatus = sessionStatus?.current_job?.status;
      if (jobStatus === 'running' || jobStatus === 'queued' || isStartingResearch) {
        stageLabel = 'RESEARCHING';
      } else if (jobStatus === 'completed') {
        stageLabel = 'RESEARCH COMPLETED';
      } else if (jobStatus === 'degraded' || jobStatus === 'failed') {
        stageLabel = 'RESEARCH DEGRADED';
      } else {
        stageLabel = activeSession.stage.toUpperCase();
      }
    }
  }

  // Combine active session info with latest status stack if restored from storage
  const currentSession: SessionDocument | null = activeSession
    ? {
        ...activeSession,
        stack:
          activeSession.stack.length > 0
            ? activeSession.stack
            : sessionStatus?.stack || [],
        normalized_stack:
          activeSession.normalized_stack.length > 0
            ? activeSession.normalized_stack
            : sessionStatus?.normalized_stack || [],
        goal: activeSession.goal ?? sessionStatus?.goal ?? null,
        stage: sessionStatus?.stage || activeSession.stage,
        snapshot_id: sessionStatus?.snapshot_id ?? activeSession.snapshot_id ?? null,
      }
    : null;

  return (
    <AppShell stage={stageLabel}>
      {currentSession ? (
        activeView === 'workbench' && selectedIssue ? (
          <WorkbenchCanvas
            session={currentSession}
            issue={selectedIssue}
            onBackToBrief={handleBackToBrief}
            onReset={handleResetSession}
          />
        ) : activeView === 'brief' && selectedIssue ? (
          <ContextBriefCanvas
            session={currentSession}
            issue={selectedIssue}
            onBackToIssues={handleBackToIssues}
            onOpenWorkbench={handleOpenWorkbench}
            onReset={handleResetSession}
          />
        ) : activeView === 'issues' ? (
          <IssuesCanvas
            session={currentSession}
            onBackToOpportunities={handleBackToOpportunities}
            onSelectIssue={handleSelectIssue}
            onReset={handleResetSession}
          />
        ) : (
          <ResearchCanvas
            session={currentSession}
            sessionStatus={sessionStatus}
            isStartingResearch={isStartingResearch}
            errorMessage={errorMessage}
            onStartResearch={() => handleStartResearch(false)}
            onRetryResearch={(forceNew) => handleStartResearch(forceNew ?? false)}
            onExploreIssues={handleNavigateToIssues}
            onReset={handleResetSession}
          />
        )
      ) : (
        <EntryCanvas onSessionCreated={handleSessionCreated} />
      )}
    </AppShell>
  );
};

export default App;
