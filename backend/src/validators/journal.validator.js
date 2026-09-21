import { z } from 'zod';

export const createJournalSchema = z.object({
  title: z.string().max(255, 'Title must not exceed 255 characters').optional(),
  content: z.string({ required_error: 'Content is required' }).trim().min(1, 'Content cannot be empty'),
});

export const updateJournalSchema = z
  .object({
    title: z.string().max(255, 'Title must not exceed 255 characters').optional(),
    content: z.string().trim().min(1, 'Content cannot be empty').optional(),
  })
  .refine((data) => data.title !== undefined || data.content !== undefined, {
    message: 'At least one field (title or content) must be provided for update',
  });

export const journalIdParamSchema = z.object({
  id: z.string().uuid('Journal ID must be a valid UUID'),
});

export const journalQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  pageSize: z.coerce.number().int().min(1, 'Page size must be at least 1').max(100, 'Page size cannot exceed 100').default(10),
});
