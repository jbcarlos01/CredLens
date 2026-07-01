# RiskLens AI

**Intelligent credit risk platform** for the Banking, Finance & Insurance sector. Scores loan applications with machine learning, explains decisions with transparent risk factors, and provides an agentic AI advisor for applicants and loan officers.

## Capstone overview

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS, shadcn-style UI |
| Backend | Next.js API Routes |
| Database | [Neon](https://neon.tech) PostgreSQL, Prisma ORM |
| ML training | Python, scikit-learn, XGBoost (Home Credit dataset) |
| ML inference | FastAPI service (optional) |
| AI advisor | Rule-based agent (+ optional OpenAI) |

## Features

- **Loan application form** with instant risk scoring
- **Risk tiers**: Low (auto-approve), Medium (manual review), High (decline)
- **Explainable factors** for every prediction
- **AI Risk Advisor** chat per application
- **Analyst dashboard** with review queue, stats, and charts

## Quick start

### 1. Prerequisites

- Node.js 20+
- A free [Neon](https://neon.tech) account (hosted PostgreSQL — no Docker needed)
- Python 3.10+ (optional, for ML service)

### 2. Install dependencies

```bash
cd risklens-ai
npm install
cp .env.example .env
```

### 3. Set up Neon database

1. Go to [console.neon.tech](https://console.neon.tech) and create a project (free tier is fine).
2. Open your project → **Connect**.
3. Copy the **pooled** connection string → paste as `DATABASE_URL` in `.env`.
4. Copy the **direct** connection string → paste as `DIRECT_URL` in `.env`.

Example `.env`:

```env
DATABASE_URL="postgresql://user:pass@ep-abc123-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://user:pass@ep-abc123.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

> **Tip:** The pooled URL contains `-pooler` in the hostname. The direct URL does not. Both use the same username and password.

### 4. Push schema & load Kaggle data

```bash
npm run db:push
pip install -r ml/requirements.txt
npm run ml:setup
```

This imports **50 real Home Credit (Kaggle) records** into your dashboard. New applications come from the `/apply` form only.

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 6. Connect Kaggle Home Credit data (Option C)

This downloads the [Home Credit Default Risk](https://www.kaggle.com/competitions/home-credit-default-risk) dataset (via HuggingFace mirror), trains an XGBoost model, and imports **50 real historical loans** into your dashboard.

```bash
pip install -r ml/requirements.txt
npm run ml:download    # ~307K rows (one-time, ~1 min)
npm run ml:setup       # sample + train + import into Neon
```

Or step by step:

```bash
npm run ml:sample      # 50-row stratified sample
npm run ml:train       # XGBoost model → ml/models/
npm run ml:import      # loads into Neon — look for "(HC-...)" names + Kaggle badge
```

**In the analyst dashboard** you'll see applicants like `Maria Santos (HC-123456)` with a **Kaggle** badge — these are real rows from the dataset.

### 7. (Optional) ML inference service for live scoring

With the trained model running, new `/apply` submissions use the **Kaggle-trained XGBoost model** instead of the built-in formula:

```bash
npm run ml:serve
```

Keep `npm run dev` running in another terminal.

## How Kaggle data flows

```
Kaggle Home Credit CSV (307K loans)
        ↓
  ml/train.py  →  XGBoost model (AUC ~0.73)
        ↓
  ml/import-kaggle.ts  →  50 sample rows visible in dashboard
        ↓
  ml/serve.py (optional)  →  scores new applications from /apply
```

## Training on Home Credit data (manual)

If `ml:download` fails, download `application_train.csv` from [Kaggle](https://www.kaggle.com/competitions/home-credit-default-risk/data) and place in `ml/data/`, then:

```bash
npm run ml:train
```

## Optional: OpenAI advisor

Add to `.env`:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Without an API key, the advisor uses intelligent rule-based responses.

## Project structure

```
risklens-ai/
├── prisma/           # Schema, migrations, seed
├── src/
│   ├── app/          # Pages & API routes
│   ├── components/   # UI components
│   └── lib/          # Scoring, advisor, Prisma client
└── ml/               # Python training & inference
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/applications` | List applications |
| POST | `/api/applications` | Submit & score application |
| GET | `/api/applications/[id]` | Application detail |
| PATCH | `/api/applications/[id]` | Update status (analyst) |
| POST | `/api/chat` | AI advisor message |
| GET | `/api/stats` | Dashboard statistics |

## Demo flow (pitch)

1. **Landing** — explain the product value proposition
2. **Apply** — submit a loan application (try different profiles)
3. **Results** — show risk score, tier, explainable factors
4. **Advisor** — ask *"Why was I flagged for review?"* or *"How can I improve?"*
5. **Dashboard** — approve/decline medium-risk cases, show portfolio chart

## Dataset reference

- Primary: [Home Credit Default Risk](https://www.kaggle.com/competitions/home-credit-default-risk) (~307K applications)
- Used for ML training; the web app uses a compatible feature mapping

## License

Capstone project — educational use.
