import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../utils/ApiError.js';

/** All listed permissions must be present. Role permissions are expanded at authentication. */
export function authorize(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(unauthorized());
    const missing = permissions.filter((permission) => !req.admin!.permissions.has(permission));
    if (missing.length > 0) {
      return next(forbidden(`Missing permission: ${missing.join(', ')}`));
    }
    next();
  };
}

export function authorizeAny(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(unauthorized());
    if (!permissions.some((permission) => req.admin!.permissions.has(permission))) {
      return next(forbidden('None of the required permissions are granted.'));
    }
    next();
  };
}
