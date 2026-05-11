import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import {
  Loader2,
  LogOut,
  ScanLine,
  CheckCircle2,
  XCircle,
  RotateCcw,
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
    // not a URL — try JSON
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

function ScanPage() {
  const navigate = useNavigate();
  const { token, restaurant, employee, employeeId, logout } = useAuth();

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader";
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pendingCustomerId, setPendingCustomerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lockRef = useRef(false);

  // Redirect to login if no token
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
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    setCameraError(null);
    if (scannerRef.current) await stopScanner();
    try {
      const instance = new Html5Qrcode(containerId, { verbose: false });
      scannerRef.current = instance;
      await instance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decoded) => {
          if (lockRef.current) return;
          const id = extractCustomerId(decoded);
          if (!id) return;
          lockRef.current = true;
          setPendingCustomerId(id);
          // pause camera while confirming
          stopScanner();
        },
        () => {
          /* per-frame failures ignored */
        }
      );
      setScanning(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unable to access camera";
      setCameraError(msg);
      setScanning(false);
    }
  }, [stopScanner]);

  useEffect(() => {
    if (!token || !restaurant) return;
    startScanner();
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, restaurant]);

  async function confirmStamp() {
    if (!pendingCustomerId || !restaurant || !token) return;
    setSubmitting(true);
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
      toast.success("Stamp added", {
        icon: <CheckCircle2 className="h-4 w-4" />,
      });
      setPendingCustomerId(null);
      // small delay then re-arm
      setTimeout(() => {
        lockRef.current = false;
        startScanner();
      }, 600);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add stamp", {
        icon: <XCircle className="h-4 w-4" />,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function cancelPending() {
    setPendingCustomerId(null);
    lockRef.current = false;
    startScanner();
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

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-border bg-background/80 px-5 py-4 backdrop-blur">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Signed in as
          </p>
          <h1 className="truncate text-base font-semibold">
            {restaurant.name}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {employee?.name ? `${employee.name} · ` : ""}
            <span className="font-mono">{employeeId}</span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          aria-label="Sign out"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      {/* Scanner */}
      <section className="flex flex-1 flex-col px-5 pb-8 pt-6">
        <div className="mx-auto w-full max-w-md">
          <div className="relative aspect-square overflow-hidden rounded-3xl border border-border bg-black shadow-xl">
            <div id={containerId} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
            {/* viewfinder overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-2/3 w-2/3 rounded-2xl border-2 border-white/30">
                <span className="absolute -left-0.5 -top-0.5 h-6 w-6 rounded-tl-2xl border-l-4 border-t-4 border-primary" />
                <span className="absolute -right-0.5 -top-0.5 h-6 w-6 rounded-tr-2xl border-r-4 border-t-4 border-primary" />
                <span className="absolute -bottom-0.5 -left-0.5 h-6 w-6 rounded-bl-2xl border-b-4 border-l-4 border-primary" />
                <span className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-br-2xl border-b-4 border-r-4 border-primary" />
              </div>
            </div>
            {!scanning && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center text-white">
                <XCircle className="h-8 w-8 text-red-400" />
                <p className="text-sm">{cameraError}</p>
                <Button size="sm" variant="secondary" onClick={startScanner}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Retry
                </Button>
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ScanLine className="h-4 w-4" />
            Point the camera at the customer's QR code
          </div>
        </div>
      </section>

      <Dialog
        open={!!pendingCustomerId}
        onOpenChange={(o) => {
          if (!o && !submitting) cancelPending();
        }}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add a stamp?</DialogTitle>
            <DialogDescription>
              Confirm this customer to add 1 loyalty stamp.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-muted/60 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Customer ID
            </p>
            <p className="mt-1 break-all font-mono text-sm">{pendingCustomerId}</p>
          </div>
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
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…
                </>
              ) : (
                "Add stamp"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
