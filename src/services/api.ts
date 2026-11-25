import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { supabase } from './supabase';

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  status: number;
}

export class ApiRequestError extends Error implements ApiErrorShape {
  code: string;
  details?: unknown;
  requestId?: string;
  status: number;
  constructor(status: number, payload: Record<string, unknown>) {
    const error = (payload.error ?? {}) as { code?: string; message?: string; details?: unknown };
    super(error.message ?? 'Request failed.');
    this.status = status;
    this.code = error.code ?? 'UNKNOWN_ERROR';
    this.details = error.details;
    this.requestId = payload.requestId as string | undefined;
  }
}

export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<Record<string, unknown>>) => {
    const config = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    if (status === 401 && config && !config._retry) {
      config._retry = true;
      const { data } = await supabase.auth.refreshSession();
      if (data.session?.access_token) {
        config.headers.Authorization = `Bearer ${data.session.access_token}`;
        return api(config);
      }
    }
    const payload = error.response?.data ?? {};
    throw new ApiRequestError(status ?? 0, payload);
  },
);

export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await api.get<{ data: T }>(url, { params });
  return response.data.data;
}

export async function apiSend<T>(method: 'post' | 'patch' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
  const response = await api.request<{ data: T }>({ method, url, data: body });
  return response.data.data;
}

export async function apiPaginated<T>(url: string, params?: Record<string, unknown>): Promise<{ data: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
  const response = await api.get<{ data: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }>(url, { params });
  return response.data;
}
