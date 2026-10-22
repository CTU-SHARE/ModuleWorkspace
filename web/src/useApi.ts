import { useCallback, useRef } from 'react';

export type API = (
  path: string,
  method?: string,
  body?: unknown,
  readOnly?: boolean,
) => Promise<any>;

// Only concurrent reads are shared. Mutations are never retried or deduplicated.
export function useApi(
  getAccessToken: (resource?: string) => Promise<string | undefined>,
  resource: string,
  tenant: string,
): API {
  const tokenFn = useRef(getAccessToken);
  tokenFn.current = getAccessToken;
  const pending = useRef(new Map<string, Promise<any>>());
  const blockedUntil = useRef(0);

  return useCallback<API>(
    (path, method = 'GET', body, readOnly = false) => {
      const checkCooldown = () => {
        const seconds = Math.ceil((blockedUntil.current - Date.now()) / 1000);
        if (seconds > 0)
          throw new Error(`Quá nhiều yêu cầu. Vui lòng thử lại sau ${seconds} giây.`);
      };
      const canShare =
        method === 'GET' || (method === 'POST' && path === '/v1/graphql' && readOnly);
      const key = canShare ? JSON.stringify([resource, tenant, method, path, body]) : undefined;
      if (key) {
        const existing = pending.current.get(key);
        if (existing) return existing;
      }
      const request = (async () => {
        checkCooldown();
        const token = await tokenFn.current(resource);
        checkCooldown();
        const headers: Record<string, string> = {
          Authorization: 'Bearer ' + token,
          'X-Tenant-Id': tenant,
        };
        if (body !== undefined && !(body instanceof FormData))
          headers['Content-Type'] = 'application/json';
        const response = await fetch(path, {
          method,
          headers,
          body:
            body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        });
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const seconds = retryAfter === null ? NaN : Number(retryAfter);
          const deadline = retryAfter === null ? NaN : Date.parse(retryAfter);
          const delay =
            Number.isFinite(seconds) && seconds >= 0
              ? seconds * 1000
              : Number.isFinite(deadline)
                ? deadline - Date.now()
                : 60_000;
          blockedUntil.current = Math.max(blockedUntil.current, Date.now() + Math.max(1000, delay));
          checkCooldown();
        }
        if (!response.ok) {
          const error = await response.json().catch(() => null);
          throw new Error(
            error?.error || error?.message || `Yêu cầu thất bại (${response.status})`,
          );
        }
        return response.status === 204 ? null : response.json();
      })();
      if (!key) return request;
      const shared = request.finally(() => {
        if (pending.current.get(key) === shared) pending.current.delete(key);
      });
      pending.current.set(key, shared);
      return shared;
    },
    [resource, tenant],
  );
}
