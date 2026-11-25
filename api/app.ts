import express from 'express';
import helmet from 'helmet';
import { corsMiddleware } from './config/cors.js';
import { requestContext } from './middleware/requestContext.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRoutes } from './modules/auth/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { shopsRoutes } from './modules/shops/routes.js';
import { paymentRoutes } from './modules/payments/routes.js';
import { subscriptionRoutes } from './modules/subscriptions/routes.js';
import { deviceRoutes } from './modules/devices/routes.js';
import { customerRoutes } from './modules/customers/routes.js';
import { engagementRoutes } from './modules/engagement/routes.js';
import { rewardsRoutes } from './modules/rewards/routes.js';
import { scratchcardRoutes } from './modules/scratchcards/routes.js';
import { reportRoutes } from './modules/reports/routes.js';
import { auditRoutes } from './modules/audit/routes.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { adminRoutes } from './modules/administrators/routes.js';
import { integrationRoutes } from './modules/integration/routes.js';
import { cronRoutes } from './modules/cron/routes.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(corsMiddleware);
app.use(express.json({ limit: '2mb' }));
app.use(requestContext);

app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() }, requestId: req.requestId });
});

const routers = [
  authRoutes,
  dashboardRoutes,
  shopsRoutes,
  paymentRoutes,
  subscriptionRoutes,
  deviceRoutes,
  customerRoutes,
  engagementRoutes,
  rewardsRoutes,
  scratchcardRoutes,
  reportRoutes,
  auditRoutes,
  settingsRoutes,
  adminRoutes,
  integrationRoutes,
  cronRoutes,
];
for (const router of routers) app.use('/api/v1', router);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
