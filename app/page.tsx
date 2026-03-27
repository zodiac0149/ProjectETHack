"use client";

import { useMemo, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────
type BriefingSection = {
  id: string;
  title: string;
  summary: string;
  classify: string;
  affect: string;
  benefit: string;
  personal?: string;
  keyPoints: string[];
  sourceAtomIds: string[];
};
type BriefingDoc = {
  title: string;
  query: string;
  generatedAt: string;
  sections: BriefingSection[];
};
type ArcPoint = { id: string; title: string; sentiment: number; label: string; emoji: string; summary: string; };
type StoryArc = { arc: ArcPoint[]; overallSentiment: number; narrativeSummary: string; };
type Language = "en" | "hi" | "ta" | "bn";
type ViewMode = "grid" | "layers" | "facts";

const LANG_LABELS: Record<Language, string> = { en: "🇬🇧 English", hi: "🇮🇳 Hindi", ta: "🇮🇳 Tamil", bn: "🇮🇳 Bengali" };

// ── Helpers ────────────────────────────────────────────────────
function normalizeBriefing(raw: BriefingDoc): BriefingDoc {
  return {
    ...raw,
    sections: (raw.sections || []).map((s, i) => ({
      ...s,
      id: s.id && s.id !== "undefined" && s.id.trim()
        ? s.id
        : `sec-${i}-${(s.title || "section").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
      keyPoints: Array.isArray(s.keyPoints) ? s.keyPoints : [],
      sourceAtomIds: Array.isArray(s.sourceAtomIds) ? s.sourceAtomIds : [],
    })),
  };
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.json().catch(() => ({ error: `HTTP ${r.status}` })); throw new Error((t as any).error || `HTTP ${r.status}`); }
  return r.json() as Promise<T>;
}

function sentimentColor(s: number) {
  if (s >= 1.5) return "#059669";
  if (s >= 0.5) return "#2563eb";
  if (s >= -0.5) return "#6b7280";
  if (s >= -1.5) return "#ea580c";
  return "#dc2626";
}
function sentimentPct(s: number) { return `${((s + 2) / 4) * 100}%`; }

// ── Component ──────────────────────────────────────────────────
export default function HomePage() {
  // Setup state
  const [workProfile, setWorkProfile] = useState("");
  const [query, setQuery] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [language, setLanguage] = useState<Language>("en");

  // Data
  const [doc, setDoc] = useState<BriefingDoc | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [criticIssues, setCriticIssues] = useState<string[] | null>(null);
  const [arc, setArc] = useState<StoryArc | null>(null);

  // Loading
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [audioLoading, setAudioLoading] = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [arcLoading, setArcLoading] = useState(false);
  const [translatingId, setTranslatingId] = useState<string | null>(null);

  // Errors & messages
  const [error, setError] = useState<string | null>(null);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);

  // UI state
  const [activePane, setActivePane] = useState<"briefing" | "arc">("briefing");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [followUpQ, setFollowUpQ] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState<string | null>(null);
  const [translateCache, setTranslateCache] = useState<Record<string, string>>({});
  const [warnDismissed, setWarnDismissed] = useState(false);
  const [warnExpanded, setWarnExpanded] = useState(false);

  const activeSection = useMemo(
    () => (doc && activeSectionId ? doc.sections.find(s => s.id === activeSectionId) ?? null : null),
    [doc, activeSectionId]
  );

  const getField = useCallback((section: BriefingSection, key: "summary" | "classify" | "affect" | "benefit" | "personal") => {
    const raw = section[key] || "";
    if (language === "en") return raw;
    return translateCache[`${language}:${section.id}:${key}`] || raw;
  }, [language, translateCache]);

  const translateSection = useCallback(async (section: BriefingSection) => {
    if (language === "en") return;
    setTranslatingId(section.id);
    try {
      for (const key of ["summary", "classify", "affect", "benefit", "personal"] as const) {
        const text = section[key];
        if (!text) continue;
        const cacheKey = `${language}:${section.id}:${key}`;
        if (translateCache[cacheKey]) continue;
        const res = await postJSON<{ translated: string }>("/api/translate", { text, targetLanguage: language });
        setTranslateCache(prev => ({ ...prev, [cacheKey]: res.translated }));
      }
    } catch { /* silent */ }
    finally { setTranslatingId(null); }
  }, [language, translateCache]);

  const translateArc = useCallback(async (arcData: StoryArc) => {
    if (language === "en") return;
    try {
      // Translate narrative
      if (arcData.narrativeSummary) {
        const text = arcData.narrativeSummary;
        const cacheKey = `${language}:arc:narrative`;
        if (!translateCache[cacheKey]) {
          const res = await postJSON<{ translated: string }>("/api/translate", { text, targetLanguage: language });
          setTranslateCache(prev => ({ ...prev, [cacheKey]: res.translated }));
        }
      }
      // Translate each point
      for (const pt of arcData.arc) {
        for (const key of ["title", "label", "summary"] as const) {
          const text = pt[key];
          if (!text) continue;
          const cacheKey = `${language}:arc:${pt.id}:${key}`;
          if (translateCache[cacheKey]) continue;
          const res = await postJSON<{ translated: string }>("/api/translate", { text, targetLanguage: language });
          setTranslateCache(prev => ({ ...prev, [cacheKey]: res.translated }));
        }
      }
    } catch { /* silent */ }
  }, [language, translateCache]);

  // ── Actions ────────────────────────────────────────────────
  async function generateBriefing() {
    setLoading(true); setError(null); setDoc(null);
    setActiveSectionId(null); setCriticIssues(null);
    setFollowUpAnswer(null); setArc(null);
    try {
      const resp = await fetch("/api/briefing/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, workProfile, topK: 28 }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (resp.status === 422 && data.draft) {
          const n = normalizeBriefing(data.draft as BriefingDoc);
          setDoc(n); setActiveSectionId(n.sections[0]?.id ?? null);
          setCriticIssues(data.critic?.issues || ["Potential inaccuracies detected."]);
        } else throw new Error(data.error || "Synthesis failed");
      } else {
        const n = normalizeBriefing(data as BriefingDoc);
        setDoc(n); setActiveSectionId(n.sections[0]?.id ?? null);
      }
      setActivePane("briefing");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }

  async function ingestUrl() {
    if (!articleUrl) return;
    setIngesting(true); setError(null); setIngestMsg(null);
    try {
      const res = await postJSON<{ title: string; atoms_added: number }>("/api/ingest/url", { url: articleUrl });
      setIngestMsg(`✅ "${res.title}" — ${res.atoms_added} facts added`);
      setArticleUrl("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setIngesting(false); }
  }

  async function playAudio(text: string, id: string) {
    setAudioLoading(id);
    try {
      const resp = await fetch("/api/audio/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!resp.ok) {
        // ElevenLabs failed — fall back to browser speech synthesis
        console.warn("ElevenLabs unavailable, using browser TTS");
        const utter = new SpeechSynthesisUtterance(text.slice(0, 1000));
        utter.rate = 1.0; 
        utter.pitch = 1;
        
        // Map language to browser locale
        const langMap: Record<string, string> = { hi: "hi-IN", ta: "ta-IN", bn: "bn-IN", en: "en-US" };
        utter.lang = langMap[language] || "en-US";
        
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
        return;
      }
      const blob = await resp.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      await audio.play().catch(() => {
        // Autoplay blocked — try speech synthesis
        const utter = new SpeechSynthesisUtterance(text.slice(0, 1000));
        const langMap: Record<string, string> = { hi: "hi-IN", ta: "ta-IN", bn: "bn-IN", en: "en-US" };
        utter.lang = langMap[language] || "en-US";
        window.speechSynthesis.speak(utter);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audio generation failed");
    }
    finally { setAudioLoading(null); }
  }


  async function askFollowUp() {
    if (!followUpQ.trim() || !activeSection) return;
    setFollowUpLoading(true); setFollowUpAnswer(null);
    try {
      const context = [activeSection.classify, activeSection.affect, activeSection.benefit, activeSection.personal, ...(activeSection.keyPoints || [])].filter(Boolean).join(". ");
      const res = await postJSON<{ answer: string }>("/api/briefing/followup", {
        question: followUpQ, sectionTitle: activeSection.title, sectionContext: context, workProfile,
      });
      setFollowUpAnswer(res.answer);
    } catch (e) { setFollowUpAnswer(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setFollowUpLoading(false); }
  }

  async function loadStoryArc() {
    if (!doc) return;
    setArcLoading(true);
    try {
      const res = await postJSON<StoryArc>("/api/story-arc", {
        sections: doc.sections.map(s => ({ id: s.id, title: s.title, classify: s.classify, affect: s.affect, benefit: s.benefit, personal: s.personal })),
      });
      setArc(res); setActivePane("arc");
      if (language !== "en") translateArc(res);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setArcLoading(false); }
  }

  function handleSectionClick(section: BriefingSection) {
    setActiveSectionId(section.id);
    setFollowUpAnswer(null); setFollowUpQ("");
    if (language !== "en") translateSection(section);
  }

  // ── Render helpers ────────────────────────────────────────
  function renderGrid(s: BriefingSection) {
    return (
      <div className="output-grid">
        <div className="layer-box lb-classify">
          <span className="lbox-icon">🔍</span>
          <span className="lbox-label">Classify — What is this?</span>
          <p className="lbox-text">{getField(s, "classify")}</p>
        </div>
        <div className="layer-box lb-affect">
          <span className="lbox-icon">📊</span>
          <span className="lbox-label">Affect — Who is impacted?</span>
          <p className="lbox-text">{getField(s, "affect")}</p>
        </div>
        <div className="layer-box lb-benefit">
          <span className="lbox-icon">🚀</span>
          <span className="lbox-label">Benefit — Who wins & how?</span>
          <p className="lbox-text">{getField(s, "benefit")}</p>
        </div>
        <div className="layer-box lb-personal">
          <span className="lbox-icon">👤</span>
          <span className="lbox-label">For {workProfile || "You"}</span>
          <p className="lbox-text">{getField(s, "personal") || "Analyzing relevance to your profile…"}</p>
        </div>
      </div>
    );
  }

  function renderLayers(s: BriefingSection) {
    const layers = [
      { cls: "ls-classify", icon: "🔍", label: "Classify — What is this?", text: getField(s, "classify") },
      { cls: "ls-affect",   icon: "📊", label: "Affect — Who is impacted?", text: getField(s, "affect") },
      { cls: "ls-benefit",  icon: "🚀", label: "Benefit — Who wins?",       text: getField(s, "benefit") },
      { cls: "ls-personal", icon: "👤", label: `For ${workProfile || "You"}`, text: getField(s, "personal") || "Analyzing relevance to your profile…" },
    ];
    return (
      <div className="output-layers">
        {layers.map(l => (
          <div key={l.cls} className={`layer-strip ${l.cls}`}>
            <div className="layer-strip-tab" />
            <div className="layer-strip-icon">{l.icon}</div>
            <div className="layer-strip-body">
              <div className="layer-strip-label">{l.label}</div>
              <div className="layer-strip-text">{l.text}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderFacts(s: BriefingSection) {
    // Key facts mode: all analysis + key points as chips
    const factLines = [
      { bullet: "🔍", label: "Classify", text: getField(s, "classify") },
      { bullet: "📊", label: "Affect",   text: getField(s, "affect") },
      { bullet: "🚀", label: "Benefit",  text: getField(s, "benefit") },
      { bullet: "👤", label: `For You`,  text: getField(s, "personal") || "" },
    ].filter(f => f.text);

    return (
      <div className="facts-module">
        <div className="facts-header">
          <span style={{ fontSize: "16px" }}>💡</span>
          <span className="facts-header-title">Key Intelligence Summary</span>
          <span className="facts-count">{s.keyPoints.length + factLines.length} facts</span>
        </div>
        <div className="facts-grid">
          {factLines.map((f, i) => (
            <div key={i} className="fact-chip">
              <div style={{ fontSize: "14px", flexShrink: 0 }}>{f.bullet}</div>
              <div>
                <div style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", marginBottom: "2px" }}>{f.label}</div>
                <div className="fact-text">{f.text}</div>
              </div>
            </div>
          ))}
          {s.keyPoints.map((kp, i) => (
            <div key={`kp-${i}`} className="fact-chip">
              <div className="fact-bullet" style={{ marginTop: "6px" }} />
              <div className="fact-text">{kp}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── JSX ────────────────────────────────────────────────────
  return (
    <div className="app-shell">

      {/* ══ TOP BAR ══════════════════════════════════════════ */}
      <header className="app-topbar">
        <div className="brand-wrap">
          <div className="brand-icon">📰</div>
          <span className="brand-name">NewsNavigator</span>
          <span className="brand-chip">AI</span>
        </div>

        <div className="topbar-divider" />

        {doc && (
          <>
            <span className="topbar-pill">📄 {doc.sections.length} sections</span>
            <span className="topbar-pill" style={{ borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.1)", color: "#34d399" }}>
              ✓ Briefing ready
            </span>
          </>
        )}

        <div className="topbar-right">
          <select
            className="tb-select"
            value={language}
            onChange={e => { setLanguage(e.target.value as Language); }}
          >
            {(Object.keys(LANG_LABELS) as Language[]).map(l => (
              <option key={l} value={l}>{LANG_LABELS[l]}</option>
            ))}
          </select>

          {doc && (
            <button className={`tb-btn ${activePane === "arc" ? "active" : ""}`} onClick={() => {
              if (arc) {
                setActivePane("arc");
                if (language !== "en") translateArc(arc);
              } else {
                loadStoryArc();
              }
            }} disabled={arcLoading} id="arc-btn">
              {arcLoading ? <span className="spin" /> : "📈"} Story Arc
            </button>
          )}
        </div>
      </header>

      {/* ══ SIDEBAR ══════════════════════════════════════════ */}
      <aside className="app-sidebar">

        {/* Profile */}
        <div className="sidebar-section" style={{ paddingTop: "20px" }}>
          <div className="sidebar-label">Your Profile</div>
          <div className="sb-field">
            <label>Work Role</label>
            <input className="sb-input" value={workProfile} onChange={e => setWorkProfile(e.target.value)} placeholder="e.g. Tax Lawyer, Startup Founder" />
          </div>
          <div className="sb-field" style={{ marginBottom: "14px" }}>
            <label>Intelligence Query</label>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <input className="sb-input" style={{ flex: 1 }} value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. How does the budget affect AI startups?" onKeyDown={e => e.key === "Enter" && !loading && generateBriefing()} />
              {query && (
                <button onClick={() => setQuery("")} title="Clear" style={{ background: "none", border: "none", color: "rgba(200,212,240,0.4)", cursor: "pointer", fontSize: "16px", padding: "0 4px", lineHeight: 1 }}>✕</button>
              )}
            </div>
          </div>
          <button className="btn-generate" onClick={generateBriefing} disabled={loading} id="generate-btn">
            {loading ? <><span className="spin" style={{ borderTopColor: "#fff" }} /> Synthesizing…</> : "🧠 Generate Briefing"}
          </button>
        </div>

        {/* Library */}
        <div className="sidebar-section" style={{ paddingTop: "18px" }}>
          <div className="sidebar-label">Expand Library</div>
          <div className="sb-field">
            <label>Article URL</label>
            <input className="sb-input" value={articleUrl} onChange={e => setArticleUrl(e.target.value)} placeholder="https://economictimes.indiatimes.com/…" onKeyDown={e => e.key === "Enter" && ingestUrl()} />
          </div>
          <button className="btn-ingest" onClick={ingestUrl} disabled={ingesting} id="ingest-btn">
            {ingesting ? <><span className="spin" style={{ borderTopColor: "#34d399" }} /> Scraping…</> : "＋ Add to Library"}
          </button>
          {ingestMsg && <p style={{ marginTop: "8px", fontSize: "11.5px", color: "#34d399", lineHeight: "1.5" }}>{ingestMsg}</p>}
        </div>

        {/* Sections */}
        {doc && (
          <div className="sidebar-section" style={{ paddingTop: "18px", flex: 1 }}>
            <div className="sidebar-label">Sections</div>
            <div className="sb-section-list">
              {doc.sections.map((s, i) => (
                <button key={s.id} className={`sb-sec-btn ${activeSectionId === s.id ? "active" : ""}`} onClick={() => handleSectionClick(s)} id={`sec-${s.id}`}>
                  <span className="sb-sec-num">{i + 1}</span>
                  <span style={{ lineHeight: "1.4" }}>
                    {s.title}
                    {translatingId === s.id && <span style={{ display: "block", fontSize: "10px", color: "rgba(200,212,240,0.4)", marginTop: "2px" }}><span className="spin" style={{ width: "10px", height: "10px", borderWidth: "1.5px" }} /> translating…</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sidebar-spacer" />
        <div className="sidebar-footer">
          NewsNavigator AI · {doc ? doc.sections.length + " sections" : "Ready"}
        </div>
      </aside>

      {/* ══ MAIN ══════════════════════════════════════════════ */}
      <main className="app-main">

        {/* ── Analyst warning banner — sits above sticky page-header ── */}
        {criticIssues && !warnDismissed && (
          <div style={{
            background: "#fffbeb", borderBottom: "1px solid #fde68a",
            padding: "10px 20px", display: "flex", alignItems: "flex-start",
            gap: "10px", fontSize: "13px", color: "#92400e", lineHeight: "1.5",
          }}>
            <span style={{ fontSize: "16px", flexShrink: 0 }}>⚠️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>Analyst flagged:</strong>{" "}
              {warnExpanded
                ? criticIssues.join(". ")
                : (criticIssues[0]?.slice(0, 120) + (criticIssues[0]?.length > 120 || criticIssues.length > 1 ? "…" : ""))}
              {(criticIssues.join(". ").length > 120) && (
                <button
                  onClick={() => setWarnExpanded(e => !e)}
                  style={{ marginLeft: "6px", background: "none", border: "none", color: "#b45309", fontWeight: 700, cursor: "pointer", fontSize: "12px", textDecoration: "underline", padding: 0 }}
                >
                  {warnExpanded ? "Show less" : "Show details"}
                </button>
              )}
            </div>
            <button
              onClick={() => setWarnDismissed(true)}
              style={{ background: "none", border: "none", color: "#92400e", cursor: "pointer", fontSize: "18px", lineHeight: 1, flexShrink: 0, padding: "0 2px", opacity: 0.6 }}
              title="Dismiss"
            >✕</button>
          </div>
        )}

        {doc && activePane === "briefing" && activeSection && (
          <div className="page-header">
            <div>
              <div className="page-title">{activeSection.title}</div>
              <div className="page-subtitle">{doc.title} · {new Date(doc.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
            <div className="header-actions">
              {/* View mode */}
              <div className="view-tabs">
                <button className={`view-tab ${viewMode === "grid" ? "active" : ""}`} onClick={() => setViewMode("grid")}>⊞ Grid</button>
                <button className={`view-tab ${viewMode === "layers" ? "active" : ""}`} onClick={() => setViewMode("layers")}>≡ Layers</button>
                <button className={`view-tab ${viewMode === "facts" ? "active" : ""}`} onClick={() => setViewMode("facts")}>💡 Key Facts</button>
              </div>
              {/* Audio */}
              <button
                className="btn btn-green btn-sm"
                disabled={audioLoading === activeSection.id}
                id={`audio-${activeSection.id}`}
                onClick={() => playAudio(
                  getField(activeSection, "summary") || `${getField(activeSection, "classify")}. ${getField(activeSection, "affect")}. ${getField(activeSection, "benefit")}.`,
                  activeSection.id
                )}
              >
                {audioLoading === activeSection.id ? <><span className="spin" /> Loading…</> : "🔊 Read Aloud"}
              </button>
            </div>
          </div>
        )}

        {doc && activePane === "arc" && (
          <div className="page-header">
            <div>
              <div className="page-title">📈 Story Arc — Sentiment Timeline</div>
              <div className="page-subtitle">{doc.title}</div>
            </div>
            <div className="header-actions">
              <button className="btn btn-outline btn-sm" onClick={() => setActivePane("briefing")}>← Back to Briefing</button>
              <span className={`badge ${arc && arc.overallSentiment >= 0.5 ? "badge-green" : arc && arc.overallSentiment <= -0.5 ? "badge-orange" : "badge-gray"}`}>
                {arc ? `Overall ${arc.overallSentiment > 0 ? "+" : ""}${arc.overallSentiment.toFixed(1)}` : "Building…"}
              </span>
            </div>
          </div>
        )}

        <div className="main-body">

          {/* Errors */}
          {error && <div className="alert alert-error anim-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", opacity: 0.6, flexShrink: 0 }}>✕</button>
          </div>}

          {/* ── Empty / Loading ── */}
          {!doc && !loading && (
            <div className="empty-state anim-in">
              <div className="empty-icon">📡</div>
              <div className="empty-title">Your Personalized Newsroom</div>
              <p className="empty-sub">Enter your work role and query in the sidebar, then generate a deep-dive AI briefing tailored to your career.</p>
            </div>
          )}

          {loading && (
            <div className="empty-state anim-in">
              <div style={{ fontSize: "52px", marginBottom: "16px" }}>⚙️</div>
              <div className="empty-title">Synthesizing Intelligence Briefing…</div>
              <p className="empty-sub">Routing atoms → generating sections → running critic check</p>
            </div>
          )}

          {/* ── BRIEFING PANE ── */}
          {doc && !loading && activePane === "briefing" && (
            <div className="anim-in">
              {activeSection ? (
                <>
                  {/* Executive Summary */}
                  {activeSection.summary && (
                    <div className="card card-pad" style={{ marginBottom: "20px", borderLeft: "4px solid #3b82f6", background: "#f8faff" }}>
                      <div style={{ fontSize: "10px", fontWeight: 800, color: "#3b82f6", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>📋 Executive Summary</div>
                      <div style={{ fontSize: "15px", lineHeight: "1.6", color: "#1e293b", fontWeight: 500 }}>
                        {getField(activeSection, "summary")}
                      </div>
                    </div>
                  )}

                  {/* Analysis Output — view mode dependent */}
                  {viewMode === "grid"   && renderGrid(activeSection)}
                  {viewMode === "layers" && renderLayers(activeSection)}
                  {viewMode === "facts"  && renderFacts(activeSection)}

                  {/* Key points (grid + layers modes) */}
                  {viewMode !== "facts" && activeSection.keyPoints.length > 0 && (
                    <div className="card card-pad" style={{ marginBottom: "16px" }}>
                      <div className="card-header" style={{ marginBottom: "12px" }}>
                        <span className="card-title">💡 Key Details</span>
                        <span className="badge badge-blue">{activeSection.keyPoints.length} points</span>
                      </div>
                      <div className="facts-grid">
                        {activeSection.keyPoints.map((kp, i) => (
                          <div key={i} className="fact-chip">
                            <div className="fact-bullet" style={{ marginTop: "6px" }} />
                            <div className="fact-text">{kp}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow-up Q&A */}
                  <div className="followup-module">
                    <div className="followup-header">
                      <span>💬</span> Ask a Follow-up Question
                    </div>
                    <div className="followup-row">
                      <input
                        className="followup-input"
                        value={followUpQ}
                        onChange={e => setFollowUpQ(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && askFollowUp()}
                        placeholder={`Ask anything about "${activeSection.title}"…`}
                        id="followup-input"
                      />
                      {followUpQ && (
                        <button onClick={() => setFollowUpQ("")} title="Clear" style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "16px", padding: "0 4px", lineHeight: 1 }}>✕</button>
                      )}
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={askFollowUp}
                        disabled={followUpLoading || !followUpQ.trim()}
                        id="followup-btn"
                      >
                        {followUpLoading ? <span className="spin" style={{ borderTopColor: "#fff" }} /> : "Ask →"}
                      </button>
                    </div>
                    {followUpAnswer && (
                      <div className="followup-answer">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                          <div style={{ fontSize: "10px", fontWeight: 800, color: "#1e40af", letterSpacing: "0.07em", textTransform: "uppercase" }}>🤖 AI Analysis</div>
                          <button onClick={() => setFollowUpAnswer(null)} title="Clear answer" style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "14px", lineHeight: 1, padding: 0 }}>✕</button>
                        </div>
                        {followUpAnswer}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon" style={{ fontSize: "40px" }}>👈</div>
                  <p className="empty-sub">Select a section from the sidebar to begin your deep-dive.</p>
                </div>
              )}
            </div>
          )}

          {/* ── STORY ARC PANE ── */}
          {doc && !loading && activePane === "arc" && (
            <div className="anim-in">
              {arcLoading && (
                <div className="empty-state">
                  <div style={{ fontSize: "42px", marginBottom: "12px" }}>🔄</div>
                  <p className="empty-sub">Building sentiment timeline…</p>
                </div>
              )}
              {!arcLoading && arc && (
                <div className="card card-pad">
                  <div className="arc-container">
                    {arc.arc.map(pt => (
                      <div key={pt.id} className="arc-row" onClick={() => { setActiveSectionId(pt.id); setActivePane("briefing"); }}>
                        <div className="arc-emoji">{pt.emoji}</div>
                        <div className="arc-info">
                          <div className="arc-row-title">{translateCache[`${language}:arc:${pt.id}:title`] || pt.title}</div>
                          <div className="arc-row-label" style={{ color: sentimentColor(pt.sentiment) }}>
                            {translateCache[`${language}:arc:${pt.id}:label`] || pt.label}
                          </div>
                          <div className="arc-row-summary">{translateCache[`${language}:arc:${pt.id}:summary`] || pt.summary}</div>
                        </div>
                        <div>
                          <div className="arc-bar-wrap">
                            <div className="arc-bar" style={{ width: sentimentPct(pt.sentiment), background: sentimentColor(pt.sentiment) }} />
                          </div>
                          <div style={{ fontSize: "10px", textAlign: "right", color: "#9ca3af", marginTop: "3px", fontWeight: 600 }}>
                            {pt.sentiment > 0 ? "+" : ""}{pt.sentiment.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {arc.narrativeSummary && <div className="arc-narrative">"{translateCache[`${language}:arc:narrative`] || arc.narrativeSummary}"</div>}
                </div>
              )}
              {!arcLoading && !arc && (
                <div className="empty-state">
                  <div className="empty-icon">📈</div>
                  <p className="empty-sub">Click the "Story Arc" button in the top bar to build the sentiment timeline.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
