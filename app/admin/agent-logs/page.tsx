import { listAgentLogs } from "@/lib/agentLog";
import { hasDatabase } from "@/lib/db";

function jsonPreview(v: unknown): string {
  if (v === null || v === undefined) return "";
  try {
    const s = JSON.stringify(v);
    return s.length > 280 ? s.slice(0, 280) + "…" : s;
  } catch {
    return String(v);
  }
}

export default async function AgentLogsPage() {
  if (!hasDatabase()) {
    return (
      <div className="card">
        <div className="cardInner">
          <div style={{ fontWeight: 700 }}>Agent Logs</div>
          <div className="small" style={{ marginTop: 6 }}>
            Set <code>DATABASE_URL</code> to enable Postgres audit trail.
          </div>
        </div>
      </div>
    );
  }

  const logs = await listAgentLogs(250);

  return (
    <div className="row">
      <div className="card">
        <div className="cardInner">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700 }}>Agent Logs</div>
              <div className="small">Autonomy audit trail (latest first)</div>
            </div>
            <div className="pill">{logs.length} rows</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardInner" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "rgba(232,236,255,0.7)" }}>
                <th style={{ padding: "8px 6px" }}>Time</th>
                <th style={{ padding: "8px 6px" }}>User</th>
                <th style={{ padding: "8px 6px" }}>Feature</th>
                <th style={{ padding: "8px 6px" }}>Action</th>
                <th style={{ padding: "8px 6px" }}>Model</th>
                <th style={{ padding: "8px 6px" }}>OK</th>
                <th style={{ padding: "8px 6px" }}>ms</th>
                <th style={{ padding: "8px 6px" }}>Input</th>
                <th style={{ padding: "8px 6px" }}>Output</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid rgba(232,236,255,0.10)" }}>
                  <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 6px" }}>{r.user_id ?? ""}</td>
                  <td style={{ padding: "8px 6px" }}>{r.feature}</td>
                  <td style={{ padding: "8px 6px" }}>{r.action}</td>
                  <td style={{ padding: "8px 6px" }}>{r.model ?? ""}</td>
                  <td style={{ padding: "8px 6px" }}>
                    <span className="pill" style={{ borderColor: r.ok ? "rgba(86,227,193,0.35)" : "rgba(255,107,107,0.45)", background: r.ok ? "rgba(86,227,193,0.12)" : "rgba(255,107,107,0.12)" }}>
                      {r.ok ? "yes" : "no"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 6px" }}>{r.duration_ms ?? ""}</td>
                  <td style={{ padding: "8px 6px", maxWidth: 360 }}>
                    <code style={{ color: "rgba(232,236,255,0.85)" }}>{jsonPreview(r.input_json)}</code>
                  </td>
                  <td style={{ padding: "8px 6px", maxWidth: 360 }}>
                    <code style={{ color: "rgba(232,236,255,0.85)" }}>{jsonPreview(r.output_json)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

