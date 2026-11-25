import type { Request } from 'express';

export interface AdminContext {
  userId: string;
  email: string | null;
  displayName: string;
  roles: string[];
  permissions: Set<string>;
}

export interface CustomerContext {
  customerId: string;
  userId: string;
  status: string;
}

export interface ShopContext {
  shopId: string;
  keyId: string;
  rewardsEnabled: boolean;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      admin?: AdminContext;
      customer?: CustomerContext;
      shop?: ShopContext;
      input: {
        body: unknown;
        query: Record<string, unknown>;
        params: Record<string, string>;
      };
    }
  }
}

export type ValidatedRequest = Request & { input: Required<Request['input']> };
