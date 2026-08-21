const TRANSIENT_DEPLOYMENT_STATUSES = new Set([502, 503, 504]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Keep a save request alive across the short interruption caused by a
 * rolling deployment. We intentionally retry only an explicit gateway or
 * service-unavailable response: retrying a network error could duplicate a
 * write whose response was lost after the server committed it.
 */
export async function resilientFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = String(init?.method || "GET").toUpperCase();
  if (!MUTATING_METHODS.has(method)) return fetch(input, init);

  let response = await fetch(input, init);
  for (const delay of [500, 1000, 2000, 4000]) {
    if (!TRANSIENT_DEPLOYMENT_STATUSES.has(response.status)) return response;
    await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
    response = await fetch(input, init);
  }
  return response;
}

export function apiErrorMessage(
  response: Response,
  body: unknown,
  fallback: string,
) {
  if (TRANSIENT_DEPLOYMENT_STATUSES.has(response.status)) {
    return "Northline is updating right now. Your changes were not confirmed—please try Save again in a moment.";
  }
  const value = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  return typeof value === "string" && value.trim() ? value : fallback;
}
