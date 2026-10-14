# 🤖 AI Tutor for CFG → PDA Converter & Simulator

An intelligent, pedagogical AI learning assistant designed specifically for Theory of Computation students exploring Context-Free Grammars (CFG) and Pushdown Automata (PDA).

---

## 🏗️ Architecture: Frontend vs. Backend

```
TOC/
├── index.html                   # Main application with new [ 🤖 AI Tutor ] button
├── style.css                    # Original HackerRank design system
├── script.js                    # Original PDA simulator logic (100% untouched)
│
└── ai-tutor/
    ├── chat.html                # Standalone preview & test harness
    ├── chat.css                 # Theming, responsive drawer, animations & bubble styles
    ├── chat.js                  # Frontend controller, DOM injection & markdown renderer
    └── backend/
        ├── server.js            # Secure Node/Express API with Gemini & OpenAI handlers
        ├── package.json         # Backend dependencies
        ├── .env.example         # Template for environment variables
        └── .env                 # Local secrets (ignored by Git)
```

### 1. Frontend (`ai-tutor/chat.css`, `ai-tutor/chat.js`)
- **Location:** Runs directly in the student's browser.
- **Responsibilities:**
  - Injects and renders the slide-out AI Tutor chat drawer on the right side of the screen.
  - Matches the existing dark/light mode automatically via CSS variables.
  - Formats rich markdown: bold text, headings, numbered lists, bullet points, inline code, copyable code blocks, and blockquote analogies.
  - Captures active simulator context (variables, productions, input string, step) so the student can ask about the current grammar.
  - **Security Guarantee:** **Never** contains or exposes secret API keys.

### 2. Backend (`ai-tutor/backend/server.js`)
- **Location:** Runs on Node.js (port 5000).
- **Responsibilities:**
  - Securely reads the `GEMINI_API_KEY` (or `OPENAI_API_KEY`) from `.env`.
  - Enforces the pedagogical persona via system instructions.
  - Forwards student queries to Google Gemini (`gemini-1.5-flash`) or OpenAI.
  - Provides a built-in educational fallback engine if no key is configured yet.
  - Enables CORS and serves static files.

---

## 🚀 Quick Start Guide

### Step 1: Install Backend Dependencies
In terminal, navigate to the backend folder:
```bash
cd ai-tutor/backend
npm install
```

### Step 2: Configure Your Free Gemini API Key (Recommended)
1. Get a free API key at **[Google AI Studio](https://aistudio.google.com/app/apikey)**.
2. Open `ai-tutor/backend/.env` and paste your key:
```env
PORT=5000
GEMINI_API_KEY=AIzaSyYourActualKeyHere
```
*(Note: `.env` is listed in `.gitignore` so your key will never be committed to Git or pushed to GitHub).*

### Step 3: Start the Backend Server
```bash
npm start
```
The server will start at `http://localhost:5000`.

### Step 4: Open the Simulator
Visit `http://localhost:5000` in your browser (or open `index.html` via Live Server).
Click the **`[ 🤖 AI Tutor ]`** button in the top right to start asking questions!

---

## 💡 Topics You Can Ask About
- **"Why does PDA use a stack?"**
- **"Explain CFG to PDA conversion step by step"**
- **"Explain PDA like I'm 5 with an everyday analogy"**
- **"What is the difference between leftmost and rightmost derivations?"**
- **"Can you explain the current grammar loaded in the simulator?"**
- **"Why is this string accepted or rejected?"**
