# NewsNavigator AI 🧠📰
**The High-Fidelity News Intelligence Platform**

NewsNavigator AI is a next-generation news analysis engine that transforms raw information into structured, personalized intelligence. It combines real-time search from **three independent news APIs in parallel** with a robust multi-model fallback system to ensure 100% availability during high-stakes demos.

---

## 🚀 Key Features

### 1. **Cross-Validated Intelligence with 3 News APIs**
- **Three-Way Search**: Runs **Tavily**, **Serper**, and **NewsAPI** in parallel using `Promise.all`.
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

### **Frontend & Framework**
- **Next.js 15+** (App Router, Turbopack, React 19+)
- **React DOM 19** for component rendering
- **Tailwind CSS 4.2** for styling
- **Lucide React** for icons

### **UI & Styling Libraries**
- **class-variance-authority** (0.7.1) - Component variants
- **clsx** (2.1.1) - Conditional className utility
- **tailwind-merge** (3.5.0) - Tailwind class merging
- **postcss** (8.5.8) - CSS processing
- **autoprefixer** (10.4.27) - Vendor prefixes

### **LLM Providers**
- **Groq** (Primary) - Llama 3.3 70B / 3.1 8B (Fastest inference)
- **Gemini 1.5 Flash** (Fallback) - For JSON structured output
- **Claude 3.5 Sonnet (Anthropic)** (Final Fallback) - Premium reasoning
- **@anthropic-ai/sdk** (0.80.0) - Anthropic integration

### **Search APIs (All 3 Required)**
1. **Tavily** - Premium news search with AI summaries
2. **Serper.dev** - Google Search API for broad coverage
3. **NewsAPI** - Aggregated news from 80+ sources

### **Data & Persistence**
- **pg** (8.20.0) - PostgreSQL client
- **Neon Postgres** - Serverless database
- **Mem0 AI** - Long-term persona memory
- **JSONL** - Local news atoms storage

### **Utilities**
- **cheerio** (1.2.0) - Web scraping & HTML parsing
- **turndown** (7.2.2) - HTML to Markdown conversion
- **TypeScript** (6.0.2) - Type safety

### **Voice & Audio**
- **ElevenLabs** - Premium multilingual TTS
- **Browser Web Speech API** - Regional accents

---

## 📋 Prerequisites Before Installation

### **System Requirements**
- **Node.js**: 18+ (recommended: 20.x LTS)
- **npm**: 9+
- **Git**: Latest stable version
- **Operating System**: macOS, Linux, or Windows (WSL recommended)

### **API Keys Required** (Get these FIRST!)

You MUST obtain **4 sets of API keys** before running the project:

#### **1️⃣ Tavily API Key** (Primary Search)
- Go to: https://tavily.com/
- Sign up for free account
- Create API key from dashboard
- Copy: `TAVILY_API_KEY`

#### **2️⃣ Serper.dev API Key** (Google Search)
- Go to: https://serper.dev/
- Register with email
- Get free 100 searches (then $5 for 50k searches)
- Copy: `SERPER_API_KEY`

#### **3️⃣ NewsAPI Key** (News Aggregator)
- Go to: https://newsapi.org/
- Sign up (free tier: 100 requests/day)
- Generate API key
- Copy: `NEWSAPI_KEY`

#### **4️⃣ Groq API Key** (LLM - Primary)
- Go to: https://console.groq.com/
- Sign up with email
- Request API access (instant approval)
- Copy: `GROQ_API_KEY`

#### **5️⃣ Optional: Gemini API Key** (LLM - Fallback)
- Go to: https://aistudio.google.com/
- Sign in with Google account
- Create API key
- Copy: `GEMINI_API_KEY`

#### **6️⃣ Optional: Anthropic API Key** (LLM - Final Fallback)
- Go to: https://console.anthropic.com/
- Sign up for account
- Create API key
- Copy: `ANTHROPIC_API_KEY`

#### **7️⃣ Database** (Neon Postgres - Optional for persistence)
- Go to: https://neon.tech/
- Create free account
- Create project and database
- Copy: `DATABASE_URL`

#### **8️⃣ Optional: ElevenLabs API Key** (Premium voice)
- Go to: https://elevenlabs.io/
- Sign up
- Generate API key
- Copy: `ELEVENLABS_API_KEY`

---

## ⚙️ Installation & Setup Guide

