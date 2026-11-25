import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError.js';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.input = {
        body: schemas.body ? schemas.body.parse(req.body ?? {}) : req.body ?? {},
        query: schemas.query ? schemas.query.parse(req.query ?? {}) : (req.query as Record<string, unknown>),
        params: schemas.params ? schemas.params.parse(req.params ?? {}) : req.params,
      };
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new ApiError(
            400,
            'VALIDATION_ERROR',
            'Request validation failed.',
            error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
          ),
        );
      } else {
        next(error);
      }
    }
  };
}
