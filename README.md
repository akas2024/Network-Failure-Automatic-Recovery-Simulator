# 🌐 Network Failure & Automatic Recovery Simulator

An interactive, high-fidelity Computer Networks visualization and educational platform demonstrating **Dynamic Link-State Routing**, **Dijkstra's Shortest Path First (SPF) Algorithm**, **Hardware/Link Fault Injection**, **Zero-Downtime Automatic Failover**, and an integrated **AI Tutor**.

---

## 🚀 Key Features

### 1. ⚡ Dynamic Shortest Path First (Dijkstra SPF)
- Real-time graph computation calculating optimal routes from **Source PC** to **Destination Server**.
- Supports dynamic router topologies from **2 to 8 routers** (including primary, core, and backup aggregation meshes).
- Live visualization of the active optimal path with animated cyan glowing conduits.

### 2. 💥 Fault Injection & Interactive Topology
- **Direct Canvas Interaction:** Click directly on any router circle or transmission path/link line to sever it (`FAILED`) or repair it (`ACTIVE`).
- **Interactive Hit Areas:** Precision 26px hit zones along every link line make toggling links effortless.
- **Failover Demonstration:** Instantly observe how a crash on **Router R2** dynamically reroutes packet flow to **Backup Core Router R3**.

### 3. 📦 Step-by-Step Packet Simulation & Delivery Verification
- **Hop-by-Hop Stepping:** Click `▶ Start Simulation` to buffer the packet at PC, then advance with `⏭ Next Step` or review routing decisions with `⏮ Prev Step`.
- **Packet Telemetry:** Real-time tracking of hops, accumulated link metrics, packet delivery count, and packet drop stats.
- **Delivery Confirmation:** When reaching `Server (172.16.0.100)`, a glowing green **`✓ DELIVERED`** SVG badge renders above the Server and action buttons pulse in emerald green.

### 4. 🔍 Zoomed Live Network Topology Modal
- High-resolution expanded vector view of the entire network diagram.
- Full parity with main canvas: click routers/links to inject faults, step forward/backward, and view live status chips.

### 5. 🤖 AI Tutor & Educational Knowledge Engine
- Concise, high-yield answers focused on key networking concepts (**Dijkstra**, **Convergence**, **TTL**, **Partitioning**).
- **Secure Architecture:** Zero hardcoded API keys in client-side code.
- **Triple-Tier Fallback:**
  1. **Vercel Serverless / Backend Proxy (`/api/chat`):** Uses server environment variables (`GEMINI_API_KEY`).
  2. **Direct Custom Key:** Optional user key configuration stored in local browser memory.
  3. **Built-in Offline Engine:** Comprehensive, instant offline knowledge engine ready with zero API keys required.

---

## 🛠️ Project Structure

```text
CN1/
├── index.html              # Core application layout and SVG canvas
├── script.js               # Dijkstra engine, SVG renderer, simulation controller
├── style.css               # Modern glassmorphism UI, glowing animations, dark theme
├── vercel.json             # Vercel deployment configuration & routing
├── api/
│   └── chat.js             # Vercel Serverless Function for secure AI Tutor proxy
├── ai-tutor/
│   └── backend/
│       ├── server.js       # Local Express server for AI Tutor and static hosting
│       ├── .env.example    # Example environment variables
│       └── package.json    # Backend dependencies (cors, dotenv, express)
├── package.json            # Root project metadata & start scripts
└── README.md               # Documentation and deployment guide
```

---

## 💻 Running Locally

### Option 1: Direct Browser Launch (Static Mode)
Simply open `index.html` in any modern web browser:
```bash
# On Windows
start index.html

# On macOS
open index.html
```
*All routing algorithms, link/router toggles, step simulation, zoom modal, and the offline AI Tutor work 100% out of the box!*

### Option 2: Full-Stack Mode with Node.js Backend
To enable the live AI Tutor with your Google Gemini API key locally:
1. Navigate to the backend directory:
   ```bash
   cd ai-tutor/backend
   npm install
   ```
2. Copy `.env.example` to `.env` and add your Gemini API key:
   ```env
   PORT=5000
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   GEMINI_MODEL=gemini-flash-lite-latest
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## ☁️ Public Hosting on Vercel

This project is fully prepared for one-click deployment on **[Vercel](https://vercel.com)**.

### Deployment Steps:
1. **Push your code to GitHub:**
   ```bash
   git add .
   git commit -m "Prepare Network Simulator for Vercel deployment"
   git push origin main
   ```
2. **Import into Vercel:**
   - Log into your Vercel Dashboard at [vercel.com](https://vercel.com).
   - Click **Add New...** → **Project**.
   - Select your GitHub repository: `Network-Failure-Automatic-Recovery-Simulator`.
   - **Framework Preset:** Select **Other** (Root directory `./`).
3. **Configure Environment Variables (Optional for Live Gemini AI):**
   - In the **Environment Variables** section of the Vercel project settings, add:
     - **Key:** `GEMINI_API_KEY`
     - **Value:** *Your Google Gemini API key*
4. **Deploy:**
   - Click **Deploy**. Vercel will build and serve:
     - The static frontend (`index.html`, `script.js`, `style.css`) via Vercel Edge CDN.
     - The secure serverless endpoint (`/api/chat`) via `api/chat.js`.

---

## 🔒 Security Best Practices
- **No Client Secrets:** All Google Gemini API keys are read strictly on the server/serverless layer via `process.env.GEMINI_API_KEY`.
- **Git Protection:** `.env` and local credentials are listed in `.gitignore` and never committed to GitHub.

---

## 📜 License
Distributed under the MIT License. Built for Computer Networks education and interactive systems demonstration.
