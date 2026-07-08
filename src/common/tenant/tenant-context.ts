import { AsyncLocalStorage } from 'async_hooks';

export interface TenantStore {
  tenantId: string;
  userId?: string;
}

export const tenantLocalStorage = new AsyncLocalStorage<TenantStore>();

export function getTenantId(): string | undefined {
  return tenantLocalStorage.getStore()?.tenantId;
}

export function getUserId(): string | undefined {
  return tenantLocalStorage.getStore()?.userId;
}
