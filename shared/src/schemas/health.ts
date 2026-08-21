import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const HealthStateSchema = z.enum(['healthy', 'degraded', 'failed']);
export type HealthState = z.infer<typeof HealthStateSchema>;

export const CompactHealthRecordSchema = z.object({
  status: HealthStateSchema,
  message: z.string(),
  timestamp: z.string().datetime(),
});

export type CompactHealthRecord = z.infer<typeof CompactHealthRecordSchema>;
