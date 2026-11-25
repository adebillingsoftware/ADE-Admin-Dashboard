import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csvQuery, dateRangeQuery } from '../../schemas/common.js';
import { ok } from '../../utils/ApiResponse.js';
import {
  toCsv,
  getCollections,
  getCustomersReport,
  getOutstandingReport,
  getRedemptionsReport,
  getRewardsReport,
  getScratchcardsReport,
  getShopsReport,
  getSubscriptionsReport,
  type ReportFilters,
} from '../../services/report.service.js';

export const reportRoutes = Router();
reportRoutes.use(authenticate, authorize(PERMISSIONS.reportsRead));

const querySchema = dateRangeQuery.merge(csvQuery).extend({ shopId: z.string().uuid().optional() });

async function respond(
  req: Request,
  res: Response,
  filename: string,
  loader: (filters: ReportFilters) => Promise<Record<string, unknown>>,
) {
  const q = req.input.query as { from?: string; to?: string; shopId?: string; format?: 'json' | 'csv' };
  const data = await loader({ from: q.from, to: q.to, shopId: q.shopId });
  if (q.format === 'csv') {
    const rows = Array.isArray(data.rows) ? (data.rows as Array<Record<string, unknown>>) : [];
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return res
      .status(200)
      .set('Content-Type', 'text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="${filename}"`)
      .send(toCsv(rows, columns));
  }
  return ok(res, data);
}

reportRoutes.get('/reports/collections', validate({ query: querySchema }), async (req, res, next) => {
  try { await respond(req, res, 'monthly-collections.csv', getCollections); } catch (error) { next(error); }
});
reportRoutes.get('/reports/subscriptions', validate({ query: querySchema }), async (req, res, next) => {
  try { await respond(req, res, 'subscriptions.csv', getSubscriptionsReport); } catch (error) { next(error); }
});
reportRoutes.get('/reports/shops', validate({ query: querySchema }), async (req, res, next) => {
  try { await respond(req, res, 'shop-registrations.csv', getShopsReport); } catch (error) { next(error); }
});
reportRoutes.get('/reports/customers', validate({ query: querySchema }), async (req, res, next) => {
  try { await respond(req, res, 'customers.csv', getCustomersReport); } catch (error) { next(error); }
});
reportRoutes.get('/reports/rewards', validate({ query: querySchema }), async (req, res, next) => {
  try { await respond(req, res, 'reward-activity.csv', getRewardsReport); } catch (error) { next(error); }
});
reportRoutes.get('/reports/scratchcards', validate({ query: querySchema }), async (req, res, next) => {
  try { await respond(req, res, 'scratch-card-activity.csv', getScratchcardsReport); } catch (error) { next(error); }
});
reportRoutes.get('/reports/outstanding', validate({ query: querySchema }), async (req, res, next) => {
  try { await respond(req, res, 'outstanding-payments.csv', getOutstandingReport); } catch (error) { next(error); }
});
reportRoutes.get('/reports/redemptions', validate({ query: querySchema }), async (req, res, next) => {
  try { await respond(req, res, 'redemption-activity.csv', getRedemptionsReport); } catch (error) { next(error); }
});
