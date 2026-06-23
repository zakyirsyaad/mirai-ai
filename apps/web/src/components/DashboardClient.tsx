"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Interactive dashboard surface:
 *  - connect X (OAuth) if not yet connected;
 *  - toggle content mode (autonomous vs user-supplied) and enabled;
 *  - add raw content to the pool (user-supplied mode);
 *  - watch the per-post pipeline live via SSE.
 */

interface InitialState {
  hasCampaign: boolean;
  campaignId: string | null;
  status: string | null;
  contentMode: "AUTONOMOUS" | "USER_SUPPLIED";
  enabled: boolean;
  xHandle: string | null;
  xConnected: boolean;
  coldStart: boolean;
  plannedPosts: number;
  poolItems: number;
}

interface LogLine {
  text: string;
  kind: "ok" | "warn" | "err" | "plain";
}

export function DashboardClient({ initial }: { initial: InitialState }) {
  const [mode, setMode] = useState(initial.contentMode);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [pool, setPool] = useState("");
  const [poolCount, setPoolCount] = useState(initial.poolItems);
  const [log, setLog] = useState<LogLine[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  // Live progress feed.
  useEffect(() => {
    if (!initial.hasCampaign) return;
    const es = new EventSource("/api/events");
    es.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data) as Record<string, unknown>;
        if (e.type === "hello") return;
        const stage = (e.stage as string) ?? (e.status as string) ?? "event";
        const status = (e.status as string) ?? "";
        const kind: LogLine["kind"] =
          status === "failed"
            ? "err"
            : status === "skipped"
              ? "warn"
              : status === "completed"
                ? "ok"
                : "plain";
        const msg = e.message ? ` — ${e.message as string}` : "";
        push({ text: `${stage} ${status}${msg}`, kind });
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () =>
      push({ text: "stream disconnected, retrying…", kind: "warn" });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.hasCampaign]);

  function push(line: LogLine) {
    setLog((l) => [...l.slice(-200), line]);
    requestAnimationFrame(() => {
      if (logRef.current)
        logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  }

  async function saveCampaign(
    next: Partial<{ contentMode: string; enabled: boolean }>,
  ) {
    await fetch("/api/campaign", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
  }

  async function addPool() {
    const items = pool
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return;
    const res = await fetch("/api/campaign/content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (res.ok) {
      const { added } = (await res.json()) as { added: number };
      setPoolCount((c) => c + added);
      setPool("");
      push({ text: `added ${added} item(s) to pool`, kind: "ok" });
    }
  }

  if (!initial.hasCampaign) {
    return (
      <div className="panel">
        <h2>No active campaign</h2>
        <p className="muted">
          This wallet has access but no posting campaign (it may be a read-only
          order). If you expected a campaign, contact support.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <h2>X account</h2>
        {initial.xConnected ? (
          <p>
            Connected as <strong>@{initial.xHandle}</strong>{" "}
            {initial.coldStart && (
              <span className="tag">new account · onboarding</span>
            )}
          </p>
        ) : (
          <>
            <p className="muted">
              Connect your X account so the agent can post on your behalf.
            </p>
            <a className="btn" href="/api/x/connect">
              Connect X
            </a>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Content mode</h2>
        <div className="row">
          <button
            className={`btn ${mode === "AUTONOMOUS" ? "" : "secondary"}`}
            onClick={() => {
              setMode("AUTONOMOUS");
              void saveCampaign({ contentMode: "AUTONOMOUS" });
            }}
          >
            Autonomous
          </button>
          <button
            className={`btn ${mode === "USER_SUPPLIED" ? "" : "secondary"}`}
            onClick={() => {
              setMode("USER_SUPPLIED");
              void saveCampaign({ contentMode: "USER_SUPPLIED" });
            }}
          >
            From my content
          </button>
          <label className="row" style={{ marginLeft: "auto" }}>
            <input
              type="checkbox"
              checked={enabled}
              style={{ width: "auto" }}
              onChange={(e) => {
                setEnabled(e.target.checked);
                void saveCampaign({ enabled: e.target.checked });
              }}
            />
            <span className="muted">{enabled ? "Posting on" : "Paused"}</span>
          </label>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Autonomous: the agent sources ideas from your X timeline &amp; trends.
          From my content: it rewrites the raw posts you add below.
        </p>
      </div>

      {mode === "USER_SUPPLIED" && (
        <div className="panel">
          <h2>Content pool ({poolCount})</h2>
          <textarea
            rows={5}
            placeholder="One idea per line. The agent rewrites each into an on-voice post."
            value={pool}
            onChange={(e) => setPool(e.target.value)}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={addPool}>
              Add to pool
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Live pipeline</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          {initial.plannedPosts} posts planned · status {initial.status}
        </p>
        <div className="log" ref={logRef}>
          {log.length === 0 ? (
            <span className="muted">Waiting for activity…</span>
          ) : (
            log.map((l, i) => (
              <div key={i} className={l.kind === "plain" ? undefined : l.kind}>
                {l.text}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
