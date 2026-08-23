/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SessionDocument, SessionStatusResponse, NormalizedIssue } from '@web-slinger/shared';
import { AppShell } from './components/AppShell.js';
import { type StageName } from './components/ProgressRail.js';
import { EntryCanvas } from './components/EntryCanvas.js';
import { ResearchCanvas } from './components/ResearchCanvas.js';
import { IssuesCanvas } from './components/IssuesCanvas.js';
import { ContextBriefCanvas } from './components/ContextBriefCanvas.js';
import { WorkbenchCanvas } from './components/WorkbenchCanvas.js';
import { VerifyCanvas } from './components/VerifyCanvas.js';
import { ManualHandoffCanvas } from './components/ManualHandoffCanvas.js';
import { OpportunitiesCanvas } from './components/OpportunitiesCanvas.js';
import { startResearch, getSessionStatus, selectOpportunity } from './api/sessions.js';
import { NormalizedJobResult } from '@web-slinger/shared';

const SESSION_STORAGE_KEY = 'web-slinger-session-id';
const VIEW_STORAGE_KEY = 'web-slinger-view';
const SELECTED_ISSUE_KEY = 'web-slinger-selected-issue';

type ActiveView = 'entry' | 'research' | 'opportunities' | 'issues' | 'brief' | 'workbench' | 'verify' | 'handoff';

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
      if (savedView === 'handoff' && savedIssueJson) {
        setActiveView('handoff');
      } else if (savedView === 'verify' && savedIssueJson) {
        setActiveView('verify');
      } else if (savedView === 'workbench' && savedIssueJson) {
        setActiveView('workbench');
      } else if (savedView === 'brief' && savedIssueJson) {
        setActiveView('brief');
      } else if (savedView === 'issues') {
        setActiveView('issues');
      } else if (savedView === 'opportunities') {
        setActiveView('opportunities');
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
    const isDemo =
      session.data_mode === 'demo' ||
      session.dataMode === 'demo' ||
      Boolean(session.research_results?.some((r) => r.is_fixture || (r as { isFixture?: boolean }).isFixture));

    const nextView = isDemo ? 'opportunities' : 'research';
    sessionStorage.setItem(VIEW_STORAGE_KEY, nextView);
    sessionStorage.removeItem(SELECTED_ISSUE_KEY);
    setActiveSession(session);
    setActiveView(nextView);
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

  const [workbenchStep, setWorkbenchStep] = useState<'plan' | 'sources' | 'patch' | 'verification' | 'receipt'>('plan');

  // Determine canonical current stage and completed stages for ProgressRail
  let currentStage: StageName = 'Discover';
  const completedStages: StageName[] = [];

  const isDemoModeActive =
    (typeof window !== 'undefined' &&
      ((window as unknown as { __DEMO_MODE__?: boolean }).__DEMO_MODE__ === true ||
        window.location.search.includes('demo=true') ||
        window.localStorage.getItem('DEMO_MODE') === 'true')) ||
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_DEMO_MODE === 'true' ||
    activeSession?.data_mode === 'demo' ||
    activeSession?.dataMode === 'demo' ||
    sessionStatus?.data_mode === 'demo' ||
    sessionStatus?.dataMode === 'demo' ||
    Boolean(activeSession?.research_results?.some((r) => r.is_fixture || (r as { isFixture?: boolean }).isFixture)) ||
    Boolean(sessionStatus?.research_results?.some((r) => r.is_fixture || (r as { isFixture?: boolean }).isFixture)) ||
    Boolean(sessionStatus?.current_job?.is_fixture);

  if (activeSession) {
    if (activeView === 'handoff' || activeView === 'verify') {
      currentStage = 'Verify';
      completedStages.push('Discover', 'Choose', 'Understand', 'Draft');
    } else if (activeView === 'workbench') {
      if (workbenchStep === 'verification' || workbenchStep === 'receipt') {
        currentStage = 'Verify';
        completedStages.push('Discover', 'Choose', 'Understand', 'Draft');
      } else {
        currentStage = 'Draft';
        completedStages.push('Discover', 'Choose', 'Understand');
      }
    } else if (activeView === 'brief') {
      currentStage = 'Understand';
      completedStages.push('Discover', 'Choose');
    } else if (activeView === 'issues') {
      currentStage = 'Choose';
      completedStages.push('Discover');
    } else {
      const showsResearchCanvas =
        (!activeSession.research_results?.length &&
          !sessionStatus?.research_results?.length &&
          !sessionStatus?.current_job &&
          !isDemoModeActive) ||
        isStartingResearch ||
        sessionStatus?.current_job?.status === 'running' ||
        sessionStatus?.current_job?.status === 'queued';
      if (showsResearchCanvas) {
        currentStage = 'Discover';
        if (sessionStatus?.current_job?.status === 'completed') {
          completedStages.push('Discover');
        }
      } else {
        // Opportunities view: single compact rail (AppShell's) at the Choose stage
        currentStage = 'Choose';
        completedStages.push('Discover');
      }
    }
  }

  const handleNavigateStage = (targetStage: StageName) => {
    if (targetStage === 'Discover') {
      if (activeSession) {
        sessionStorage.setItem(VIEW_STORAGE_KEY, 'research');
        setActiveView('research');
      }
    } else if (targetStage === 'Choose') {
      sessionStorage.setItem(VIEW_STORAGE_KEY, 'issues');
      setActiveView('issues');
    } else if (targetStage === 'Understand') {
      if (selectedIssue) {
        sessionStorage.setItem(VIEW_STORAGE_KEY, 'brief');
        setActiveView('brief');
      }
    } else if (targetStage === 'Draft') {
      if (selectedIssue) {
        setWorkbenchStep('plan');
        sessionStorage.setItem(VIEW_STORAGE_KEY, 'workbench');
        setActiveView('workbench');
      }
    } else if (targetStage === 'Verify') {
      if (selectedIssue) {
        sessionStorage.setItem(VIEW_STORAGE_KEY, 'verify');
        setActiveView('verify');
      }
    }
  };

  let headerBackHandler: (() => void) | undefined = undefined;
  let headerBackLabel: string | undefined = undefined;

  if (activeView === 'handoff') {
    headerBackHandler = () => {
      sessionStorage.setItem(VIEW_STORAGE_KEY, 'verify');
      setActiveView('verify');
    };
    headerBackLabel = 'Back to verification checks';
  } else if (activeView === 'verify') {
    headerBackHandler = () => {
      sessionStorage.setItem(VIEW_STORAGE_KEY, 'workbench');
      setActiveView('workbench');
    };
    headerBackLabel = 'Back to draft patch';
  } else if (activeView === 'issues') {
    headerBackHandler = handleBackToOpportunities;
    headerBackLabel = 'Back to opportunities';
  } else if (activeView === 'brief') {
    headerBackHandler = handleBackToIssues;
    headerBackLabel = 'Back to candidate issues';
  } else if (activeView === 'workbench') {
    headerBackHandler = handleBackToBrief;
    headerBackLabel = 'Back to context brief';
  }

  const handleSelectOpportunity = async (job: NormalizedJobResult) => {
    if (!activeSession) return;
    try {
      await selectOpportunity(activeSession.session_id, {
        companyId: job.company_id,
        jobId: job.job_id,
        job,
      });
      setActiveSession((prev) =>
        prev
          ? {
              ...prev,
              stage: 'company_selected',
              selected_company_id: job.company_id,
              selectedCompanyId: job.company_id,
              selected_job_id: job.job_id,
              selectedJobId: job.job_id,
              selected_job: job,
              selectedJob: job,
            }
          : prev
      );
    } catch (err) {
      console.warn('Failed to persist selected opportunity:', err);
    }
  };

  const handleProceedToRepositories = (): void => {
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'issues');
    setActiveView('issues');
  };

  const handleCheckExistingResearch = () => {
    if (activeSession) {
      fetchStatus(activeSession.session_id);
    }
  };

  return (
    <AppShell
      stage={currentStage}
      currentStage={currentStage}
      completedStages={completedStages}
      onNavigateStage={handleNavigateStage}
      onBack={headerBackHandler}
      backLabel={headerBackLabel}
    >
      {activeSession ? (
        activeView === 'handoff' && selectedIssue ? (
          <ManualHandoffCanvas
            session={activeSession}
            issue={selectedIssue}
            onBackToVerify={() => {
              sessionStorage.setItem(VIEW_STORAGE_KEY, 'verify');
              setActiveView('verify');
            }}
            onBackToDraft={() => {
              sessionStorage.setItem(VIEW_STORAGE_KEY, 'workbench');
              setActiveView('workbench');
            }}
            onReset={handleResetSession}
          />
        ) : activeView === 'verify' && selectedIssue ? (
          <VerifyCanvas
            session={activeSession}
            issue={selectedIssue}
            onPrepareHandoff={() => {
              sessionStorage.setItem(VIEW_STORAGE_KEY, 'handoff');
              setActiveView('handoff');
            }}
            onBackToDraft={() => {
              sessionStorage.setItem(VIEW_STORAGE_KEY, 'workbench');
              setActiveView('workbench');
            }}
            onReset={handleResetSession}
          />
        ) : activeView === 'workbench' && selectedIssue ? (
          <WorkbenchCanvas
            session={activeSession}
            issue={selectedIssue}
            onStepChange={setWorkbenchStep}
            onBackToBrief={handleBackToBrief}
            onContinueToVerify={() => {
              sessionStorage.setItem(VIEW_STORAGE_KEY, 'verify');
              setActiveView('verify');
            }}
            onReset={handleResetSession}
          />
        ) : activeView === 'brief' && selectedIssue ? (
          <ContextBriefCanvas
            session={activeSession}
            issue={selectedIssue}
            onBackToIssues={handleBackToIssues}
            onOpenWorkbench={handleOpenWorkbench}
            onReset={handleResetSession}
          />
        ) : activeView === 'issues' ? (
          <IssuesCanvas
            session={activeSession}
            onBackToOpportunities={handleBackToOpportunities}
            onSelectIssue={handleSelectIssue}
            onReset={handleResetSession}
          />
        ) : activeView === 'opportunities' || (isDemoModeActive && activeView === 'research') ? (
          <OpportunitiesCanvas
            session={activeSession}
            sessionStatus={sessionStatus}
            isDemoMode={isDemoModeActive}
            onSelectOpportunity={handleSelectOpportunity}
            onProceedToRepositories={handleProceedToRepositories}
            onCheckExistingResearch={handleCheckExistingResearch}
            onReset={handleResetSession}
            errorMessage={errorMessage}
          />
        ) : (!activeSession.research_results?.length && !sessionStatus?.research_results?.length && !sessionStatus?.current_job && !isDemoModeActive) ||
          isStartingResearch ||
          sessionStatus?.current_job?.status === 'running' ||
          sessionStatus?.current_job?.status === 'queued' ? (
          <ResearchCanvas
            session={activeSession}
            sessionStatus={sessionStatus}
            isStartingResearch={isStartingResearch}
            errorMessage={errorMessage}
            onStartResearch={() => handleStartResearch(false)}
            onRetryResearch={() => handleStartResearch(true)}
            onExploreIssues={handleNavigateToIssues}
            onReset={handleResetSession}
          />
        ) : (
          <OpportunitiesCanvas
            session={activeSession}
            sessionStatus={sessionStatus}
            isDemoMode={isDemoModeActive}
            onSelectOpportunity={handleSelectOpportunity}
            onProceedToRepositories={handleProceedToRepositories}
            onCheckExistingResearch={handleCheckExistingResearch}
            onReset={handleResetSession}
            errorMessage={errorMessage}
          />
        )
      ) : (
        <EntryCanvas onSessionCreated={handleSessionCreated} />
      )}
    </AppShell>
  );
};

export default App;
