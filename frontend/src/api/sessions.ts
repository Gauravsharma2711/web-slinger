import {
  CreateSessionInput,
  SessionDocument,
  ResearchJobResponse,
  SessionStatusResponse,
  GetSessionIssuesResponse,
  ContextBriefResponse,
  WorkPlanResponse,
  PatchDraftResponse,
  VerificationPlanResponse,
  CreatePatchDraftInput,
  VerificationRecord,
  VerificationRecordsResponse,
  CreateProofReceiptInput,
  ProofReceiptResponse,
  FinalReadinessResponse,
} from '@web-slinger/shared';

const API_BASE =
  (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE || '/api';

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

export async function selectOpportunity(
  sessionId: string,
  input: { companyId?: string; company_id?: string; jobId?: string; job_id?: string; job?: Record<string, unknown> }
): Promise<{
  session_id: string;
  stage: string;
  selected_company_id?: string;
  selected_job_id?: string;
  message: string;
}> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/select-opportunity`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  if (!res.ok) {
    let message = 'Failed to select opportunity';
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

export interface WorkPlanApiError extends Error {
  status?: number;
  data?: WorkPlanResponse;
}

export async function generateWorkPlan(
  sessionId: string,
  issueNumber: number,
  options?: { owner?: string; repo?: string; ref?: string }
): Promise<WorkPlanResponse> {
  const params = new URLSearchParams();
  if (options?.owner) params.set('owner', options.owner);
  if (options?.repo) params.set('repo', options.repo);
  if (options?.ref) params.set('ref', options.ref);
  const queryString = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues/${encodeURIComponent(
      issueNumber
    )}/work-plan${queryString}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  let responseData: (WorkPlanResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const error: WorkPlanApiError = new Error(
      responseData?.error || `Failed to generate work plan (HTTP ${res.status})`
    );
    error.status = res.status;
    error.data = responseData || undefined;
    throw error;
  }

  return responseData as WorkPlanResponse;
}

export async function getWorkPlan(
  sessionId: string,
  issueNumber: number
): Promise<WorkPlanResponse> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues/${encodeURIComponent(
      issueNumber
    )}/work-plan`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  let responseData: (WorkPlanResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const error: WorkPlanApiError = new Error(
      responseData?.error || `Failed to load work plan (HTTP ${res.status})`
    );
    error.status = res.status;
    error.data = responseData || undefined;
    throw error;
  }

  return responseData as WorkPlanResponse;
}

export interface PatchDraftApiError extends Error {
  status?: number;
  data?: PatchDraftResponse;
}

export async function generatePatchDraft(
  sessionId: string,
  issueNumber: number,
  input: CreatePatchDraftInput
): Promise<PatchDraftResponse> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues/${encodeURIComponent(
      issueNumber
    )}/patch-draft`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  let responseData: (PatchDraftResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const error: PatchDraftApiError = new Error(
      responseData?.error || `Failed to generate patch draft (HTTP ${res.status})`
    );
    error.status = res.status;
    error.data = responseData || undefined;
    throw error;
  }

  return responseData as PatchDraftResponse;
}

export async function getPatchDraft(
  sessionId: string,
  issueNumber: number,
  patchId: string
): Promise<PatchDraftResponse> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues/${encodeURIComponent(
      issueNumber
    )}/patch-draft/${encodeURIComponent(patchId)}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  let responseData: (PatchDraftResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const error: PatchDraftApiError = new Error(
      responseData?.error || `Failed to load patch draft (HTTP ${res.status})`
    );
    error.status = res.status;
    error.data = responseData || undefined;
    throw error;
  }

  return responseData as PatchDraftResponse;
}

export async function updatePatchDraft(
  sessionId: string,
  issueNumber: number,
  patchId: string,
  diffContent: string
): Promise<PatchDraftResponse> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues/${encodeURIComponent(
      issueNumber
    )}/patch-draft/${encodeURIComponent(patchId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ diffContent }),
    }
  );

  let responseData: (PatchDraftResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const error: PatchDraftApiError = new Error(
      responseData?.error || `Failed to update patch draft (HTTP ${res.status})`
    );
    error.status = res.status;
    error.data = responseData || undefined;
    throw error;
  }

  return responseData as PatchDraftResponse;
}

export interface VerificationPlanApiError extends Error {
  status?: number;
  data?: VerificationPlanResponse;
}

export async function generateVerificationPlan(
  sessionId: string,
  issueNumber: number
): Promise<VerificationPlanResponse> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues/${encodeURIComponent(
      issueNumber
    )}/verification-plan`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  let responseData: (VerificationPlanResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const error: VerificationPlanApiError = new Error(
      responseData?.error || `Failed to generate verification plan (HTTP ${res.status})`
    );
    error.status = res.status;
    error.data = responseData || undefined;
    throw error;
  }

  return responseData as VerificationPlanResponse;
}

