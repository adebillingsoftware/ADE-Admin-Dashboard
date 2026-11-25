import { badRequest } from './ApiError.js';

export interface PaginationInput {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDirection: 'asc' | 'desc';
  from?: string;
  to?: string;
  search?: string;
}

const SORTABLE = new Set([
  'created_at', 'registered_at', 'shop_name', 'shop_code', 'paid_at', 'period_start', 'updated_at',
]);

export function parsePagination(input: Record<string, unknown> = {}): PaginationInput {
  const page = Number(input.page ?? 1);
  const pageSize = Number(input.pageSize ?? input.limit ?? 25);
  const sortBy = typeof input.sortBy === 'string' && SORTABLE.has(input.sortBy) ? input.sortBy : undefined;
  const sortDirection = input.sortDirection === 'asc' ? 'asc' : 'desc';
  if (!Number.isInteger(page) || page < 1) throw badRequest('page must be a positive integer.');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    throw badRequest('pageSize must be an integer between 1 and 200.');
  }
  return {
    page,
    pageSize,
    sortBy,
    sortDirection,
    from: typeof input.from === 'string' ? input.from : undefined,
    to: typeof input.to === 'string' ? input.to : undefined,
    search: typeof input.search === 'string' && input.search.trim() ? input.search.trim() : undefined,
  };
}

export function paginationMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function range(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1] as const;
}
