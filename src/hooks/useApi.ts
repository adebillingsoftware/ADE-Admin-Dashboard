import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPaginated } from '@/services/api';

export function useResource<T>(key: string, url: string, params?: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: [key, url, params ?? {}],
    queryFn: () => apiGet<T>(url, params),
    enabled,
  });
}

export function useList<T>(key: string, url: string, params: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: [key, url, params],
    queryFn: () => apiPaginated<T>(url, params),
    enabled,
  });
}
