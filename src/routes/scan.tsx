import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  LogOut,
  ScanLine,
  RotateCcw,
  UserCheck,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  UtensilsCrossed,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/store";

export const Route = createFileRoute("/scan")({
  component: ScanPage,
});

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function extractCustomerId(raw: string): string | null {
  const txt = raw.trim();
  if (!txt) return null;
  try {
    const u = new URL(txt);
    const q = u.searchParams.get("customerId");
    if (q) return q;
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch {
    try {
      const j = JSON.parse(txt);
      if (typeof j === "object" && j && "customerId" in j) {
        return String((j as { customerId: unknown }).customerId);
      }
    } catch {
      /* noop */
    }
    return txt;
  }
}

/* ─── types ───────────────────────────────────────────────────────────────── */

type ScanState = "scanning" | "confirm" | "success" | "error";
type MenuItem = { name: string; description: string; price: number; _id: string };

/* ─── MenuPanel ───────────────────────────────────────────────────────────── */

function MenuPanel({ restaurantId, token }: { restaurantId: string; token: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["menu", restaurantId],
    queryFn: () => api.getRestaurantMenu(restaurantId, token),
    staleTime: 5 * 60 * 1000,
    enabled: !!restaurantId && !!token,
  });

  const items: MenuItem[] = data?.[0]?.items ?? [];

  return (
    <div className="w-full max-w-xs mx-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm transition hover:bg-accent"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-foreground">
          <UtensilsCrossed className="h-4 w-4 text-primary" />
          Restaurant Menu
          {items.length > 0 && (
            <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
              {items.length}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="mt-1 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Scrollable Container */}
          <div className="max-h-80 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading menu…
              </div>
            )}

            {isError && (
              <p className="py-5 text-center text-sm text-muted-foreground">
                Could not load menu.
              </p>
            )}

            {!isLoading && !isError && items.length === 0 && (
              <p className="py-5 text-center text-sm text-muted-foreground">
                No menu items found.
              </p>
            )}

            {items.map((item) => (
              <div
                key={item._id}
                className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                  {item.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-xl bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                  ${item.price.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── ScanPage ────────────────────────────────────────────────────────────── */

function ScanPage() {
  const navigate = useNavigate();
  const { token, restaurant, employee, logout } = useAuth();

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader";
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pendingCustomerId, setPendingCustomerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stampError, setStampError] = useState<string | null>(null);
  const lockRef = useRef(false);

  useEffect(() => {
    if (!token || !restaurant) {
      navigate({ to: "/login" });
    }
  }, [token, restaurant, navigate]);

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    if (!s) return;
    try {
      if (s.isScanning) await s.stop();
      await s.clear();
    } catch {
      /* noop */
    }
    scannerRef.current = null;
  }, []);

  const startScanner = useCallback(async () => {
    setCameraError(null);
    if (scannerRef.current) await stopScanner();
    setScanState("scanning");
    try {
      const instance = new Html5Qrcode(containerId, { verbose: false });
      scannerRef.current = instance;
      await instance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          if (lockRef.current) return;
          const id = extractCustomerId(decoded);
          if (!id) return;
          lockRef.current = true;
          setPendingCustomerId(id);
          setScanState("confirm");
          stopScanner();
        },
        () => { /* per-frame failures ignored */ }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to access camera";
      setCameraError(msg);
      setScanState("scanning");
    }
  }, [stopScanner]);

  useEffect(() => {
    if (!token || !restaurant) return;
    startScanner();
    return () => { stopScanner(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, restaurant]);

  async function confirmStamp() {
    if (!pendingCustomerId || !restaurant || !token) return;
    setSubmitting(true);
    setStampError(null);
    try {
      await api.addStamp(
        {
          customerId: pendingCustomerId,
          restaurantId: restaurant._id,
          stampsToAdd: 1,
          loyaltyProgram: restaurant.loyaltyProgram?.[0] ?? "",
        },
        token
      );
      setScanState("success");
      setTimeout(() => {
        setPendingCustomerId(null);
        lockRef.current = false;
        startScanner();
      }, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add stamp";
      setStampError(msg);
      setScanState("error");
    } finally {
      setSubmitting(false);
    }
  }

  function cancelPending() {
    setPendingCustomerId(null);
    setStampError(null);
    lockRef.current = false;
    startScanner();
  }

  function retryAfterError() {
    setStampError(null);
    setScanState("confirm");
  }

  function handleLogout() {
    stopScanner();
    logout();
    navigate({ to: "/login" });
  }

  if (!token || !restaurant) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const displayName = employee?.name ?? restaurant.name;

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-background/90 px-5 py-3 backdrop-blur">
        <div className="flex flex-col">
          <span className="text-sm font-medium leading-tight">{restaurant.name}</span>
          {displayName && displayName !== restaurant.name && (
            <span className="text-xs text-muted-foreground">{displayName}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          aria-label="Sign out"
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      {/* Scanner + Menu */}
      <section className="flex flex-1 flex-col items-center justify-start px-5 pb-20 pt-6 gap-5 overflow-y-auto">
        {/* Scanner viewport */}
        <div className="relative  w-full max-w-xs aspect-square rounded-3xl overflow-hidden bg-black border border-border shadow-lg shrink-0">
          <div
            id={containerId}
            className="absolute scale-[1.6] translate-y-[4px] [&_video]:w-full [&_video]:object-cover"
          />

          {/* Corner viewfinder */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[60%] w-[60%]">
              <span className="absolute -left-0.5 -top-0.5 h-5 w-5 rounded-tl-xl border-l-[3px] border-t-[3px] border-primary" />
              <span className="absolute -right-0.5 -top-0.5 h-5 w-5 rounded-tr-xl border-r-[3px] border-t-[3px] border-primary" />
              <span className="absolute -bottom-0.5 -left-0.5 h-5 w-5 rounded-bl-xl border-b-[3px] border-l-[3px] border-primary" />
              <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-br-xl border-b-[3px] border-r-[3px] border-primary" />
            </div>
          </div>

          {/* Overlay: scanning spinner */}
          {scanState === "scanning" && !cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              {/* <Loader2 className="h-5 w-5 animate-spin text-white/70" /> */}
              <p className="text-sm font-medium text-white">Scan the Customer QR Code</p>
            </div>
          )}

          {/* Overlay: success */}
          {scanState === "success" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20 ring-2 ring-green-400">
                <UserCheck className="h-7 w-7 text-green-400" />
              </div>
              <p className="text-sm font-medium text-white">Stamp added!</p>
            </div>
          )}

          {/* Overlay: camera error */}
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
              <AlertCircle className="h-7 w-7 text-red-400" />
              <p className="text-sm text-white/80">{cameraError}</p>
              <Button size="sm" variant="secondary" onClick={startScanner}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" /> Try again
              </Button>
            </div>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ScanLine className="h-4 w-4 shrink-0" />
          Point at a customer QR code
        </p>

        {/* Restaurant Menu */}
        <MenuPanel restaurantId={restaurant._id} token={token} />
      </section>

      {/* Confirm / Error dialog */}
      <Dialog
        open={scanState === "confirm" || scanState === "error"}
        onOpenChange={(open) => {
          if (!open && !submitting) cancelPending();
        }}
      >
        <DialogContent className="rounded-2xl max-w-xs mx-auto">
          {scanState === "error" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  Stamp failed
                </DialogTitle>
                <DialogDescription className="text-left">
                  {stampError ?? "Something went wrong. Please try again."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button onClick={retryAfterError} className="w-full">
                  Try again
                </Button>
                <Button
                  variant="ghost"
                  onClick={cancelPending}
                  className="w-full text-muted-foreground"
                >
                  Cancel — scan a different code
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Add loyalty stamp?</DialogTitle>
                <DialogDescription>
                  Confirm to add 1 stamp for this customer at{" "}
                  <span className="font-medium text-foreground">{restaurant.name}</span>.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={cancelPending}
                  disabled={submitting}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmStamp}
                  disabled={submitting}
                  className="flex-1"
                >
                  {submitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</>
                  ) : (
                    "Confirm"
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}