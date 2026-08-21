import {
  CreateSessionInput,
  SessionDocument,
  ResearchJobResponse,
  SessionStatusResponse,
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
