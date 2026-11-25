import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { dateRangeQuery } from '../../schemas/common.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { ok } from '../../utils/ApiResponse.js';
import { getOverview } from '../../services/report.service.js';
import { isValidDateRange } from '../../utils/date.js';
import { badRequest } from '../../utils/ApiError.js';

export const dashboardRoutes = Router();
const guard = [authenticate, authorize(PERMISSIONS.shopsRead)];

dashboardRoutes.get('/dashboard/overview', ...guard, validate({ query: dateRangeQuery }), async (req, res, next) => {
  try {
    const { from, to } = req.input.query as { from?: string; to?: string };
    if (!isValidDateRange(from, to)) throw badRequest('Invalid date range.');
    const data = await getOverview({ from, to });
    return ok(res, data.summary ?? data);
  } catch (error) {
    next(error);
  }
});

dashboardRoutes.get('/dashboard/charts', ...guard, validate({ query: dateRangeQuery }), async (req, res, next) => {
  try {
    const { from, to } = req.input.query as { from?: string; to?: string };
    const data = await getOverview({ from, to });
    return ok(res, data.charts ?? { charts: [] });
  } catch (error) {
    next(error);
  }
});

dashboardRoutes.get('/dashboard/alerts', ...guard, validate({ query: dateRangeQuery }), async (req, res, next) => {
  try {
    const { from, to } = req.input.query as { from?: string; to?: string };
    const data = await getOverview({ from, to });
    return ok(res, data.alerts ?? { alerts: [] });
  } catch (error) {
    next(error);
  }
});
