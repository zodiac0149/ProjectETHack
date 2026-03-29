"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type ReframeOut = {
  fact: string;
  cfo: {
    headline: string;
    brief: string;
    risks: string[];
    watchItems: string[];
    actions: string[];
  };
  investor: {
    vibe: string;
    pocketImpact: string;
    sipAngle: string;
    quickTake: string[];
  };
};

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

export default function MyETPage() {
  const [fact, setFact] = useState(
    "LTCG tax increase on equities (details not specified here)."
  );
  const [out, setOut] = useState<ReframeOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setOut(null);
    try {
      const res = await postJSON<ReframeOut>("/api/persona/reframe", { fact });
      setOut(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-white/[0.04]">
        <CardHeader>
          <CardTitle className="flex items-baseline justify-between gap-3">
            <span>My ET — Persona-Differentiated Feed</span>
            <Badge variant="secondary">Before vs After demo</Badge>
          </CardTitle>
          <CardDescription>
            Same budget fact, rewritten for two audiences. Requires{" "}
            <code className="text-white/80">ANTHROPIC_API_KEY</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold">Budget fact</div>
            <textarea
              className="min-h-[92px] w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white outline-none focus:border-indigo-300/40 focus:ring-4 focus:ring-indigo-300/10"
              value={fact}
              onChange={(e) => setFact(e.target.value)}
              placeholder='Example: "LTCG tax increase from X% to Y% effective DATE"'
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={run} disabled={loading}>
              {loading ? "Reframing…" : "Generate both feeds"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setOut(null);
                setError(null);
              }}
              disabled={loading}
            >
              Clear
            </Button>
          </div>
          {error ? <div className="text-sm text-red-200/90">{error}</div> : null}
        </CardContent>
      </Card>

      {out ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          
          <Card className="bg-gradient-to-b from-white/[0.06] to-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>The CFO</span>
                <Badge>Policy / Risk</Badge>
              </CardTitle>
              <CardDescription>
                Macro + compliance lens. Structured, no fluff.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs font-semibold text-white/70">
                  Headline
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {out.cfo.headline}
                </div>
                <div className="mt-2 text-sm text-white/80">{out.cfo.brief}</div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-white/70">
                    Regulatory / execution risks
                  </div>
                  <div className="mt-2 space-y-2">
                    {out.cfo.risks.map((r, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-white/10 bg-black/15 p-2 text-sm text-white/85"
                      >
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-white/70">
                    Watch-items
                  </div>
                  <div className="mt-2 space-y-2">
                    {out.cfo.watchItems.map((w, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-white/10 bg-black/15 p-2 text-sm text-white/85"
                      >
                        {w}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Separator />
              <div>
                <div className="text-xs font-semibold text-white/70">
                  Actions / next steps
                </div>
                <div className="mt-2 space-y-2">
                  {out.cfo.actions.map((a, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-indigo-300/20 bg-indigo-300/10 p-2 text-sm"
                    >
                      {a}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-b from-emerald-300/10 to-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>The 24-year-old Investor</span>
                <Badge variant="default">Pocket / SIP</Badge>
              </CardTitle>
              <CardDescription>
                Easy-to-read, practical, “what it means for me”.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
                <div className="text-xs font-semibold text-white/70">Vibe</div>
                <div className="mt-1 text-lg font-bold">{out.investor.vibe}</div>
                <div className="mt-2 text-sm text-white/85">
                  {out.investor.pocketImpact}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs font-semibold text-white/70">
                  SIP angle
                </div>
                <div className="mt-2 text-sm text-white/85">
                  {out.investor.sipAngle}
                </div>
              </div>

              <Separator />
              <div>
                <div className="text-xs font-semibold text-white/70">
                  Quick take
                </div>
                <div className="mt-2 space-y-2">
                  {out.investor.quickTake.map((q, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-white/10 bg-black/15 p-2 text-sm text-white/85"
                    >
                      {q}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

