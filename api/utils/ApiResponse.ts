import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function ok<T>(res: Response, data: T, meta?: PaginationMeta, status = 200) {
  return res.status(status).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
    requestId: res.getHeader('X-Request-Id') ?? undefined,
  });
}

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
  requestId?: string | number | string[],
) {
  return res.status(status).json({
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    requestId,
  });
}
