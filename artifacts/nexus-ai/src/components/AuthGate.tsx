import { useEffect, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { probeAuth, setToken, clearToken } from "@/lib/auth";

type GateState = "checking" | "locked" | "open";

/**
 * Blocks the app until the API accepts our credentials. When the server has
 * no NXS_ACCESS_TOKEN configured the probe passes immediately and the gate
 * is invisible.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [input, setInput] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void probeAuth().then((r) => setState(r === "unauthorized" ? "locked" : "open"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const token = input.trim();
    if (!token) return;
    setToken(token);
    const result = await probeAuth();
    if (result === "unauthorized") {
      clearToken();
      setFailed(true);
      return;
    }
    setState("open");
  }

  if (state === "open") return <>{children}</>;
  if (state === "checking") return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 shadow-lg"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold">NXS Command Center</h1>
            <p className="text-xs text-muted-foreground">Enter your access token to continue</p>
          </div>
        </div>
        <Input
          type="password"
          autoFocus
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setFailed(false);
          }}
          placeholder="Access token"
        />
        {failed && <p className="text-xs text-destructive">That token was rejected — try again.</p>}
        <Button type="submit" className="w-full" disabled={!input.trim()}>
          Unlock
        </Button>
      </form>
    </div>
  );
}
