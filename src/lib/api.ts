const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      (data as { message?: string })?.message ||
      (typeof data === "string" ? data : `Request failed (${res.status})`);
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  login: (employeeId: string, password: string) =>
    request<{ token: string; employee?: Record<string, unknown> }>(
      "/api/users/login",
      { method: "POST", body: JSON.stringify({ employeeId, password }) }
    ),
  getRestaurantByEmployee: (employeeId: string, token: string) =>
    request<import("./store").Restaurant>(
      `/api/restaurants/employee/${employeeId}`,
      { method: "GET", token }
    ),
  addStamp: (
    body: {
      customerId: string;
      restaurantId: string;
      stampsToAdd: number;
      loyaltyProgram: string;
    },
    token: string
  ) =>
    request<unknown>("/api/users/stamps", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
};