### **Step 1: Clone the Repository**
```bash
git clone https://github.com/zodiac0149/ProjectETHack.git
cd ProjectETHack
```

### **Step 2: Install Dependencies**
```bash
npm install
```

This will install all packages from `package.json`:
- Next.js 16.2.1
- React 19.2.4
- Tailwind CSS 4.2.2
- @anthropic-ai/sdk 0.80.0
- All 13 core dependencies
- All 10 dev dependencies

**Installation time**: ~2-3 minutes

### **Step 3: Create Environment File**
```bash
cp .env.example .env
```

### **Step 4: Fill in Required Environment Variables**

Edit `.env` and add your API keys (minimum requirements):

```bash
# ── LLM PROVIDERS ──────────────────────────────────────────
# REQUIRED: At least one of these for AI synthesis

GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_MODEL_FALLBACK=llama-3.1-8b-instant

# OPTIONAL: Fallback LLMs
GEMINI_API_KEY=your_gemini_key_here
GEMINI_MODEL=gemini-2.0-flash

ANTHROPIC_API_KEY=your_anthropic_key_here
CLAUDE_MODEL=claude-3-5-sonnet-latest

# ── SEARCH APIS (ALL 3 REQUIRED) ──────────────────────────
# The project runs all 3 in parallel for cross-validation

# 1. Tavily (Premium News Search with AI summaries)
TAVILY_API_KEY=tvly-your_key_here

# 2. Serper (Google Search API - India region)
SERPER_API_KEY=your_serper_key_here

# 3. NewsAPI (News Aggregator - 80+ sources)
NEWSAPI_KEY=your_newsapi_key_here

# ── DATABASE & PERSISTENCE ──────────────────────────────
# Optional: For storing news atoms and user profiles

DATABASE_URL=postgres://user:pass@host:5432/dbname?sslmode=require

# Optional: Long-term memory for persona tracking
MEM0_API_KEY=m0-your_key_here

# ── AUDIO & VOICE ───────────────────────────────────────
# Optional: For premium multilingual TTS

ELEVENLABS_API_KEY=your_elevenlabs_key_here

# ── PATHS ────────────────────────────────────────────────
ATOMS_PATH=./data/atoms.jsonl
```

### **Step 5: Run Development Server**
```bash
npm run dev
```

The application will start at **http://localhost:3000**

Expected output:
```
  ▲ Next.js 16.2.1
  - Local:        http://localhost:3000
  ✓ Ready in 2.3s
```

### **Step 6: Verify Installation**

Open your browser and navigate to `http://localhost:3000`

You should see:
- ✅ NewsNavigator AI homepage loads
- ✅ Search bar is interactive
- ✅ Language selector shows (English, Hindi, Tamil)
- ✅ No console errors

---

## 🧪 Testing the Three News APIs

### **Test 1: Direct Search Query**
1. Type a query: **"India AI Budget 2026"**
2. Click Search
3. Observe results from **3 sources simultaneously**:
   - Tavily results (top-left)
   - Serper results (top-right)
   - NewsAPI results (bottom)
4. Results are **deduplicated by URL** and **scored by relevance**

### **Test 2: Verify API Fallback**
1. Open browser DevTools (F12)
2. Go to Network tab
3. Make a search
4. Observe 3 parallel POST requests to:
   - `api.tavily.com/search`
   - `google.serper.dev/search`
   - `newsapi.org/v2/everything`

### **Test 3: Multilingual Output**
1. Select **"हिंदी"** (Hindi) from language selector
2. Make a search
3. Results translate instantly using Google Translate API
4. Click **🔊 Read Aloud** for Web Speech API audio

### **Test 4: Story Arc Analysis**
1. Click 📈 **Story Arc** button
2. System analyzes sentiment over time
3. See color-coded indicators:
   - 🟢 Green = Bullish (positive)
   - 🔴 Red = Bearish (negative)
   - 🟡 Yellow = Neutral

---

## 📁 Repository Structure & File Breakdown

### **Root Configuration Files**
```
ProjectETHack/
├── package.json              # npm dependencies & scripts
├── tsconfig.json             # TypeScript configuration
├── next.config.js            # Next.js build config
├── tailwind.config.ts        # Tailwind CSS config
├── postcss.config.mjs        # PostCSS plugins
├── .env.example              # Environment template
├── .gitignore               # Git ignore rules
└── README.md                # This file
```

