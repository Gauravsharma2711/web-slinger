import { z } from 'zod';

export const StackInputSchema = z.object({
  raw_input: z.string().trim().optional(),
  selected_chips: z.array(z.string().trim()).default([]),
});

export type StackInput = z.infer<typeof StackInputSchema>;

export const StackProfileSchema = z.object({
  technologies: z.array(z.string()).min(1),
  search_signals: z.array(z.string()).default([]),
});

export type StackProfile = z.infer<typeof StackProfileSchema>;
