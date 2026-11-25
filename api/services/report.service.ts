import { requireSupabase, assertNoError } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';

export interface ReportFilters {
  from?: string;
  to?: string;
  shopId?: string;
}

function applyRange<T>(query: T, column: string, filters: ReportFilters): T {
  let result = query;
  const q = result as unknown as {
    gte: (column: string, value: string) => unknown;
    lte: (column: string, value: string) => unknown;
  };
  if (filters.from && typeof q.gte === 'function') result = q.gte(column, filters.from) as T;
  if (filters.to && typeof q.lte === 'function') result = q.lte(column, filters.to) as T;
  return result;
}

function sum(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

export async function getOverview(filters: ReportFilters) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_dashboard_data', {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
  });
  assertNoError({ error });
  if (!data) throw new ApiError(500, 'DASHBOARD_RPC_EMPTY', 'Dashboard data could not be calculated.');
  return data as Record<string, unknown>;
}

export async function getCollections(filters: ReportFilters) {
  const supabase = requireSupabase();
  let query = supabase
    .from('payments')
    .select('id, amount_minor, currency_code, method, status, paid_at, verified_at, shop_id, shops(shop_code, shop_name)')
    .eq('status', 'VERIFIED')
    .order('paid_at', { ascending: false })
    .limit(2000);
  query = applyRange(query, 'paid_at', filters) as typeof query;
  if (filters.shopId) query = query.eq('shop_id', filters.shopId);
  const { data, error } = await query;
  assertNoError({ error });
  return { rows: data ?? [], totals: { verifiedMinor: sum(data ?? [], 'amount_minor'), count: data?.length ?? 0 } };
}

export async function getSubscriptionsReport(filters: ReportFilters) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, status, suspension_reason, current_period_start, current_period_end, grace_deadline, monthly_price_minor, shops(shop_code, shop_name)');
  assertNoError({ error });
  const rows = data ?? [];
  const { data: pending } = await supabase.from('payments').select('amount_minor').eq('status', 'PENDING');
  assertNoError({ error: pendingError() });
  function pendingError() { return null; }
  return {
    rows,
    totals: {
      active: rows.filter((row) => row.status === 'ACTIVE').length,
      grace: rows.filter((row) => row.status === 'GRACE').length,
      suspended: rows.filter((row) => row.status === 'SUSPENDED').length,
      pendingPaymentMinor: sum(pending ?? [], 'amount_minor'),
      mrrMinor: rows.filter((row) => row.status === 'ACTIVE').reduce((t, row) => t + Number(row.monthly_price_minor ?? 0), 0),
    },
    filters,
  };
}

export async function getShopsReport(filters: ReportFilters) {
  const supabase = requireSupabase();
  let query = supabase
    .from('shops')
    .select('id, shop_code, shop_name, owner_name, registration_status, registered_at, city, state')
    .order('registered_at', { ascending: false })
    .limit(2000);
  query = applyRange(query, 'registered_at', filters) as typeof query;
  const { data, error } = await query;
  assertNoError({ error });
  return { rows: data ?? [], totals: { registrations: data?.length ?? 0 }, filters };
}

export async function getCustomersReport(filters: ReportFilters) {
  const supabase = requireSupabase();
  let query = supabase
    .from('customer_profiles')
    .select('id, display_name, status, created_at')
    .order('created_at', { ascending: false })
    .limit(2000);
  query = applyRange(query, 'created_at', filters) as typeof query;
  const { data, error } = await query;
  assertNoError({ error });
  const { data: memberships } = await supabase.from('customer_shop_memberships').select('id, status');
  assertNoError({ error: membershipsError() });
  function membershipsError() { return null; }
  return {
    rows: data ?? [],
    totals: {
      customers: data?.length ?? 0,
      activeCustomers: (data ?? []).filter((row) => row.status === 'ACTIVE').length,
      memberships: memberships?.length ?? 0,
      activeMemberships: (memberships ?? []).filter((row) => row.status === 'ACTIVE').length,
    },
    filters,
  };
}

