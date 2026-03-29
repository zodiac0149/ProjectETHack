"use client";

import { useMemo, useState, useCallback } from "react";

type ChartData = { title: string; data: { label: string; value: number; unit?: string }[]; };
type ActionPlan = { impact: string; preparation: string[]; };
type BriefingSection = {
  id: string;
  title: string;
  summary: string;
  points: string[];
  chart?: ChartData;
  sourceAtomIds: string[];
};
type BriefingDoc = {
  title: string;
  query: string;
  generatedAt: string;
  personal?: string;
  actionPlan?: ActionPlan;
  sections: BriefingSection[];
};
type ArcPoint = { id: string; title: string; sentiment: number; label: string; emoji: string; summary: string; };
type StoryArc = { arc: ArcPoint[]; overallSentiment: number; narrativeSummary: string; };
type Language = "en" | "hi" | "ta" | "bn";
type ViewMode = "grid" | "layers" | "facts";

const LANG_LABELS: Record<Language, string> = { en: "🇬🇧 English", hi: "🇮🇳 Hindi", ta: "🇮🇳 Tamil", bn: "🇮🇳 Bengali" };

function normalizeBriefing(raw: BriefingDoc): BriefingDoc {
  return {
    ...raw,
    sections: (raw.sections || []).map((s, i) => ({
      ...s,
      id: s.id && s.id !== "undefined" && s.id.trim()
        ? s.id
        : `sec-${i}-${(s.title || "section").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
      points: Array.isArray((s as any).points) ? (s as any).points : (Array.isArray((s as any).keyPoints) ? (s as any).keyPoints : []),
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

export default function HomePage() {
  
  const [userPersona, setUserPersona] = useState("");
  const [query, setQuery] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [language, setLanguage] = useState<Language>("en");

  const [doc, setDoc] = useState<BriefingDoc | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [criticIssues, setCriticIssues] = useState<string[] | null>(null);
  const [arc, setArc] = useState<StoryArc | null>(null);

  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [audioLoading, setAudioLoading] = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [arcLoading, setArcLoading] = useState(false);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [isTranslatingAll, setIsTranslatingAll] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);

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

  const getField = useCallback((section: BriefingSection, key: "summary") => {
    const raw = section[key] || "";
    if (language === "en") return raw;
    return translateCache[`${language}:${section.id}:${key}`] || raw;
  }, [language, translateCache]);

  const getDocPersonal = useCallback(() => {
    const raw = doc?.personal || "";
    if (language === "en") return raw;
    return translateCache[`${language}:doc:personal`] || raw;
  }, [language, translateCache, doc]);

  const getActionPlanImpact = useCallback(() => {
    const raw = doc?.actionPlan?.impact || "";
    if (language === "en") return raw;
    return translateCache[`${language}:doc:actionPlan:impact`] || raw;
  }, [language, translateCache, doc]);

  const getActionPlanPrep = useCallback((idx: number) => {
    const raw = doc?.actionPlan?.preparation?.[idx] || "";
    if (language === "en") return raw;
    return translateCache[`${language}:doc:actionPlan:prep:${idx}`] || raw;
  }, [language, translateCache, doc]);

  const translateSection = useCallback(async (section: BriefingSection) => {
    if (language === "en") return;
    setTranslatingId(section.id);
    try {
      for (const key of ["summary"] as const) {
        const text = section[key];
        if (!text) continue;
        const cacheKey = `${language}:${section.id}:${key}`;
        if (translateCache[cacheKey]) continue;
        const res = await postJSON<{ translated: string }>("/api/translate", { text, targetLanguage: language });
        setTranslateCache(prev => ({ ...prev, [cacheKey]: res.translated }));
      }

      if (section.points && Array.isArray(section.points)) {
        for (let i = 0; i < section.points.length; i++) {
          const pt = section.points[i];
          const cacheKey = `${language}:${section.id}:point:${i}`;
          if (!pt || translateCache[cacheKey]) continue;
          const res = await postJSON<{ translated: string }>("/api/translate", { text: pt, targetLanguage: language });
          setTranslateCache(prev => ({ ...prev, [cacheKey]: res.translated }));
        }
      }
    } catch 
    finally { setTranslatingId(null); }
  }, [language, translateCache]);

  const translateDocument = useCallback(async () => {
    if (!doc || language === "en") return;
    setIsTranslatingAll(true);
    try {
      const promises: Promise<void>[] = [];
      const translateToCache = async (text: string, cacheKey: string) => {
        if (!text || translateCache[cacheKey] || typeof text !== "string") return;
        try {
          const res = await postJSON<{ translated: string }>("/api/translate", { text, targetLanguage: language });
          setTranslateCache(prev => ({ ...prev, [cacheKey]: res.translated }));
        } catch {}
      };

      if (doc.personal) promises.push(translateToCache(doc.personal, `${language}:doc:personal`));
      if (doc.actionPlan?.impact) promises.push(translateToCache(doc.actionPlan.impact, `${language}:doc:actionPlan:impact`));
      
      if (doc.actionPlan?.preparation) {
        doc.actionPlan.preparation.forEach((step, i) => {
          promises.push(translateToCache(step, `${language}:doc:actionPlan:prep:${i}`));
        });
      }

      await Promise.all(promises);
      await Promise.all(doc.sections.map(s => translateSection(s)));
      
    } finally {
      setIsTranslatingAll(false);
    }
  }, [doc, language, translateCache, translateSection]);

  const translateArc = useCallback(async (arcData: StoryArc) => {
    if (language === "en") return;
    try {
      
      if (arcData.narrativeSummary) {
        const text = arcData.narrativeSummary;
        const cacheKey = `${language}:arc:narrative`;
        if (!translateCache[cacheKey]) {
          const res = await postJSON<{ translated: string }>("/api/translate", { text, targetLanguage: language });
          setTranslateCache(prev => ({ ...prev, [cacheKey]: res.translated }));
        }
      }
      
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
    } catch 
  }, [language, translateCache]);

  async function generateBriefing() {
    setLoading(true); setError(null); setDoc(null);
    setActiveSectionId(null); setCriticIssues(null);
    setFollowUpAnswer(null); setArc(null);
    try {
      const resp = await fetch("/api/briefing/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, userPersona, topK: 28 }),
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
        
        console.warn("ElevenLabs unavailable, using browser TTS");
        const utter = new SpeechSynthesisUtterance(text.slice(0, 1000));
        utter.rate = 1.0; 
        utter.pitch = 1;

        const langMap: Record<string, string> = { hi: "hi-IN", ta: "ta-IN", bn: "bn-IN", en: "en-US" };
        utter.lang = langMap[language] || "en-US";
        
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
        return;
      }
      const blob = await resp.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      await audio.play().catch(() => {
        
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
      const context = [activeSection.summary, ...(activeSection.points || [])].filter(Boolean).join(". ");
      const res = await postJSON<{ answer: string }>("/api/briefing/followup", {
        question: followUpQ, sectionTitle: activeSection.title, sectionContext: context, userPersona,
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
        sections: doc.sections.map(s => ({ id: s.id, title: s.title, summary: s.summary })),
      });
      setArc(res); setActivePane("arc");
      if (language !== "en") translateArc(res);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setArcLoading(false); }
  }

  function scrollToSection(id: string) {
    const el = document.getElementById(`doc-sec-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSectionId(id);
    setFollowUpAnswer(null); setFollowUpQ("");
    const section = doc?.sections.find(s => s.id === id);
    if (section && language !== "en") translateSection(section);
  }

  function renderChart(chart?: ChartData) {
    if (!chart || !chart.data || chart.data.length === 0) return null;
    const maxVal = Math.max(...chart.data.map(d => d.value));
    return (
      <div className="v-chart-wrap" style={{ marginTop: "16px", marginBottom: "16px", padding: "16px", background: "linear-gradient(to bottom right, #f8fafc, #f1f5f9)", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        <h4 style={{ fontSize: "11px", fontWeight: 800, color: "#475569", marginBottom: "16px", letterSpacing: "0.08em", textTransform: "uppercase" }}>📊 {chart.title}</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {chart.data.map((d, i) => {
            const pct = maxVal > 0 ? (d.value / maxVal) * 100 : 0;
            return (
              <div key={i} className="v-chart-row" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "95px", fontSize: "12px", color: "#64748b", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={d.label}>{d.label}</div>
                <div style={{ flex: 1, height: "12px", background: "#e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
                  <div className="v-chart-bar" style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #3b82f6, #2dd4bf)", borderRadius: "6px", transition: "width 0.8s ease-out" }} />
                </div>
                <div style={{ width: "45px", fontSize: "12px", color: "#0f172a", fontWeight: 800, textAlign: "right" }}>{d.value}{d.unit || ""}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderCareerPoints(s: BriefingSection) {
    return (
      <div className="career-intelligence-pod">
        <div className="career-point-list">
          {(s.points || []).map((point, idx) => (
            <div key={idx} className="career-point-item">
              <div className="career-point-bullet" />
              <div className="career-point-text">
                {language === "en" ? point.replace(/^[-*•\s]+/, "") : (translateCache[`${language}:${s.id}:point:${idx}`] || point).replace(/^[-*•\s]+/, "")}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">

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
          {doc && language !== "en" && (
            <button className="tb-btn" onClick={translateDocument} disabled={isTranslatingAll}>
              {isTranslatingAll ? "Translating..." : "OK"}
            </button>
          )}

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

      <aside className="app-sidebar">

        <div className="sidebar-section" style={{ paddingTop: "20px" }}>
          <div className="sidebar-label">Your Profile</div>
          <div className="sb-field">
            <label>User Persona</label>
            <input className="sb-input" value={userPersona} onChange={e => setUserPersona(e.target.value)} placeholder="e.g. 45-year-old CFO" />
            <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
              <button className="pill-preset" onClick={() => setUserPersona("45-year-old CFO tracking macro policy")}>45yo CFO</button>
              <button className="pill-preset" onClick={() => setUserPersona("24-year-old first-generation investor")}>24yo Investor</button>
            </div>
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

        {doc && (
          <div className="sidebar-section" style={{ paddingTop: "18px", flex: 1 }}>
            <div className="sidebar-label">Sections</div>
            <div className="sb-section-list">
              {doc.sections.map((s, i) => (
                <button key={s.id} className={`sb-sec-btn ${activeSectionId === s.id ? "active" : ""}`} onClick={() => scrollToSection(s.id)} id={`sec-${s.id}`}>
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

      <main className="app-main">

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

        {doc && activePane === "briefing" && (
          <div className="page-header">
            <div>
              <div className="page-title">{doc.title}</div>
              <div className="page-subtitle">Unified Briefing · {new Date(doc.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
            <div className="header-actions">

              <button
                className="btn btn-green btn-sm"
                onClick={() => {
                   const fullText = doc.sections.map(s => getField(s, "summary") + " " + (s.points || []).join(". ")).join(" ");
                   playAudio(fullText, "full-doc");
                }}
              >
                {audioLoading === "full-doc" ? <><span className="spin" /> Loading…</> : "🔊 Read Full Briefing"}
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

          {error && <div className="alert alert-error anim-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", opacity: 0.6, flexShrink: 0 }}>✕</button>
          </div>}

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

          {doc && !loading && activePane === "briefing" && (
            <div className="anim-in document-container">
              {doc.sections.map((section, secIdx) => (
                <div key={section.id} id={`doc-sec-${section.id}`} className="doc-section" style={{ marginBottom: "40px", paddingBottom: "32px", borderBottom: secIdx < doc.sections.length - 1 ? "1px solid #e5e7eb" : "none" }}>
                  <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: "#3b82f6", opacity: 0.8 }}>#</span> {section.title}
                  </h2>

                  {section.summary && (
                    <div className="card card-pad" style={{ marginBottom: "20px", borderLeft: "4px solid #3b82f6", background: "#f8faff" }}>
                      <div style={{ fontSize: "10px", fontWeight: 800, color: "#3b82f6", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>📋 Angle Summary</div>
                      <div style={{ fontSize: "15px", lineHeight: "1.6", color: "#1e293b", fontWeight: 500 }}>
                        {getField(section, "summary")}
                      </div>
                    </div>
                  )}

                  {renderChart(section.chart)}

                  {renderCareerPoints(section)}
                </div>
              ))}

              {(doc.personal || doc.actionPlan) && (
                <div className="global-personal-box" style={{ background: "linear-gradient(135deg, #fffbeb, #fef3c7)", border: "1px solid #fde68a", padding: "24px", borderRadius: "12px", marginBottom: "40px", boxShadow: "0 4px 20px rgba(217, 119, 6, 0.08)" }}>
                   <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                     <span style={{ fontSize: "24px" }}>🎯</span>
                     <h3 style={{ fontSize: "15px", fontWeight: 800, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Executive Conclusion for {userPersona || "You"}</h3>
                   </div>
                   {doc.personal && (
                     <div style={{ fontSize: "16px", lineHeight: "1.7", color: "#78350f", fontWeight: 500, fontStyle: "italic", marginBottom: doc.actionPlan ? "20px" : "0" }}>
                       {getDocPersonal()}
                     </div>
                   )}
                   
                   {doc.actionPlan && (
                     <div style={{ marginTop: "16px", padding: "24px", background: "#fff", borderRadius: "8px", border: "1px solid #fcd34d", boxShadow: "0 2px 10px rgba(217, 119, 6, 0.03)" }}>
                       <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                         <span style={{ fontSize: "18px" }}>⚡</span>
                         <h4 style={{ fontSize: "14px", fontWeight: 800, color: "#92400e", letterSpacing: "0.05em", textTransform: "uppercase", margin: 0 }}>Strategic Action Plan</h4>
                       </div>

                       {doc.actionPlan.impact && (
                         <div style={{ marginBottom: "20px" }}>
                           <div style={{ fontSize: "11px", fontWeight: 800, color: "#b45309", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>How This Affects You</div>
                           <div style={{ fontSize: "15px", color: "#78350f", lineHeight: "1.6", fontWeight: 500 }}>{getActionPlanImpact()}</div>
                         </div>
                       )}

                       {doc.actionPlan.preparation && doc.actionPlan.preparation.length > 0 && (
                         <div>
                           <div style={{ fontSize: "11px", fontWeight: 800, color: "#b45309", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>How To Prepare & Act</div>
                           <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                             {doc.actionPlan.preparation.map((step, i) => (
                               <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", background: "#fefce8", padding: "10px 14px", borderRadius: "6px", border: "1px solid #fef08a" }}>
                                 <div style={{ color: "#d97706", marginTop: "1px", fontSize: "16px" }}>✓</div>
                                 <div style={{ fontSize: "14.5px", color: "#92400e", fontWeight: 600, lineHeight: "1.5" }}>{getActionPlanPrep(i)}</div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                     </div>
                   )}
                </div>
              )}

              <div className="followup-module" style={{ marginTop: "24px" }}>
                <div className="followup-header">
                  <span>💬</span> Ask a Follow-up Question about this Briefing
                </div>
                <div className="followup-row">
                  <input
                    className="followup-input"
                    value={followUpQ}
                    onChange={e => setFollowUpQ(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && askFollowUp()}
                    placeholder={`Ask anything about "${doc.title}"…`}
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
            </div>
          )}

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