export interface VerificationRecordsApiError extends Error {
  status?: number;
  data?: VerificationRecordsResponse;
}

export async function getVerificationRecords(
  sessionId: string,
  issueNumber: number
): Promise<VerificationRecordsResponse> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues/${encodeURIComponent(
      issueNumber
    )}/verification-records`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  let responseData: (VerificationRecordsResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const error: VerificationRecordsApiError = new Error(
      responseData?.error || `Failed to fetch verification records (HTTP ${res.status})`
    );
    error.status = res.status;
    error.data = responseData || undefined;
    throw error;
  }

  return responseData as VerificationRecordsResponse;
}

export async function saveVerificationRecords(
  sessionId: string,
  issueNumber: number,
  records: VerificationRecord[]
): Promise<VerificationRecordsResponse> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues/${encodeURIComponent(
      issueNumber
    )}/verification-records`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records }),
    }
  );

  let responseData: (VerificationRecordsResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const error: VerificationRecordsApiError = new Error(
      responseData?.error || `Failed to save verification records (HTTP ${res.status})`
    );
    error.status = res.status;
    error.data = responseData || undefined;
    throw error;
  }

  return responseData as VerificationRecordsResponse;
}

export interface ProofReceiptApiError extends Error {
  status?: number;
  data?: ProofReceiptResponse;
}

export async function createProofReceipt(
  sessionId: string,
  issueNumber: number,
  input: CreateProofReceiptInput
): Promise<ProofReceiptResponse> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues/${encodeURIComponent(
      issueNumber
    )}/proof-receipt`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  let responseData: (ProofReceiptResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const error: ProofReceiptApiError = new Error(
      responseData?.error || `Failed to generate Proof Receipt (HTTP ${res.status})`
    );
    error.status = res.status;
    error.data = responseData || undefined;
    throw error;
  }

  return responseData as ProofReceiptResponse;
}

export async function getProofReceipt(
  sessionId: string,
  issueNumber: number
): Promise<ProofReceiptResponse> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues/${encodeURIComponent(
      issueNumber
    )}/proof-receipt`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  let responseData: (ProofReceiptResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const error: ProofReceiptApiError = new Error(
      responseData?.error || `Failed to retrieve Proof Receipt (HTTP ${res.status})`
    );
    error.status = res.status;
    error.data = responseData || undefined;
    throw error;
  }

  return responseData as ProofReceiptResponse;
}

export async function getFinalReadiness(
  sessionId: string,
  issueNumber: number
): Promise<FinalReadinessResponse> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/issues/${encodeURIComponent(
      issueNumber
    )}/readiness`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  let responseData: (FinalReadinessResponse & { error?: string }) | null = null;
  try {
    responseData = await res.json();
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const message =
      responseData?.error ||
      `Failed to retrieve final readiness (HTTP ${res.status})`;
    throw new Error(message);
  }

  return responseData as FinalReadinessResponse;
}


