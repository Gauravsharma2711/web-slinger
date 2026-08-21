import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import {
  CreateSessionInputSchema,
  SessionDocument,
  SessionStatusResponse,
  ResearchJobResponse,
} from '@web-slinger/shared';
import {
  SessionRepository,
  createDefaultSessionRepository,
  normalizeGoal,
} from '../repositories/sessionRepository.js';
import {
  JobRepository,
  JobRecord,
  createDefaultJobRepository,
} from '../repositories/jobRepository.js';
import {
  ResearchAdapter,
  createDefaultResearchAdapter,
} from '../services/researchAdapter.js';

// Bounded runner timeout suitable for real Scraper Studio collections (5+ minutes)
const RESEARCH_RUNNER_TIMEOUT_MS = 320000;

async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMsg: string
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMsg)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

export function createSessionRouter(
  sessionRepository: SessionRepository = createDefaultSessionRepository(),
  jobRepository: JobRepository = createDefaultJobRepository(),
  researchAdapter: ResearchAdapter = createDefaultResearchAdapter()
): Router {
  const router = Router();

  // POST /api/sessions
  router.post('/sessions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parseResult = CreateSessionInputSchema.safeParse(req.body);

      if (!parseResult.success) {
        res.status(400).json({
          error: 'Invalid session input',
          details: parseResult.error.format(),
        });
        return;
      }

      const { stack, goal } = parseResult.data;
      const normalized_stack = stack.map((s) => s.trim().toLowerCase());
      const normalized_goal = normalizeGoal(goal);

      const session_id = randomUUID();
      const created_at = new Date().toISOString();
      const updated_at = created_at;
      const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const sessionDoc: SessionDocument = {
        session_id,
        stack,
        normalized_stack,
        goal: normalized_goal,
        stage: 'created',
        created_at,
        updated_at,
        expires_at,
      };

      await sessionRepository.createSession(sessionDoc);

      res.status(201).json(sessionDoc);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/sessions/:sessionId/research
  router.post(
    '/sessions/:sessionId/research',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionIdParam = req.params.sessionId;
        const sessionId = Array.isArray(sessionIdParam) ? sessionIdParam[0] : sessionIdParam;

        if (!sessionId) {
          res.status(400).json({ error: 'Session ID is required' });
          return;
        }

        const session = await sessionRepository.getSession(sessionId);
        if (!session) {
          res.status(404).json({ error: 'Session not found' });
          return;
        }

        const now = Date.now();
        const expiresTime = new Date(session.expires_at).getTime();
        if (expiresTime <= now) {
          res.status(404).json({ error: 'Session has expired' });
          return;
        }

        const forceNew = req.query.forceNew === 'true' || req.body?.forceNew === true;
        const existingSnapshotId = !forceNew ? session.snapshot_id ?? null : null;

        const jobId = randomUUID();
        const nowIso = new Date().toISOString();

        // Create job in 'queued' status
        const initialJob: JobRecord = {
          job_id: jobId,
          session_id: sessionId,
          type: 'research',
          status: 'queued',
          stage_message: existingSnapshotId
            ? 'Resuming live opportunity collection...'
            : 'Research job queued',
          results: [],
          snapshot_id: existingSnapshotId,
          created_at: nowIso,
          updated_at: nowIso,
        };

        await jobRepository.createJob(initialJob);

        // Update session stage to 'researching'
        const updatedSession: SessionDocument = {
          ...session,
          stage: 'researching',
          current_job_id: jobId,
          updated_at: nowIso,
        };
        await sessionRepository.createSession(updatedSession);

        // Run background async task with bounded timeout and safe error capture
        (async () => {
          try {
            // Transition to running with calm truthful message
            const runningMessage = 'Collecting live public job listings. This can take a few minutes.';
            await jobRepository.updateJob(jobId, {
              status: 'running',
              stage_message: runningMessage,
            });

            // Execute research adapter with timeout
            const adapterResult = await executeWithTimeout(
              researchAdapter.executeResearch(
                sessionId,
                session.stack,
                session.goal,
                existingSnapshotId,
                async (newSnapshotId) => {
                  // Immediately persist snapshot ID hook
                  await jobRepository.updateJob(jobId, { snapshot_id: newSnapshotId });
                  const curr = await sessionRepository.getSession(sessionId);
                  if (curr) {
                    await sessionRepository.createSession({
                      ...curr,
                      snapshot_id: newSnapshotId,
                      updated_at: new Date().toISOString(),
                    });
                  }
                }
              ),
              RESEARCH_RUNNER_TIMEOUT_MS,
              'Research collection timed out after 5 minutes'
            );

            // Update job with completed / degraded / failed result
            await jobRepository.updateJob(jobId, {
              status: adapterResult.status,
              stage_message: adapterResult.message,
              results: adapterResult.results,
              snapshot_id: adapterResult.snapshotId ?? existingSnapshotId,
            });

            // Update session with results, health, and snapshot
            const latestSession = await sessionRepository.getSession(sessionId);
            if (latestSession) {
              await sessionRepository.createSession({
                ...latestSession,
                stage: adapterResult.status === 'completed' ? 'researching' : latestSession.stage,
                snapshot_id: adapterResult.snapshotId ?? latestSession.snapshot_id ?? null,
                research_results: adapterResult.results,
                health: adapterResult.health,
                updated_at: new Date().toISOString(),
              });
            }
          } catch (err: unknown) {
            const errorMessage =
              err instanceof Error ? err.message : 'Research job failed';
            const failTime = new Date().toISOString();
            console.warn(`[Research Runner] Job ${jobId} ended in degraded state: ${errorMessage}`);

            // Always transition job to a terminal status (never leave running indefinitely)
            await jobRepository.updateJob(jobId, {
              status: 'degraded',
              stage_message: `Public source research notice: ${errorMessage}`,
              error: errorMessage,
            });

            const latestSession = await sessionRepository.getSession(sessionId);
            if (latestSession) {
              await sessionRepository.createSession({
                ...latestSession,
                health: {
                  status: 'degraded',
                  message: `Public source research notice: ${errorMessage}`,
                  timestamp: failTime,
                },
                updated_at: failTime,
              });
            }
          }
        })().catch((unhandledErr) => {
          console.error('[Research Runner] Critical error in background runner:', unhandledErr);
        });

        // Immediately return 202 Accepted with queued job status & session stage
        const response: ResearchJobResponse = {
          job_id: jobId,
          status: 'queued',
          stage: 'researching',
          message: existingSnapshotId
            ? 'Resuming live opportunity collection...'
            : 'Research job queued',
          snapshot_id: existingSnapshotId,
        };

        res.status(202).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/sessions/:sessionId/status
  router.get(
    '/sessions/:sessionId/status',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionIdParam = req.params.sessionId;
        const sessionId = Array.isArray(sessionIdParam) ? sessionIdParam[0] : sessionIdParam;

        if (!sessionId) {
          res.status(400).json({ error: 'Session ID is required' });
          return;
        }

        const session = await sessionRepository.getSession(sessionId);

        if (!session) {
          res.status(404).json({ error: 'Session not found' });
          return;
        }

        const expiresTime = new Date(session.expires_at).getTime();
        const nowTime = Date.now();
        const ttl_seconds_remaining = Math.max(0, Math.floor((expiresTime - nowTime) / 1000));
        const is_expired = ttl_seconds_remaining === 0;

        if (is_expired) {
          res.status(404).json({ error: 'Session has expired' });
          return;
        }

        // Fetch latest job if present (direct ID lookup if current_job_id exists, else latest query)
        let latestJob: JobRecord | null = null;
        if (session.current_job_id) {
          latestJob = await jobRepository.getJob(session.current_job_id);
        }
        if (!latestJob) {
          latestJob = await jobRepository.getLatestJobForSession(sessionId);
        }

        const currentSnapshotId = session.snapshot_id || latestJob?.snapshot_id || null;

        const statusResponse: SessionStatusResponse = {
          session_id: session.session_id,
          stage: session.stage,
          stack: session.stack,
          normalized_stack: session.normalized_stack,
          goal: session.goal,
          created_at: session.created_at,
          updated_at: session.updated_at,
          expires_at: session.expires_at,
          ttl_seconds_remaining,
          is_expired,
          current_job: latestJob
            ? {
                job_id: latestJob.job_id,
                type: latestJob.type,
                status: latestJob.status,
                message:
                  latestJob.status === 'running'
                    ? 'Collecting live public job listings. This can take a few minutes.'
                    : latestJob.stage_message,
                is_fixture: latestJob.results.some((r) => r.is_fixture),
                snapshot_id: currentSnapshotId,
              }
            : undefined,
          snapshot_id: currentSnapshotId,
          message: latestJob
            ? latestJob.status === 'running'
              ? 'Collecting live public job listings. This can take a few minutes.'
              : latestJob.stage_message
            : 'Session ready',
          research_results:
            latestJob && (latestJob.status === 'completed' || latestJob.status === 'degraded')
              ? latestJob.results
              : undefined,
          health: session.health,
        };

        res.status(200).json(statusResponse);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
