export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "REQUEST_FAILED",
    public fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}
export type RequestOptions = {
  signal?: AbortSignal;
  response?: "json" | "blob";
};
export type API = (
  path: string,
  method?: string,
  body?: unknown,
  readOnly?: boolean,
  options?: RequestOptions,
) => Promise<any>;
export function createApi(
  getToken: () => Promise<string | undefined>,
  tenant: string,
): API {
  const pending = new Map<string, Promise<any>>();
  let blockedUntil = 0;
  let tokenPending: Promise<string | undefined> | undefined;
  const accessToken = () => {
    if (!tokenPending) {
      tokenPending = Promise.resolve()
        .then(getToken)
        .finally(() => {
          tokenPending = undefined;
        });
    }
    return tokenPending;
  };
  const checkAbort = (signal?: AbortSignal) => {
    if (signal?.aborted)
      throw new DOMException("Request aborted", "AbortError");
  };
  const cooldown = () => {
    const seconds = Math.ceil((blockedUntil - Date.now()) / 1000);
    if (seconds > 0)
      throw new ApiError(
        `Quá nhiều yêu cầu. Thử lại sau ${seconds} giây.`,
        429,
        "RATE_LIMITED",
      );
  };
  return async (path, method = "GET", body, readOnly = false, options = {}) => {
    if (!path.startsWith("/api/") && path !== "/v1/graphql")
      throw new ApiError("Đường dẫn API không hợp lệ");
    cooldown();
    checkAbort(options.signal);
    const token = await accessToken();
    checkAbort(options.signal);
    if (!token)
      throw new ApiError("Vui lòng đăng nhập lại", 401, "UNAUTHENTICATED");
    cooldown();
    const key =
      !options.signal &&
      (method === "GET" ||
        (path === "/v1/graphql" && method === "POST" && readOnly))
        ? JSON.stringify([token, tenant, method, path, body, options.response])
        : undefined;
    if (key && pending.has(key)) return pending.get(key);
    const request = async () => {
      const headers: Record<string, string> = {
        Authorization: "Bearer " + token,
        "X-Tenant-Id": tenant,
      };
      if (body !== undefined && !(body instanceof FormData))
        headers["Content-Type"] = "application/json";
      let response: Response;
      try {
        response = await fetch(path, {
          method,
          headers,
          signal: options.signal,
          body:
            body === undefined
              ? undefined
              : body instanceof FormData
                ? body
                : JSON.stringify(body),
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        throw new ApiError(
          "Không kết nối được máy chủ. Kiểm tra mạng và thử lại.",
          0,
          "NETWORK_ERROR",
        );
      }
      if (response.status === 429) {
        const value = response.headers.get("Retry-After");
        const seconds = value === null ? NaN : Number(value);
        const date = value === null ? NaN : Date.parse(value);
        const delay =
          Number.isFinite(seconds) && seconds >= 0
            ? seconds * 1000
            : Number.isFinite(date)
              ? date - Date.now()
              : 60000;
        blockedUntil = Math.max(
          blockedUntil,
          Date.now() + Math.max(1000, delay),
        );
        cooldown();
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(
          typeof payload?.error === "string"
            ? payload.error
            : `Yêu cầu thất bại (${response.status})`,
          response.status,
          payload?.code,
          payload?.fieldErrors,
        );
      }
      if (options.response === "blob") return response.blob();
      if (response.status === 204) return null;
      const data = await response.json();
      if (path === "/v1/graphql" && data.errors?.length)
        throw new ApiError(data.errors[0].message, 200, "GRAPHQL_ERROR");
      return data;
    };
    const promise = request().finally(() => {
      if (key) pending.delete(key);
    });
    if (key) pending.set(key, promise);
    return promise;
  };
}
export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Yêu cầu thất bại";
}
