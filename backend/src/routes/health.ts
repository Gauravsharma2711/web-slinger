import { Router, Request, Response } from 'express';
import { HealthResponse } from '@web-slinger/shared';

export const healthRouter: Router = Router();

healthRouter.get('/health', (_req: Request, res: Response<HealthResponse>) => {
  res.status(200).json({ status: 'ok' });
});
