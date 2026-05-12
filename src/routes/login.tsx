import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ScanLine, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/store";

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

async function login(employeeId: string, password: string) {

  console.log(employeeId, password)
  console.log(JSON.stringify({ employeeId, password }))
  return request<{ token: string; employee?: Record<string, unknown> }>(
    "/api/restaurants/employee/login",
    { method: "POST", body: JSON.stringify({ employeeId, password }) }
  );
}

async function getRestaurantByEmployee(employeeId: string, token: string) {
  return request<{ id: string; name: string; loyaltyPrograms: string[] }>(
    `/api/restaurants/employee/${employeeId}`,
    { method: "GET", token }
  );
}

// FIX: Use z.string().optional() so absent params are undefined, not ""
// fallback("") only fires for invalid (non-string) values — a missing param
// produces undefined which we handle explicitly below.
const searchSchema = z.object({
  employeeId: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/login")({
  validateSearch: zodValidator(searchSchema),
  beforeLoad: () => {
    const { token, restaurant } = useAuth.getState();
    if (token && restaurant) {
      throw redirect({ to: "/scan" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { employeeId: queryEmployeeId } = Route.useSearch();
  const navigate = useNavigate();
  const { setAuth, setRestaurant, employeeId: storedId } = useAuth();

  // Prefer the URL param, fall back to whatever was previously stored
  const employeeId = queryEmployeeId || storedId || "";

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Persist the URL param into the store so it survives page refreshes
  // where the query string might be lost (e.g. after a hard reload on /login).
  useEffect(() => {
    if (queryEmployeeId) {
      useAuth.setState({ employeeId: queryEmployeeId });
    }
  }, [queryEmployeeId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // FIX: Read the freshest value from the store at submit time instead of
    // relying on the `employeeId` variable captured during render, which may
    // be stale if the useEffect hadn't fired yet on the first render.
    const resolvedEmployeeId =
      queryEmployeeId || useAuth.getState().employeeId || "";

    if (!resolvedEmployeeId) {
      toast.error("Missing employee ID. Scan your employee QR to continue.");
      return;
    }
    if (!password) {
      toast.error("Enter your password");
      return;
    }

    setLoading(true);
    try {
      const res = await login(resolvedEmployeeId, password);
      if (!res.token) throw new Error("No token returned");

      setAuth({
        token: res.token,
        employeeId: resolvedEmployeeId,
        employee: (res.employee as never) ?? null,
      });

      const restaurant = await getRestaurantByEmployee(
        resolvedEmployeeId,
        res.token
      );
      setRestaurant(restaurant);
      toast.success(`Welcome to ${restaurant.name}`);
      navigate({ to: "/scan" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-background px-5 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-[var(--brand-soft,transparent)] to-transparent" />
      <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <ScanLine className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Employee sign in
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your password to start scanning customers.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Employee
            </Label>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm">
              {employeeId ? (
                <span className="font-mono">{employeeId}</span>
              ) : (
                <span className="text-muted-foreground">
                  No employee ID — scan your QR
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 rounded-xl pl-9 text-base"
                disabled={loading}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || !employeeId}
            className="h-12 w-full rounded-xl text-base font-medium shadow-md transition active:scale-[0.99]"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </div>
    </main>
  );
}