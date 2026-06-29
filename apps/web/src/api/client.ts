export const API_BASE_URL = "";

interface FetchOptions extends RequestInit {
  data?: any;
}

export async function apiClient<T = any>(
  endpoint: string,
  { data, headers: customHeaders, ...customConfig }: FetchOptions = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const token = typeof window !== "undefined" ? localStorage.getItem("operium_token") : null;

  const headers = new Headers({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

  const responseData = await response.json();

  if (!response.ok) {
    // Assuming backend returns ApiError payload: { error: true, message: "..." }
    throw new Error(responseData.message || responseData.error || "An API error occurred");
  }

  return responseData;
}