### **App Directory** (`app/`) - Next.js App Router
```
app/
├── api/
│   ├── search/              # POST /api/search - Core search endpoint
│   ├── translate/           # POST /api/translate - Language translation
│   ├── sentiment/           # POST /api/sentiment - Story arc analysis
│   ├── persist/             # POST /api/persist - Save to database
│   └── tts/                 # POST /api/tts - Text-to-speech
├── page.tsx                 # Home page component
├── layout.tsx               # Root layout
└── globals.css              # Global styles
```

### **Library** (`lib/`) - Core Logic & Utilities

**Search & Cross-Validation:**
- `lib/search.ts` ⭐ **Main file**: Parallel execution of 3 APIs
  - `fetchTavily()` - Tavily API integration
  - `fetchSerper()` - Serper.dev integration
  - `fetchNewsApi()` - NewsAPI integration
  - `searchWeb()` - Orchestrates all 3 in parallel

**LLM & AI:**
- `lib/llm.ts` - Multi-model fallback orchestration
  - `generateJSON()` - Groq → Gemini → Anthropic
  - `generateText()` - Text generation with fallbacks
- `lib/anthropic.ts` - Anthropic SDK wrapper
- `lib/mem0.ts` - Persona memory management

**Data & Persistence:**
- `lib/db.ts` - PostgreSQL connection (Neon)
- `lib/atoms.ts` - JSONL news storage
- `lib/types.ts` - TypeScript interfaces
- `lib/personas.ts` - User role templates

**Utilities:**
- `lib/social.ts` - Social media integration
- `lib/backgroundFetch.ts` - Background job processing
- `lib/agentLog.ts` - Logging & monitoring
- `lib/python.ts` - Python script execution
- `lib/utils.ts` - Helper functions

**API Sources:**
- `lib/sources/newsapi.ts` - NewsAPI wrapper

### **Components** (`components/`) - React UI
```
components/
└── ui/                      # Shadcn/UI components (if any)
```

### **Data** (`data/`) - Local Storage
```
data/
└── atoms.jsonl              # Local news library (JSONL format)
```

### **Scripts** (`scripts/`) - Automation
```
scripts/
└── setup-db.ts              # Database initialization
```

---

## 🚀 Running Different Modes

### **Development Mode** (With Hot Reload)
```bash
npm run dev
```
- Starts on `http://localhost:3000`
- Hot reload on file changes
- Full error stack traces

### **Production Build**
```bash
npm run build
npm start
```
- Optimized bundle
- Faster cold start
- For deployment

### **Database Setup** (If using Postgres)
```bash
npm run db:setup
```
- Initializes Neon database
- Creates tables for atoms storage

---

## 🔧 Troubleshooting

### **Issue: "Cannot find module 'next'"**
```bash
# Solution:
rm -rf node_modules package-lock.json
npm install
```

### **Issue: "API key not found"**
- Verify `.env` file exists
- Check all 3 API keys are added:
  ```bash
  echo $TAVILY_API_KEY
  echo $SERPER_API_KEY
  echo $NEWSAPI_KEY
  ```

### **Issue: "Port 3000 already in use"**
```bash
# Use a different port:
npm run dev -- -p 3001
```

### **Issue: "Search returns no results"**
- Check internet connection
- Verify API keys are valid
- Check API rate limits in dashboards
- Try with different search query

---

## 📚 API Endpoint Reference

### **POST /api/search**
Request:
```json
{
  "query": "India AI Budget",
  "maxResults": 5
}
```
Response:
```json
{
  "results": [
    {
      "title": "India Allocates...",
      "url": "...",
      "snippet": "...",
      "source": "tavily",
      "publishedAt": "2026-03-29"
    }
  ]
}
```

### **POST /api/translate**
Request:
```json
{
  "text": "Hello world",
  "targetLanguage": "hi"
}
```
Response:
```json
{
  "translated": "नमस्ते दुनिया"
}
```

---

## 🎯 Next Steps

1. ✅ Get all 3 news API keys (Tavily, Serper, NewsAPI)
2. ✅ Install Node.js 18+
3. ✅ Clone & install dependencies
4. ✅ Configure `.env` with API keys
5. ✅ Run `npm run dev`
6. ✅ Test search functionality
7. ✅ Deploy to Vercel or production

---

## 📝 License

MIT License - See LICENSE file

---

*Created for Project Submission 2026 - Optimized for High-Availability and Demo-Readiness.*
*Powered by Next.js, Groq LLMs, and Real-Time News APIs*