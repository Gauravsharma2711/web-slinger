import {
  CreateSessionInput,
  SessionDocument,
  ResearchJobResponse,
  SessionStatusResponse,
  GetSessionIssuesResponse,
  ContextBriefResponse,
} from '@web-slinger/shared';

const API_BASE = 'http://localhost:8080/api';

export async function createSession(input: CreateSessionInput): Promise<SessionDocument> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    let message = 'Failed to create session';
    try {
      const err = await res.json();
      if (err.error) message = err.error;
    } catch {
      // Keep fallback
    }
    throw new Error(message);
  }

  return res.json();
}

export async function startResearch(
  sessionId: string,
  forceNew = false
): Promise<ResearchJobResponse> {
  const url = `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/research${
    forceNew ? '?forceNew=true' : ''
  }`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ forceNew }),
  });

  if (!res.ok) {
    let message = 'Failed to start research job';
    try {
      const err = await res.json();
      if (err.error) message = err.error;
    } catch {
      // Keep fallback
    }
    throw new Error(message);
  }

  return res.json();
}

export async function getSessionStatus(sessionId: string): Promise<SessionStatusResponse> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    let message = 'Failed to fetch session status';
    try {
      const err = await res.json();
      if (err.error) message = err.error;
    } catch {
      // Keep fallback
    }
    throw new Error(message);
  }

  return res.json();
}

export interface GetSessionIssuesError extends Error {
  status?: number;
  data?: GetSessionIssuesResponse;
}

export async function getSessionIssues(
  sessionId: string,
  options?: { owner?: string; repo?: string; forceRefresh?: boolean }
): Promise<GetSessionIssuesResponse> {
  const params = new URLSearchParams();
  if (options?.owner) params.set('owner', options.owner);
  if (options?.repo) params.set('repo', options.repo);
  if (options?.forceRefresh) params.set('forceRefresh', 'true');

  const queryString = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues${queryString}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  let responseData: (GetSessionIssuesResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Response not JSON
  }

  if (!res.ok) {
    const error: GetSessionIssuesError = new Error(
      responseData?.message || responseData?.error || `Failed to fetch issues (HTTP ${res.status})`
    );
    error.status = res.status;
    error.data = responseData || undefined;
    throw error;
  }

  return responseData as GetSessionIssuesResponse;
}

export interface ContextBriefApiError extends Error {
  status?: number;
  data?: ContextBriefResponse;
}

export async function generateContextBrief(
  sessionId: string,
  issueNumber: number,
  options?: { owner?: string; repo?: string }
): Promise<ContextBriefResponse> {
  const params = new URLSearchParams();
  if (options?.owner) params.set('owner', options.owner);
  if (options?.repo) params.set('repo', options.repo);
  const queryString = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues/${encodeURIComponent(
      issueNumber
    )}/context-brief${queryString}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  let responseData: (ContextBriefResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const error: ContextBriefApiError = new Error(
      responseData?.message || responseData?.error || `Failed to generate context brief (HTTP ${res.status})`
    );
    error.status = res.status;
    error.data = responseData || undefined;
    throw error;
  }

  return responseData as ContextBriefResponse;
}

export async function getContextBrief(
  sessionId: string,
  issueNumber: number
): Promise<ContextBriefResponse> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues/${encodeURIComponent(
      issueNumber
    )}/context-brief`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  let responseData: (ContextBriefResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const error: ContextBriefApiError = new Error(
      responseData?.message || responseData?.error || `Failed to load context brief (HTTP ${res.status})`
    );
    error.status = res.status;
    error.data = responseData || undefined;
    throw error;
  }

  return responseData as ContextBriefResponse;
}
