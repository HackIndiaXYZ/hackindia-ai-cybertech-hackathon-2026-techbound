import type { ProvidersResponse } from '@isl/shared-types';
import { api } from './apiClient.js';

/**
 * Client access to the server's provider resolution (Phase 4C.3, P2-6).
 * `/api/v1/providers` is the single source of provider truth: the badge in
 * Settings and any future capability display must match what the API says it
 * can actually run, so the gap between configured flags and real behavior is
 * visible in-product (§37). Never mirror the flags client-side.
 */
export function fetchProviders(transport: typeof api = api): Promise<ProvidersResponse> {
  return transport.get<ProvidersResponse>('/providers');
}
