import { z } from 'zod';

export const uuid = z.string().uuid('Must be a valid UUID.');
export const moneyMinor = z.number().int('Amount must be in integer minor units.').nonnegative();
export const signedMoneyMinor = z.number().int('Amount must be in integer minor units.');

export const idParam = z.object({ id: uuid });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sortBy: z.string().max(60).optional(),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().max(200).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
});

export const dateRangeQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export const reasonBody = z.object({
  reason: z.string().trim().min(3, 'A reason of at least 3 characters is required.').max(1000),
});

export const csvQuery = z.object({ format: z.enum(['json', 'csv']).default('json') });
