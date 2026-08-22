import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import {
  CreateSessionInputSchema,
  SessionDocument,
  SessionStatusResponse,
  ResearchJobResponse,
  GetSessionIssuesResponse,
  ContextBriefResponse,
  WorkPlanResponse,
  PatchDraftResponse,
  VerificationPlanResponse,
  CreatePatchDraftInputSchema,
  UpdatePatchDraftInputSchema,
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
import {
  GitHubIssuesClient,
  createDefaultGitHubIssuesClient,
} from '../services/githubIssuesClient.js';
import {
  SourcePackBuilder,
  createDefaultSourcePackBuilder,
} from '../services/sourcePackBuilder.js';
import {
  ContextBriefService,
  createDefaultContextBriefService,
} from '../services/contextBriefService.js';
import {
  WorkPlanService,
  createDefaultWorkPlanService,
} from '../services/workPlanService.js';
import {
  PatchDraftService,
  createDefaultPatchDraftService,
} from '../services/patchDraftService.js';
import {
  VerificationPlanService,
  createDefaultVerificationPlanService,
} from '../services/verificationPlanService.js';

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
  researchAdapter: ResearchAdapter = createDefaultResearchAdapter(),
  gitHubIssuesClient: GitHubIssuesClient = createDefaultGitHubIssuesClient(),
  sourcePackBuilder: SourcePackBuilder = createDefaultSourcePackBuilder(),
  contextBriefService: ContextBriefService = createDefaultContextBriefService(),
  workPlanService: WorkPlanService = createDefaultWorkPlanService(),
  patchDraftService: PatchDraftService = createDefaultPatchDraftService(),
  verificationPlanService: VerificationPlanService = createDefaultVerificationPlanService()
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
          discovered_issues: session.discovered_issues,
          health: session.health,
        };

        res.status(200).json(statusResponse);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/sessions/:sessionId/issues
  router.get(
    '/sessions/:sessionId/issues',
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

        // Verify 24-hour session TTL
        const expiresTime = new Date(session.expires_at).getTime();
        const nowTime = Date.now();
        if (expiresTime <= nowTime) {
          res.status(404).json({ error: 'Session has expired' });
          return;
        }

        const owner =
          (typeof req.query.owner === 'string' && req.query.owner.trim()) ||
          gitHubIssuesClient.config.owner;
        const repo =
          (typeof req.query.repo === 'string' && req.query.repo.trim()) ||
          gitHubIssuesClient.config.repo;
        const forceRefresh = req.query.forceRefresh === 'true';

        // Return stored fresh data when available rather than repeatedly calling GitHub
        if (!forceRefresh && session.discovered_issues !== undefined) {
          const cachedResponse: GetSessionIssuesResponse = {
            session_id: session.session_id,
            owner: owner || 'cached',
            repo: repo || 'cached',
            status: 'cached',
            message: `Loaded ${session.discovered_issues.length} cached issues for session.`,
            issues: session.discovered_issues,
            total_count: session.discovered_issues.length,
            cached: true,
            is_fixture: session.discovered_issues.some((i) => i.is_fixture),
          };
          res.status(200).json(cachedResponse);
          return;
        }

        // Fetch live or fixture issues via dedicated client
        const result = await gitHubIssuesClient.fetchIssues(owner, repo);

        // Map GitHub errors honestly
        if (result.status === 'rate_limited') {
          res.status(403).json({
            error: result.message,
            session_id: session.session_id,
            owner: result.owner,
            repo: result.repo,
            status: 'rate_limited',
            message: result.message,
            issues: [],
            total_count: 0,
            cached: false,
            rate_limit_remaining: result.rateLimitRemaining,
            rate_limit_reset: result.rateLimitReset,
            is_fixture: false,
          });
          return;
        }

        if (result.status === 'not_found') {
          res.status(404).json({
            error: result.message,
            session_id: session.session_id,
            owner: result.owner,
            repo: result.repo,
            status: 'not_found',
            message: result.message,
            issues: [],
            total_count: 0,
            cached: false,
            rate_limit_remaining: result.rateLimitRemaining,
            rate_limit_reset: result.rateLimitReset,
            is_fixture: false,
          });
          return;
        }

        if (result.status === 'degraded' || result.status === 'failed') {
          res.status(502).json({
            error: result.message,
            session_id: session.session_id,
            owner: result.owner,
            repo: result.repo,
            status: result.status,
            message: result.message,
            issues: [],
            total_count: 0,
            cached: false,
            rate_limit_remaining: result.rateLimitRemaining,
            rate_limit_reset: result.rateLimitReset,
            is_fixture: false,
          });
          return;
        }

        // Persist successful discovered issues to Firestore / repository
        const updatedSession: SessionDocument = {
          ...session,
          discovered_issues: result.issues,
          updated_at: new Date().toISOString(),
        };
        await sessionRepository.createSession(updatedSession);

        const response: GetSessionIssuesResponse = {
          session_id: session.session_id,
          owner: result.owner,
          repo: result.repo,
          status: result.status,
          message: result.message,
          issues: result.issues,
          total_count: result.totalCount,
          cached: false,
          rate_limit_remaining: result.rateLimitRemaining,
          rate_limit_reset: result.rateLimitReset,
          is_fixture: result.isFixture,
        };

        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/sessions/:sessionId/issues/:issueNumber/context-brief
  router.post(
    '/sessions/:sessionId/issues/:issueNumber/context-brief',
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

        // 24h TTL check
        const expiresTime = new Date(session.expires_at).getTime();
        if (expiresTime <= Date.now()) {
          res.status(404).json({ error: 'Session has expired' });
          return;
        }

        const rawIssueNumber = Array.isArray(req.params.issueNumber)
          ? req.params.issueNumber[0]
          : req.params.issueNumber;
        const issueNumber = parseInt(rawIssueNumber, 10);

        if (isNaN(issueNumber) || issueNumber <= 0) {
          res.status(400).json({ error: 'Invalid issue number' });
          return;
        }

        // Selected-issue authorization: Reject unless issue is part of stored candidate issues
        const candidateIssues = session.discovered_issues || [];
        const selectedIssue = candidateIssues.find((i) => i.number === issueNumber);

        if (!selectedIssue) {
          res.status(404).json({
            error: `Issue #${issueNumber} is not a candidate issue in this session. Only session-discovered issues can be analyzed.`,
          });
          return;
        }

        const owner =
          (typeof req.query.owner === 'string' && req.query.owner.trim()) ||
          gitHubIssuesClient.config.owner;
        const repo =
          (typeof req.query.repo === 'string' && req.query.repo.trim()) ||
          gitHubIssuesClient.config.repo;

        // Build bounded source pack
        const sourcePack = await sourcePackBuilder.buildSourcePack(
          selectedIssue,
          owner,
          repo
        );

        // Generate and persist source-grounded brief
        const briefDoc = await contextBriefService.generateAndPersistBrief(
          sessionId,
          sourcePack
        );

        const response: ContextBriefResponse = {
          session_id: briefDoc.session_id,
          issue_number: briefDoc.issue_number,
          status: briefDoc.status,
          brief: briefDoc.brief,
          sources: briefDoc.sources,
          model_id: briefDoc.model_id,
          generated_at: briefDoc.generated_at,
          validation_errors: briefDoc.validation_errors,
          is_fixture: briefDoc.is_fixture,
        };

        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/sessions/:sessionId/issues/:issueNumber/context-brief
  router.get(
    '/sessions/:sessionId/issues/:issueNumber/context-brief',
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

        // 24h TTL check
        const expiresTime = new Date(session.expires_at).getTime();
        if (expiresTime <= Date.now()) {
          res.status(404).json({ error: 'Session has expired' });
          return;
        }

        const rawIssueNumber = Array.isArray(req.params.issueNumber)
          ? req.params.issueNumber[0]
          : req.params.issueNumber;
        const issueNumber = parseInt(rawIssueNumber, 10);

        if (isNaN(issueNumber) || issueNumber <= 0) {
          res.status(400).json({ error: 'Invalid issue number' });
          return;
        }

        // Selected-issue authorization: Reject unless issue is part of stored candidate issues
        const candidateIssues = session.discovered_issues || [];
        const selectedIssue = candidateIssues.find((i) => i.number === issueNumber);

        if (!selectedIssue) {
          res.status(404).json({
            error: `Issue #${issueNumber} is not a candidate issue in this session.`,
          });
          return;
        }

        const briefDoc = await contextBriefService.getBrief(sessionId, issueNumber);
        if (!briefDoc) {
          res.status(404).json({
            error: `Context brief for issue #${issueNumber} has not been generated yet.`,
          });
          return;
        }

        const response: ContextBriefResponse = {
          session_id: briefDoc.session_id,
          issue_number: briefDoc.issue_number,
          status: briefDoc.status,
          brief: briefDoc.brief,
          sources: briefDoc.sources,
          model_id: briefDoc.model_id,
          generated_at: briefDoc.generated_at,
          validation_errors: briefDoc.validation_errors,
          is_fixture: briefDoc.is_fixture,
        };

        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/sessions/:sessionId/issues/:issueNumber/work-plan
  router.post(
    '/sessions/:sessionId/issues/:issueNumber/work-plan',
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

        // 24h TTL check
        const expiresTime = new Date(session.expires_at).getTime();
        if (expiresTime <= Date.now()) {
          res.status(404).json({ error: 'Session has expired' });
          return;
        }

        const rawIssueNumber = Array.isArray(req.params.issueNumber)
          ? req.params.issueNumber[0]
          : req.params.issueNumber;
        const issueNumber = parseInt(rawIssueNumber, 10);

        if (isNaN(issueNumber) || issueNumber <= 0) {
          res.status(400).json({ error: 'Invalid issue number' });
          return;
        }

        // Selected-issue authorization: Reject unless issue is part of stored candidate issues
        const candidateIssues = session.discovered_issues || [];
        const selectedIssue = candidateIssues.find((i) => i.number === issueNumber);

        if (!selectedIssue) {
          res.status(404).json({
            error: `Issue #${issueNumber} is not a candidate issue in this session. Only session-discovered issues can be analyzed.`,
          });
          return;
        }

        const owner =
          (typeof req.query.owner === 'string' && req.query.owner.trim()) ||
          gitHubIssuesClient.config.owner;
        const repo =
          (typeof req.query.repo === 'string' && req.query.repo.trim()) ||
          gitHubIssuesClient.config.repo;
        const ref =
          (typeof req.query.ref === 'string' && req.query.ref.trim()) || 'main';

        // Retrieve existing context brief if previously generated
        const contextBriefDoc = await contextBriefService.getBrief(sessionId, issueNumber);

        // Generate and persist evidence-grounded work plan
        const planDoc = await workPlanService.generateWorkPlan(
          sessionId,
          selectedIssue,
          owner,
          repo,
          contextBriefDoc,
          ref
        );

        const response: WorkPlanResponse = {
          session_id: planDoc.session_id,
          issue_number: planDoc.issue_number,
          status: planDoc.status,
          plan: planDoc.plan,
          file_evidence: planDoc.file_evidence,
          model_id: planDoc.model_id,
          generated_at: planDoc.generated_at,
          validation_errors: planDoc.validation_errors,
          is_fixture: planDoc.is_fixture,
        };

        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/sessions/:sessionId/issues/:issueNumber/work-plan
  router.get(
    '/sessions/:sessionId/issues/:issueNumber/work-plan',
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

        // 24h TTL check
        const expiresTime = new Date(session.expires_at).getTime();
        if (expiresTime <= Date.now()) {
          res.status(404).json({ error: 'Session has expired' });
          return;
        }

        const rawIssueNumber = Array.isArray(req.params.issueNumber)
          ? req.params.issueNumber[0]
          : req.params.issueNumber;
        const issueNumber = parseInt(rawIssueNumber, 10);

        if (isNaN(issueNumber) || issueNumber <= 0) {
          res.status(400).json({ error: 'Invalid issue number' });
          return;
        }

        // Selected-issue authorization: Reject unless issue is part of stored candidate issues
        const candidateIssues = session.discovered_issues || [];
        const selectedIssue = candidateIssues.find((i) => i.number === issueNumber);

        if (!selectedIssue) {
          res.status(404).json({
            error: `Issue #${issueNumber} is not a candidate issue in this session.`,
          });
          return;
        }

        const planDoc = await workPlanService.getWorkPlan(sessionId, issueNumber);
        if (!planDoc) {
          res.status(404).json({
            error: `Contribution work plan for issue #${issueNumber} has not been generated yet.`,
          });
          return;
        }

        const response: WorkPlanResponse = {
          session_id: planDoc.session_id,
          issue_number: planDoc.issue_number,
          status: planDoc.status,
          plan: planDoc.plan,
          file_evidence: planDoc.file_evidence,
          model_id: planDoc.model_id,
          generated_at: planDoc.generated_at,
          validation_errors: planDoc.validation_errors,
          is_fixture: planDoc.is_fixture,
        };

        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/sessions/:sessionId/issues/:issueNumber/patch-draft
  router.post(
    '/sessions/:sessionId/issues/:issueNumber/patch-draft',
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

        // 24h TTL check
        const expiresTime = new Date(session.expires_at).getTime();
        if (expiresTime <= Date.now()) {
          res.status(404).json({ error: 'Session has expired' });
          return;
        }

        const rawIssueNumber = Array.isArray(req.params.issueNumber)
          ? req.params.issueNumber[0]
          : req.params.issueNumber;
        const issueNumber = parseInt(rawIssueNumber, 10);

        if (isNaN(issueNumber) || issueNumber <= 0) {
          res.status(400).json({ error: 'Invalid issue number' });
          return;
        }

        // Selected-issue authorization
        const candidateIssues = session.discovered_issues || [];
        const selectedIssue = candidateIssues.find((i) => i.number === issueNumber);

        if (!selectedIssue) {
          res.status(404).json({
            error: `Issue #${issueNumber} is not a candidate issue in this session.`,
          });
          return;
        }

        // Validate user input with CreatePatchDraftInputSchema (must have non-empty reviewedSources and userAffirmation === true)
        const parseResult = CreatePatchDraftInputSchema.safeParse(req.body);
        if (!parseResult.success) {
          res.status(409).json({
            error: 'User source review and affirmative agreement are required before patch drafting.',
            details: parseResult.error.format(),
          });
          return;
        }

        const { reviewedSources, userAffirmation } = parseResult.data;

        // Retrieve existing work plan to check file evidence
        const workPlanDoc = await workPlanService.getWorkPlan(sessionId, issueNumber);
        const sessionFileEvidence = workPlanDoc?.file_evidence || [];

        // Verify reviewed sources against session evidence
        const verification = patchDraftService.verifyReviewedSources(
          reviewedSources,
          sessionFileEvidence
        );

        if (!verification.valid) {
          res.status(409).json({
            error: verification.error || 'Reviewed sources mismatch with session file evidence.',
          });
          return;
        }

        // Generate and persist patch draft
        const draftDoc = await patchDraftService.generatePatchDraft(
          sessionId,
          selectedIssue,
          reviewedSources,
          userAffirmation,
          workPlanDoc,
          sessionFileEvidence
        );

        const response: PatchDraftResponse = {
          patch_id: draftDoc.patch_id,
          session_id: draftDoc.session_id,
          issue_number: draftDoc.issue_number,
          status: draftDoc.status,
          diff_content: draftDoc.diff_content,
          user_affirmation: draftDoc.user_affirmation,
          reviewed_at: draftDoc.reviewed_at,
          reviewed_sources: draftDoc.reviewed_sources,
          changed_files: draftDoc.changed_files,
          total_changed_lines: draftDoc.total_changed_lines,
          model_id: draftDoc.model_id,
          generated_at: draftDoc.generated_at,
          validation_errors: draftDoc.validation_errors,
          warnings: draftDoc.warnings,
          is_user_edited: draftDoc.is_user_edited,
          is_fixture: draftDoc.is_fixture,
        };

        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/sessions/:sessionId/issues/:issueNumber/patch-draft/:patchId
  router.get(
    '/sessions/:sessionId/issues/:issueNumber/patch-draft/:patchId',
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

        // 24h TTL check
        const expiresTime = new Date(session.expires_at).getTime();
        if (expiresTime <= Date.now()) {
          res.status(404).json({ error: 'Session has expired' });
          return;
        }

        const rawIssueNumber = Array.isArray(req.params.issueNumber)
          ? req.params.issueNumber[0]
          : req.params.issueNumber;
        const issueNumber = parseInt(rawIssueNumber, 10);

        if (isNaN(issueNumber) || issueNumber <= 0) {
          res.status(400).json({ error: 'Invalid issue number' });
          return;
        }

        const rawPatchId = Array.isArray(req.params.patchId)
          ? req.params.patchId[0]
          : req.params.patchId;
        const patchId = String(rawPatchId);

        if (!patchId) {
          res.status(400).json({ error: 'Patch ID is required' });
          return;
        }

        const draftDoc = await patchDraftService.getPatchDraft(sessionId, patchId);
        if (!draftDoc) {
          res.status(404).json({
            error: `Patch draft "${patchId}" was not found in this session.`,
          });
          return;
        }

        const response: PatchDraftResponse = {
          patch_id: draftDoc.patch_id,
          session_id: draftDoc.session_id,
          issue_number: draftDoc.issue_number,
          status: draftDoc.status,
          diff_content: draftDoc.diff_content,
          user_affirmation: draftDoc.user_affirmation,
          reviewed_at: draftDoc.reviewed_at,
          reviewed_sources: draftDoc.reviewed_sources,
          changed_files: draftDoc.changed_files,
          total_changed_lines: draftDoc.total_changed_lines,
          model_id: draftDoc.model_id,
          generated_at: draftDoc.generated_at,
          validation_errors: draftDoc.validation_errors,
          warnings: draftDoc.warnings,
          is_user_edited: draftDoc.is_user_edited,
          is_fixture: draftDoc.is_fixture,
        };

        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // PUT /api/sessions/:sessionId/issues/:issueNumber/patch-draft/:patchId
  router.put(
    '/sessions/:sessionId/issues/:issueNumber/patch-draft/:patchId',
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

        // 24h TTL check
        const expiresTime = new Date(session.expires_at).getTime();
        if (expiresTime <= Date.now()) {
          res.status(404).json({ error: 'Session has expired' });
          return;
        }

        const rawIssueNumber = Array.isArray(req.params.issueNumber)
          ? req.params.issueNumber[0]
          : req.params.issueNumber;
        const issueNumber = parseInt(rawIssueNumber, 10);

        if (isNaN(issueNumber) || issueNumber <= 0) {
          res.status(400).json({ error: 'Invalid issue number' });
          return;
        }

        const rawPatchId = Array.isArray(req.params.patchId)
          ? req.params.patchId[0]
          : req.params.patchId;
        const patchId = String(rawPatchId);

        if (!patchId) {
          res.status(400).json({ error: 'Patch ID is required' });
          return;
        }

        const parseResult = UpdatePatchDraftInputSchema.safeParse(req.body);
        if (!parseResult.success) {
          res.status(400).json({
            error: 'Invalid patch draft update payload',
            details: parseResult.error.format(),
          });
          return;
        }

        const { diffContent } = parseResult.data;

        const updatedDoc = await patchDraftService.updateUserEditedPatchDraft(
          sessionId,
          patchId,
          diffContent
        );

        if (!updatedDoc) {
          res.status(404).json({
            error: `Patch draft "${patchId}" was not found to update.`,
          });
          return;
        }

        const response: PatchDraftResponse = {
          patch_id: updatedDoc.patch_id,
          session_id: updatedDoc.session_id,
          issue_number: updatedDoc.issue_number,
          status: updatedDoc.status,
          diff_content: updatedDoc.diff_content,
          user_affirmation: updatedDoc.user_affirmation,
          reviewed_at: updatedDoc.reviewed_at,
          reviewed_sources: updatedDoc.reviewed_sources,
          changed_files: updatedDoc.changed_files,
          total_changed_lines: updatedDoc.total_changed_lines,
          model_id: updatedDoc.model_id,
          generated_at: updatedDoc.generated_at,
          validation_errors: updatedDoc.validation_errors,
          warnings: updatedDoc.warnings,
          is_user_edited: updatedDoc.is_user_edited,
          is_fixture: updatedDoc.is_fixture,
        };

        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/sessions/:sessionId/issues/:issueNumber/verification-plan
  router.post(
    '/sessions/:sessionId/issues/:issueNumber/verification-plan',
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

        // 24h TTL check
        const expiresTime = new Date(session.expires_at).getTime();
        if (expiresTime <= Date.now()) {
          res.status(404).json({ error: 'Session has expired' });
          return;
        }

        const rawIssueNumber = Array.isArray(req.params.issueNumber)
          ? req.params.issueNumber[0]
          : req.params.issueNumber;
        const issueNumber = parseInt(rawIssueNumber, 10);

        if (isNaN(issueNumber) || issueNumber <= 0) {
          res.status(400).json({ error: 'Invalid issue number' });
          return;
        }

        // Selected-issue authorization
        const candidateIssues = session.discovered_issues || [];
        const selectedIssue = candidateIssues.find((i) => i.number === issueNumber);

        if (!selectedIssue) {
          res.status(404).json({
            error: `Issue #${issueNumber} is not a candidate issue in this session.`,
          });
          return;
        }

        const workPlanDoc = await workPlanService.getWorkPlan(sessionId, issueNumber);

        const vPlanDoc = await verificationPlanService.generateVerificationPlan(
          sessionId,
          selectedIssue,
          workPlanDoc
        );

        const response: VerificationPlanResponse = {
          session_id: vPlanDoc.session_id,
          issue_number: vPlanDoc.issue_number,
          plan: vPlanDoc.plan,
          model_id: vPlanDoc.model_id,
          generated_at: vPlanDoc.generated_at,
          is_fixture: vPlanDoc.is_fixture,
        };

        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
