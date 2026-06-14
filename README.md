# Real-Time Yoruba Speech-to-Text (ASR) System

A decoupled, production-optimized real-time Automatic Speech Recognition (ASR) system for the Yoruba language. It features a Python FastAPI backend powered by the **CTranslate2 (faster-whisper)** engine, and a modern Next.js frontend built using **Tailwind CSS v4**, **shadcn UI**, and **Prisma ORM** with **PostgreSQL** database integration.

---

## 🛠️ Architecture & Workflow

```mermaid
graph TD
    A[Browser: Mic Input] -- "16kHz PCM (WebSockets)" --> B[FastAPI Backend]
    B --> C[Silero VAD Segmenter]
    C -- "Speech Ends (asyncio.to_thread)" --> D[CTranslate2 faster-whisper Engine]
    D --> E[Yoruba ASR Text Output]
    E -- "WebSocket JSON Segment" --> A
    A -- "Save Action" --> F[Next.js Server Actions]
    F -- "Prisma ORM" --> G[PostgreSQL Database]
```

1. **Audio Capture**: The frontend Next.js app captures microphone input via the browser's Web Audio API, downsamples it to $16\text{kHz}$ mono, converts it to 16-bit signed PCM, and streams the raw bytes over WebSockets.
2. **Asynchronous VAD & Inference**: The Python backend processes chunks through **Silero VAD**. When a speaker pause/silence is detected, inference is offloaded to a background worker thread (`asyncio.to_thread`) running **CTranslate2** (`faster-whisper`) with `int8` CPU quantization.
3. **Responsive Socket loop**: By running model inference on a separate thread, the WebSocket event loop is never blocked, allowing the server to handle concurrent user connections smoothly.
4. **Data Persistence (Prisma ORM)**: Users can save transcriptions. The frontend triggers Next.js **Server Actions** which execute secure, server-side database insertions using **Prisma ORM** connecting to any PostgreSQL database (such as Neon.tech free tier, Supabase PostgreSQL, Render, etc.).

---

## 📁 Repository Structure

```text
├── backend/                  # FastAPI & CTranslate2 backend
│   ├── whisper-small-yoruba-ct2/  # Compiled CTranslate2 model directory
│   ├── server_production.py  # Production ASR server (concurrency optimized)
│   ├── requirements.txt      # Python dependencies
│   └── client.py             # CLI audio-file testing client
│
└── frontend/                 # Next.js web application
    ├── prisma/
    │   └── schema.prisma     # Prisma database schema definition
    ├── src/
    │   ├── app/              # Next.js App Router (page.tsx, actions.ts)
    │   ├── components/       # UI Components (AudioVisualizer.tsx)
    │   ├── hooks/            # Custom Hooks (useAudioStream.ts)
    │   └── lib/              # Client Helpers (db.ts)
    ├── schema.sql            # Raw SQL database schema script
    └── .env.example          # Environment variable template
```

---

## 🚀 Setup and Installation

### 1. Backend Setup
Activate the virtual environment inside the `backend/` folder and install dependencies:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

If you haven't compiled the model to CTranslate2 format yet, run:
```bash
ct2-transformers-converter --model ccibeekeoc42/whisper-small-yoruba-07-17 --output_dir whisper-small-yoruba-ct2
```

Start the production server:
```bash
python3 server_production.py
```
*The server starts on `http://localhost:8000` (WebSocket endpoint on `ws://localhost:8000/stream`).*

---

### 2. Frontend & Database Setup

1. Spin up a free PostgreSQL database (e.g. at [Neon.tech](https://neon.tech) or [Supabase](https://supabase.com)).
2. Navigate to the `frontend/` directory and install dependencies:
   ```bash
   cd ../frontend
   npm install
   ```
3. Copy the environment variables template and configure it:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and paste your actual PostgreSQL database connection string in the `DATABASE_URL` field.
   * **Note for Supabase**: Use the **Connection Pooler URL (Transaction Mode)**, which operates on port **6543** (not port 5432). This resolves P1001 reachability issues.
     `DATABASE_URL="postgres://postgres.[project-id]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"`
4. Run Prisma db push to generate client models and initialize database tables:
   ```bash
   npx prisma db push
   ```
5. Start the local development server:
   ```bash
   npm run dev
   ```

Open `http://localhost:3000` in your browser.

---

## ⚙️ Key Technical Features

* **Non-Blocking Inference**: Utilizes `asyncio.to_thread` to prevent CPU-intensive Whisper execution from blocking the WebSocket connection loop.
* **Prisma Server Actions**: Database CRUD operations are kept on the server-side, protecting database credentials and keeping client code extremely lightweight.
* **Canvas Waveform Visualizer**: Renders real-time glowing audio waves using the browser Web Audio API's `AnalyserNode`.
