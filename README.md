# NewsNavigator AI 🧠📰
**The High-Fidelity News Intelligence Platform**

NewsNavigator AI is a next-generation news analysis engine that transforms raw information into structured, personalized intelligence. It combines real-time search from multiple providers with a robust multi-model fallback system to ensure 100% availability during high-stakes demos.

---

## 🚀 Key Features

### 1. **Cross-Validated Intelligence**
- **Three-Way Search**: Runs Tavily, Serper, and NewsAPI in parallel using `Promise.all`.
- **Relevance Scoring**: Automatically scores search results by keyword overlap and deduplicates by URL.
- **Filtering**: Drops low-relevance results (<0.2 score) to stop hallucinations and keep the briefing focused.

### 2. **Dual-Model Groq Fallback (High-Availability)**
- **Synthesizer**: Primarily uses **Llama 3.3 70B** for deep reasoning.
- **Fail-Safe**: Instantly flips to **Llama 3.1 8B** if the 70B model hits a rate limit or quota, ensuring the briefing always generates in <5 seconds.

### 3. **Multilingual Audio Experience**
- **Instant Translation**: Uses Google Translate free API (zero-token, instant) for Hindi, Tamil, and Bengali.
- **Localized TTS**: Smart fallback system that uses **ElevenLabs** for English and **Browser Web Speech API** for Indian regional accents (`hi-IN`, `ta-IN`).

### 4. **Adaptive Story Arcs**
- Tracks sentiment and impact over time.
- Visualizes news with color-coded "Bullish/Bearish" indicators and interactive section layers.

---

## 🛠️ Tech Stack & Dependencies

- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router, Turbopack)
- **Primary LLM**: [Groq](https://groq.com/) (Llama 3.3 70B / 3.1 8B)
- **Fallback LLMs**: [Gemini 1.5 Flash](https://aistudio.google.com/), [Claude 3.5 Sonnet](https://anthropic.com/)
- **Search APIs**: [Tavily](https://tavily.com/), [Serper.dev](https://serper.dev/), [NewsAPI](https://newsapi.org/)
- **Persistence**: [Neon Postgres](https://neon.tech/) & [Mem0 AI](https://mem0.ai/)
- **Voice**: [ElevenLabs](https://elevenlabs.io/) & Web Speech API

---

## ⚙️ Installation & Setup

### 1. Clone & Install
```bash
git clone <your-repo>
cd finalone
npm install
```

### 2. Environment Configuration
Copy the sample file and add your keys:
```bash
cp .env.example .env
```
Fill in the following slots in `.env`:
- `GROQ_API_KEY` (Primary LLM)
- `TAVILY_API_KEY` (Primary News Search)
- `DATABASE_URL` (Neon Postgres)

### 3. Run Locally
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 Testing Guide

1. **Direct Search**: Type a query like "Israel-Iran conflict" or "AI Budget Impact".
2. **Web Crawl**: Paste an Economic Times link into the "Add to Library" box to enrich the local atom set.
3. **Switch Language**: Select "हिंदी" (Hindi) or "தமிழ்" (Tamil) — notice the instant translation and regional accent when clicking **🔊 Read Aloud**.
4. **Story Arc**: Click the 📈 Story Arc button to see the sentiment analysis based on the latest news intelligence.

---

## 📁 Repository Structure
- `app/api/` — Structured intelligence endpoints
- `lib/search.ts` — Parallel search & cross-validation logic
- `lib/llm.ts` — Multi-model fallback system
- `data/atoms.jsonl` — Local persistent news library
- `components/` — UI layers for Grid and Focus modes

---
*Created for Project Submission 2026 - Optimized for High-Availability and Demo-Readiness.*

