import { useMemo, useRef } from 'react';
import { createApi } from './lib/api';
export type { API } from './lib/api';
export function useApi(
  getAccessToken: (resource?: string) => Promise<string | undefined>,
  resource: string,
  tenant: string,
) {
  const tokenFn = useRef(getAccessToken);
  tokenFn.current = getAccessToken;
  return useMemo(() => createApi(() => tokenFn.current(resource), tenant), [resource, tenant]);
}
