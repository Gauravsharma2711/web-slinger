import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config.js';
import { healthRouter } from './routes/health.js';
import { createSessionRouter } from './routes/session.js';
import { SessionRepository } from './repositories/sessionRepository.js';
import { JobRepository } from './repositories/jobRepository.js';
import { ResearchAdapter } from './services/researchAdapter.js';
import { GitHubIssuesClient } from './services/githubIssuesClient.js';
import { SourcePackBuilder } from './services/sourcePackBuilder.js';
import { ContextBriefService } from './services/contextBriefService.js';
import { WorkPlanService } from './services/workPlanService.js';
import { PatchDraftService } from './services/patchDraftService.js';
import { VerificationPlanService } from './services/verificationPlanService.js';

export function createApp(
  sessionRepository?: SessionRepository,
  jobRepository?: JobRepository,
  researchAdapter?: ResearchAdapter,
  gitHubIssuesClient?: GitHubIssuesClient,
  sourcePackBuilder?: SourcePackBuilder,
  contextBriefService?: ContextBriefService,
  workPlanService?: WorkPlanService,
  patchDraftService?: PatchDraftService,
  verificationPlanService?: VerificationPlanService
): express.Application {
  const app = express();

  // Strict CORS restricted to frontend origin (http://localhost:5173)
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        // Allow same-origin/non-browser requests without origin header
        if (!requestOrigin) {
          return callback(null, true);
        }
        if (requestOrigin === config.corsOrigin) {
          return callback(null, true);
        }
        // Disallow unauthorized origins
        return callback(null, false);
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  );

  app.use(express.json());

  // Health endpoint
  app.use(healthRouter);

  // Session routes
  app.use(
    '/api',
    createSessionRouter(
      sessionRepository,
      jobRepository,
      researchAdapter,
      gitHubIssuesClient,
      sourcePackBuilder,
      contextBriefService,
      workPlanService,
      patchDraftService,
      verificationPlanService
    )
  );

  // Safe Error Handler: never leak stack traces, env variables, or cloud credentials
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // Log message securely on server without sensitive metadata
    console.error(`[Server Error]: ${err.message}`);
    res.status(500).json({
      error: 'An internal server error occurred',
    });
  });

  return app;
}