export async function getRewardsReport(filters: ReportFilters) {
  const supabase = requireSupabase();
  let ledgerQuery = supabase
    .from('reward_ledger')
    .select('id, entry_type, points_delta, created_at, description')
    .order('created_at', { ascending: false })
    .limit(5000);
  ledgerQuery = applyRange(ledgerQuery, 'created_at', filters) as typeof ledgerQuery;
  const [{ data: ledger, error }, { data: wallet, error: walletError }, { data: events, error: eventError }] =
    await Promise.all([
      ledgerQuery,
      supabase.from('wallet_ledger').select('id, entry_type, amount_minor_delta, created_at'),
      supabase.from('reward_events').select('id, status, rejection_code, received_at'),
    ]);
  assertNoError({ error });
  assertNoError({ error: walletError });
  assertNoError({ error: eventError });
  return {
    rows: ledger ?? [],
    totals: {
      pointsIssued: sum((ledger ?? []).filter((row) => Number(row.points_delta) > 0), 'points_delta'),
      pointsRedeemed: Math.abs(sum((ledger ?? []).filter((row) => Number(row.points_delta) < 0), 'points_delta')),
      walletCredits: sum((wallet ?? []).filter((row) => Number(row.amount_minor_delta) > 0), 'amount_minor_delta'),
      walletDebits: Math.abs(sum((wallet ?? []).filter((row) => Number(row.amount_minor_delta) < 0), 'amount_minor_delta')),
      syncSuccess: (events ?? []).filter((row) => row.status === 'PROCESSED').length,
      syncFailed: (events ?? []).filter((row) => row.status === 'REJECTED').length,
    },
    filters,
  };
}

export async function getScratchcardsReport(filters: ReportFilters) {
  const supabase = requireSupabase();
  let query = supabase
    .from('scratch_cards')
    .select('id, status, issued_at, revealed_at, expires_at, campaign_id, scratch_card_campaigns(name)')
    .order('issued_at', { ascending: false })
    .limit(5000);
  query = applyRange(query, 'issued_at', filters) as typeof query;
  const { data, error } = await query;
  assertNoError({ error });
  const rows = data ?? [];
  return {
    rows,
    totals: {
      issued: rows.length,
      revealed: rows.filter((row) => row.status === 'REVEALED' || row.status === 'REDEEMED').length,
      expired: rows.filter((row) => row.status === 'EXPIRED').length,
    },
    filters,
  };
}

export async function getOutstandingReport(filters: ReportFilters) {
  const supabase = requireSupabase();
  let query = supabase
    .from('payments')
    .select('id, amount_minor, currency_code, method, paid_at, transaction_reference, shop_id, shops(shop_code, shop_name)')
    .eq('status', 'PENDING')
    .order('paid_at', { ascending: false })
    .limit(5000);
  query = applyRange(query, 'paid_at', filters) as typeof query;
  if (filters.shopId) query = query.eq('shop_id', filters.shopId);
  const { data, error } = await query;
  assertNoError({ error });
  const rows = data ?? [];
  return { rows, totals: { outstandingMinor: sum(rows, 'amount_minor'), count: rows.length }, filters };
}

export async function getRedemptionsReport(filters: ReportFilters) {
  const supabase = requireSupabase();
  let query = supabase
    .from('redemptions')
    .select('id, status, points_spent, created_at, completed_at, reward_id, membership_id')
    .order('created_at', { ascending: false })
    .limit(5000);
  query = applyRange(query, 'created_at', filters) as typeof query;
  const { data, error } = await query;
  assertNoError({ error });
  const rows = data ?? [];
  return {
    rows,
    totals: {
      count: rows.length,
      completed: rows.filter((row) => row.status === 'COMPLETED').length,
      pointsSpent: rows.reduce((total, row) => total + Number(row.points_spent ?? 0), 0),
    },
    filters,
  };
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]) {
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = columns.join(',');
  const body = rows.map((row) => columns.map((column) => escape(row[column])).join(',')).join('\n');
  return `${header}\n${body}`;
}
