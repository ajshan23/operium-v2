export const API_BASE_URL = "";

/** Error thrown for non-2xx responses; carries the HTTP status code. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface FetchOptions extends RequestInit {
  data?: any;
}

export async function apiClient<T = any>(
  endpoint: string,
  { data, headers: customHeaders, ...customConfig }: FetchOptions = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const token = typeof window !== "undefined" ? localStorage.getItem("operium_token") : null;
  const orgId = typeof window !== "undefined" ? localStorage.getItem("operium_org_id") : null;

  const headers = new Headers({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(orgId ? { "x-org-id": orgId } : {}),
    ...customHeaders,
  });

  const config: RequestInit = {
    method: data ? "POST" : "GET",
    body: data ? JSON.stringify(data) : undefined,
    headers,
    credentials: "include", // Essential for passing cookies
    ...customConfig,
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (error) {
    throw new Error("Network error. Please ensure the backend is running.");
  }

  // Allow for empty responses like 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  // Non-JSON bodies (proxy errors, HTML error pages) must not crash the parser
  let responseData: any;
  try {
    responseData = await response.json();
  } catch {
    responseData = null;
  }

  if (!response.ok) {
    // Assuming backend returns ApiError payload: { error: true, message: "..." }
    throw new ApiError(
      responseData?.message || responseData?.error || `Request failed with status ${response.status}`,
      response.status
    );
  }

  return responseData ?? ({} as T);
}
