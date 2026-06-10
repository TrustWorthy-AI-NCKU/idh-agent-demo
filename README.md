# IDH Clinical Agent Demo

> **Intradialytic Hypotension (IDH) decision-support agent**
> NAM-LSS V2 × Multimodal Clinical Context × LLM Reasoning

A clinical decision-support demo for predicting and managing intradialytic hypotension (IDH) in hemodialysis patients. The system combines a Neural Additive Model (NAM-LSS V2) for risk prediction with a local LLM for explainable, patient-specific intervention recommendations.

> ⚠️ **This repository contains synthetic data only.** No real patient records are included. This is a research demo and is not intended for clinical use.

---

## Screenshots

```
┌──────────────┬────────────────────────────┬──────────────────┐
│  Patient     │  Risk Gauge + Shape Curves  │  Clinical Chat   │
│  Timeline    │  Attention Weights          │  (LLM via Ollama)│
└──────────────┴────────────────────────────┴──────────────────┘
```

---

## Features

- **Risk prediction** via NAM-LSS V2 (Neural Additive Model with Latent Session Scoring), an interpretable deep learning model trained with IECV cross-hospital validation
- **Shape function visualization** — per-feature risk curves showing how each clinical variable affects IDH probability
- **Attention weight ranking** — model-derived feature importance for each session
- **Uncertainty quantification** — aleatoric and epistemic uncertainty from a Mixture Beta output head
- **Session timeline** — browse all historical sessions per patient with IDH labels
- **LLM chat interface** — patient-specific system prompt injected automatically; constrained to a vetted intervention list; respects DNR status
- **Streaming responses** via Server-Sent Events (SSE)
- **Multimodal context** — structured vitals, longitudinal IDH history, and unstructured nursing notes all feed into the LLM reasoning layer

---

## Architecture

```
mm_sessions.jsonl (or mock data)
        │
        ├── Structured tabular vitals ──→ NAM-LSS V2 ──→ risk + uncertainty
        │                                               + attention weights
        │                                               + shape curves
        └── Clinical text (nurse notes, A&P, orders) ──┐
                                                         ▼
                                              LLM system prompt
                                                         │
                                                    Ollama API
                                                         │
                                              Clinical recommendations
```

**Stack:**
- Backend: FastAPI + uvicorn
- Frontend: React 18 + Vite
- LLM: Any Ollama-compatible model (default: `qwen2.5:7b`)
- Model: NAM-LSS V2 (PyTorch ensemble, not included in this repo)

---

## Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Python | ≥ 3.10 |
| Node.js | ≥ 18 |
| Ollama | any (optional for chat) |

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/idh-agent-demo.git
cd idh-agent-demo
pip install -r requirements.txt
```

### 2. Build the frontend

```bash
cd frontend
npm install
npm run build
cd ..
```

### 3. Start the server

```bash
# Default: mock data, no Ollama required (chat will show connection error)
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# With a local Ollama instance
export OLLAMA_URL=http://localhost:11434   # Linux/Mac
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# With a remote Ollama instance (Windows PowerShell)
$env:OLLAMA_URL = "http://192.168.x.x:11434"
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Open **http://localhost:8000** in your browser.

### Development mode (hot reload)

```bash
# Terminal 1 — backend
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — frontend
cd frontend
npm run dev
# Open http://localhost:5173
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server address |
| `OLLAMA_MODEL` | `qwen2.5:7b` | LLM model to use |

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/patients` | GET | List all patients with latest risk score |
| `/api/patients/{pid}` | GET | Full patient data (latest session) |
| `/api/patients/{pid}/sessions` | GET | All session dates + IDH labels |
| `/api/patients/{pid}/sessions/{idx}` | GET | Data for a specific session |
| `/api/chat` | POST | Stream chat to Ollama (SSE) |
| `/api/status` | GET | System status |

Swagger docs available at **http://localhost:8000/docs**.

---

## Connecting Real Data

This demo uses synthetic patient archetypes. To connect real data:

1. Provide a `mm_sessions.jsonl` file where each line is one dialysis session:

```json
{
  "Patient_ID": "00035339",
  "session_date": "2024-01-15",
  "baseline_sbp": 118.0,
  "idh": false,
  "Age": 54, "Sex": 0, "DM": 0, "HTN": 1,
  "Pre_HD_Weight": 71.5, "Dry_Weight": 68.7,
  "Target_UF_Volume": 2.8, "Ultrafiltration_Rate": 0.75,
  "Dialysate_Temperature": 36.2, "UF_BW_Perc": 4.1,
  "nurse_events": [{"ts": "13:30", "symptoms": [], "interventions": []}],
  "ap_sections": {"current_management": "...", "important_notes": "..."},
  "orders": []
}
```

2. Use the full backend from `backend/main_realdata.py` (see `/docs/real_data_setup.md`).

> **Important:** Never commit real patient data to this repository.

---

## Model: NAM-LSS V2

The prediction model is a Neural Additive Model with:

- **Per-feature networks** (RBF basis + residual MLP) for interpretable shape functions
- **Feature attention** for session-specific importance weights
- **Mixture Beta output head** for uncertainty decomposition (aleatoric / epistemic)
- **5-model ensemble** with Test-Time Augmentation
- **IECV validation** across 3 hospitals (TN / D6 / CY)

Model weights are not included in this repository. To use a trained model, set `NAM_MODEL_PATH` and `NAM_SCALAR_PATH` environment variables pointing to your `.pt` checkpoint and `.joblib` preprocessor.

---

## Project Structure

```
idh-agent-demo/
├── backend/
│   ├── __init__.py
│   └── main.py              # FastAPI app (mock data)
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Main React component
│   │   ├── main.jsx          # Entry point
│   │   └── global.css        # CSS variables + base styles
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── requirements.txt
├── .gitignore
└── README.md
```

---

## Disclaimer

This system is a **research prototype** for demonstration purposes only.

- All patient data in this repository is **entirely synthetic**
- The system is **not validated for clinical use**
- Risk predictions should **never** replace clinical judgment
- The LLM recommendations are bounded by a vetted intervention list but may still be incorrect

---

## Citation

If you use this demo in your research, please cite:

```bibtex
@misc{idh-agent-demo,
  title  = {IDH Clinical Agent Demo: NAM-LSS V2 with Multimodal Context},
  author = {[your name]},
  year   = {2025},
  url    = {https://github.com/<your-username>/idh-agent-demo}
}
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.
