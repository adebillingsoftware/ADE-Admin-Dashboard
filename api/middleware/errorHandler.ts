import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { fail } from '../utils/ApiResponse.js';
import { log } from '../utils/logger.js';

export function notFoundHandler(req: Request, res: Response) {
  return fail(res, 404, 'ROUTE_NOT_FOUND', `No API route matches ${req.method} ${req.path}.`, undefined, req.requestId);
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;

  if (error instanceof ApiError) {
    if (error.status >= 500) log('error', 'API error', { requestId: req.requestId, code: error.code, message: error.message });
    return fail(res, error.status, error.code, error.message, error.details, req.requestId);
  }

  if (error instanceof ZodError) {
    return fail(res, 400, 'VALIDATION_ERROR', 'Request validation failed.', error.issues, req.requestId);
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  log('error', 'Unhandled API error', { requestId: req.requestId, message, stack: error instanceof Error ? error.stack : undefined });
  return fail(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.', undefined, req.requestId);
}
