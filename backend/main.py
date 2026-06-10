"""
IDH Agent Demo - FastAPI backend (mock data, Gemini API chat)

All patient data is synthetic. No real clinical records included.

Usage:
    pip install -r requirements.txt
    uvicorn backend.main:app --host 0.0.0.0 --port 8000

Set GEMINI_API_KEY to enable chat:
    Windows:  set GEMINI_API_KEY=AIza...
    Linux:    export GEMINI_API_KEY=AIza...
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------- config -----------------------------------------------------------
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

VETTED_INTERVENTIONS = [
    "降低超過濾率或延長透析時間 (reduce UF rate / extend HD time)",
    "降低透析液溫度 (cool dialysate ~35.5-36.0 degC)",
    "鈉/超過濾 profiling (sodium / UF profiling)",
    "重新評估乾體重 (reassess dry weight)",
    "避免透析中進食 (avoid intradialytic food intake)",
    "檢視透析前降壓藥時機 (review timing of pre-HD antihypertensives)",
    "升壓處置如 midodrine (per physician order)",
]

# ---------- shape curve helpers ---------------------------------------------
def _shape_sbp(current):
    return {"label": "透析前收縮壓 (mmHg)", "xMin": 80, "xMax": 200,
            "currentVal": current,
            "points": [[x, round(1/(1+math.exp((x-125)/15)), 3)] for x in range(80,205,10)]}

def _shape_uf(current):
    return {"label": "超過濾/體重比 (%)", "xMin": 0, "xMax": 8,
            "currentVal": current,
            "points": [[round(x*0.25,2), round(1/(1+math.exp(-(x*0.25-3.5)/1.2)),3)] for x in range(33)]}

def _shape_rate(current):
    return {"label": "超過濾速率 (L/hr)", "xMin": 0.2, "xMax": 1.5,
            "currentVal": current,
            "points": [[round(x*0.1,1), round(1/(1+math.exp(-(x*0.1-0.7)/0.2)),3)] for x in range(2,16)]}

def _shape_temp(current):
    return {"label": "透析液溫度 (degC)", "xMin": 34.0, "xMax": 38.0,
            "currentVal": current,
            "points": [[round(34+x*0.25,2), round(1/(1+math.exp(-(34+x*0.25-36.0)/0.6)),3)] for x in range(17)]}

# ---------- synthetic patient data ------------------------------------------
MOCK_SESSIONS: dict[str, list[dict]] = {
    "PT-001": [
        {"pid":"PT-001","session_date":"2024-10-01","Age":71,"Sex":"F",
         "comorbidities":"DM, HTN, CHF","baseline_sbp":128,
         "Dry_Weight":55.2,"Pre_HD_Weight":57.4,"Target_UF_Volume":2.4,
         "Ultrafiltration_Rate":0.60,"Blood_Flow_Rate":280,
         "Dialysate_Temperature":36.5,"UF_BW_Perc":3.9,"idh":False,
         "nurse_events":[{"ts":"13:30","symptoms":[],"interventions":[]}],
         "ap_sections":{"current_management":"Midodrine 5mg pre-HD",
                        "important_notes":"乾體重近期下修 0.5 kg，持續觀察",
                        "comorbidities":"DM, HTN, CHF","esa":"NESP 3amp/M"},
         "orders":[{"drug":"midodrine 5mg"},{"drug":"carvedilol 12.5mg"}]},
        {"pid":"PT-001","session_date":"2024-10-04","Age":71,"Sex":"F",
         "comorbidities":"DM, HTN, CHF","baseline_sbp":121,
         "Dry_Weight":55.2,"Pre_HD_Weight":57.6,"Target_UF_Volume":2.5,
         "Ultrafiltration_Rate":0.63,"Blood_Flow_Rate":280,
         "Dialysate_Temperature":36.5,"UF_BW_Perc":4.1,"idh":True,
         "nurse_events":[{"ts":"14:10","symptoms":["頭暈","低血壓"],
                          "interventions":["生理食鹽水 100mL"]}],
         "ap_sections":{"current_management":"Midodrine 5mg pre-HD",
                        "important_notes":"乾體重近期下修 0.5 kg，持續觀察",
                        "comorbidities":"DM, HTN, CHF","esa":"NESP 3amp/M"},
         "orders":[{"drug":"midodrine 5mg"},{"drug":"carvedilol 12.5mg"}]},
        {"pid":"PT-001","session_date":"2024-10-08","Age":71,"Sex":"F",
         "comorbidities":"DM, HTN, CHF","baseline_sbp":115,
         "Dry_Weight":55.2,"Pre_HD_Weight":57.8,"Target_UF_Volume":2.6,
         "Ultrafiltration_Rate":0.65,"Blood_Flow_Rate":280,
         "Dialysate_Temperature":36.5,"UF_BW_Perc":4.7,"idh":False,
         "nurse_events":[{"ts":"13:30","symptoms":["不適"],"interventions":[]}],
         "ap_sections":{"current_management":"Midodrine 5mg pre-HD",
                        "important_notes":"乾體重近期下修 0.5 kg，持續觀察",
                        "comorbidities":"DM, HTN, CHF","esa":"NESP 3amp/M"},
         "orders":[{"drug":"midodrine 5mg"},{"drug":"carvedilol 12.5mg"},
                   {"drug":"furosemide 40mg"}]},
        {"pid":"PT-001","session_date":"2024-10-11","Age":71,"Sex":"F",
         "comorbidities":"DM, HTN, CHF","baseline_sbp":118,
         "Dry_Weight":55.2,"Pre_HD_Weight":57.8,"Target_UF_Volume":2.6,
         "Ultrafiltration_Rate":0.65,"Blood_Flow_Rate":280,
         "Dialysate_Temperature":36.5,"UF_BW_Perc":4.7,"idh":False,
         "nurse_events":[{"ts":"13:30","symptoms":[],"interventions":[]}],
         "ap_sections":{"current_management":"Midodrine 5mg pre-HD",
                        "important_notes":"乾體重近期下修 0.5 kg，持續觀察",
                        "comorbidities":"DM, HTN, CHF","esa":"NESP 3amp/M"},
         "orders":[{"drug":"midodrine 5mg"},{"drug":"carvedilol 12.5mg"},
                   {"drug":"furosemide 40mg"}]},
    ],
    "PT-002": [
        {"pid":"PT-002","session_date":"2024-10-02","Age":58,"Sex":"M",
         "comorbidities":"HTN, CAD","baseline_sbp":148,
         "Dry_Weight":72.0,"Pre_HD_Weight":74.0,"Target_UF_Volume":2.3,
         "Ultrafiltration_Rate":0.58,"Blood_Flow_Rate":300,
         "Dialysate_Temperature":36.5,"UF_BW_Perc":3.1,"idh":False,
         "nurse_events":[],
         "ap_sections":{"current_management":"Amlodipine 5mg QD",
                        "important_notes":"血壓控制穩定",
                        "comorbidities":"HTN, CAD","esa":""},
         "orders":[{"drug":"amlodipine 5mg"},{"drug":"aspirin 100mg"}]},
        {"pid":"PT-002","session_date":"2024-10-05","Age":58,"Sex":"M",
         "comorbidities":"HTN, CAD","baseline_sbp":152,
         "Dry_Weight":72.0,"Pre_HD_Weight":74.3,"Target_UF_Volume":2.4,
         "Ultrafiltration_Rate":0.60,"Blood_Flow_Rate":300,
         "Dialysate_Temperature":36.5,"UF_BW_Perc":3.3,"idh":False,
         "nurse_events":[],
         "ap_sections":{"current_management":"Amlodipine 5mg QD",
                        "important_notes":"血壓控制穩定",
                        "comorbidities":"HTN, CAD","esa":""},
         "orders":[{"drug":"amlodipine 5mg"},{"drug":"aspirin 100mg"}]},
        {"pid":"PT-002","session_date":"2024-10-09","Age":58,"Sex":"M",
         "comorbidities":"HTN, CAD","baseline_sbp":151,
         "Dry_Weight":72.0,"Pre_HD_Weight":74.5,"Target_UF_Volume":2.5,
         "Ultrafiltration_Rate":0.63,"Blood_Flow_Rate":300,
         "Dialysate_Temperature":36.5,"UF_BW_Perc":3.5,"idh":False,
         "nurse_events":[],
         "ap_sections":{"current_management":"Amlodipine 5mg QD",
                        "important_notes":"血壓控制穩定",
                        "comorbidities":"HTN, CAD","esa":""},
         "orders":[{"drug":"amlodipine 5mg"},{"drug":"aspirin 100mg"}]},
    ],
    "PT-003": [
        {"pid":"PT-003","session_date":"2024-10-01","Age":64,"Sex":"F",
         "comorbidities":"DM, HTN, CHF, CAD","baseline_sbp":108,
         "Dry_Weight":48.5,"Pre_HD_Weight":51.2,"Target_UF_Volume":3.0,
         "Ultrafiltration_Rate":0.75,"Blood_Flow_Rate":250,
         "Dialysate_Temperature":37.0,"UF_BW_Perc":6.2,"idh":True,
         "nurse_events":[{"ts":"14:00","symptoms":["低血壓","冒冷汗"],
                          "interventions":["生理食鹽水 200mL","暫停超過濾"]}],
         "ap_sections":{"current_management":"Midodrine 10mg + Fludrocortisone 0.1mg",
                        "important_notes":"DNR 同意書已簽署。反覆低血壓高風險。",
                        "comorbidities":"DM, HTN, CHF, CAD",
                        "esa":"Erythropoietin 4000IU QW"},
         "orders":[{"drug":"midodrine 10mg"},{"drug":"fludrocortisone 0.1mg"},
                   {"drug":"erythropoietin 4000IU"}]},
        {"pid":"PT-003","session_date":"2024-10-04","Age":64,"Sex":"F",
         "comorbidities":"DM, HTN, CHF, CAD","baseline_sbp":102,
         "Dry_Weight":48.5,"Pre_HD_Weight":51.5,"Target_UF_Volume":3.2,
         "Ultrafiltration_Rate":0.80,"Blood_Flow_Rate":250,
         "Dialysate_Temperature":37.0,"UF_BW_Perc":6.6,"idh":True,
         "nurse_events":[{"ts":"13:50","symptoms":["低血壓"],
                          "interventions":["生理食鹽水 100mL"]}],
         "ap_sections":{"current_management":"Midodrine 10mg + Fludrocortisone 0.1mg",
                        "important_notes":"DNR 同意書已簽署。反覆低血壓高風險。",
                        "comorbidities":"DM, HTN, CHF, CAD",
                        "esa":"Erythropoietin 4000IU QW"},
         "orders":[{"drug":"midodrine 10mg"},{"drug":"fludrocortisone 0.1mg"},
                   {"drug":"erythropoietin 4000IU"}]},
        {"pid":"PT-003","session_date":"2024-10-08","Age":64,"Sex":"F",
         "comorbidities":"DM, HTN, CHF, CAD","baseline_sbp":99,
         "Dry_Weight":48.5,"Pre_HD_Weight":51.8,"Target_UF_Volume":3.3,
         "Ultrafiltration_Rate":0.83,"Blood_Flow_Rate":250,
         "Dialysate_Temperature":37.0,"UF_BW_Perc":6.8,"idh":True,
         "nurse_events":[{"ts":"14:20","symptoms":["低血壓","噁心"],
                          "interventions":["生理食鹽水 200mL","暫停超過濾","涼透析液調整"]}],
         "ap_sections":{"current_management":"Midodrine 10mg + Fludrocortisone 0.1mg",
                        "important_notes":"DNR 同意書已簽署。反覆低血壓高風險。",
                        "comorbidities":"DM, HTN, CHF, CAD",
                        "esa":"Erythropoietin 4000IU QW"},
         "orders":[{"drug":"midodrine 10mg"},{"drug":"fludrocortisone 0.1mg"},
                   {"drug":"erythropoietin 4000IU"}]},
        {"pid":"PT-003","session_date":"2024-10-11","Age":64,"Sex":"F",
         "comorbidities":"DM, HTN, CHF, CAD","baseline_sbp":105,
         "Dry_Weight":48.5,"Pre_HD_Weight":51.8,"Target_UF_Volume":3.3,
         "Ultrafiltration_Rate":0.83,"Blood_Flow_Rate":250,
         "Dialysate_Temperature":37.0,"UF_BW_Perc":6.8,"idh":False,
         "nurse_events":[{"ts":"13:30","symptoms":[],"interventions":[]}],
         "ap_sections":{"current_management":"Midodrine 10mg + Fludrocortisone 0.1mg",
                        "important_notes":"DNR 同意書已簽署。反覆低血壓高風險。",
                        "comorbidities":"DM, HTN, CHF, CAD",
                        "esa":"Erythropoietin 4000IU QW"},
         "orders":[{"drug":"midodrine 10mg"},{"drug":"fludrocortisone 0.1mg"},
                   {"drug":"erythropoietin 4000IU"}]},
    ],
}

# ---------- helpers ----------------------------------------------------------
WINDOW = 3

def _is_idh(v):
    return v in (True, 1, "True", "TRUE", "true")

def _lifetime_idh_rate(sessions):
    labeled = [s for s in sessions if s.get("idh") is not None]
    if not labeled:
        return 0.0
    return sum(1 for s in labeled if _is_idh(s["idh"])) / len(labeled)

def _prior_idh_window(sessions, idx):
    return sum(1 for s in sessions[max(0, idx-WINDOW):idx] if _is_idh(s.get("idh")))

def _recent_sbp(sessions, idx, n=4):
    return [s["baseline_sbp"] for s in sessions[max(0, idx-n+1):idx+1]]

def _mock_risk(session, prior_idh):
    sbp   = session.get("baseline_sbp", 130)
    uf    = session.get("UF_BW_Perc", 4.0)
    temp  = session.get("Dialysate_Temperature", 36.5)
    prior = prior_idh / WINDOW
    raw = (0.30 * max(0, (130-sbp)/60)
         + 0.25 * min(1, uf/8.0)
         + 0.20 * max(0, (temp-35.5)/2.5)
         + 0.25 * prior)
    risk = float(max(0.03, min(0.97, raw)))
    return risk, round(0.02+risk*0.05, 3), round(0.005+(1-abs(risk-0.5)*2)*0.02, 3)

def _attention(session, risk):
    sbp  = session.get("baseline_sbp", 130)
    uf   = session.get("UF_BW_Perc", 4.0)
    temp = session.get("Dialysate_Temperature", 36.5)
    raw = {
        "Pre_HD_SBP":            max(0.05, (140-sbp)/120),
        "UF_BW_Perc":            max(0.05, uf/10),
        "Ultrafiltration_Rate":  max(0.04, uf/12),
        "Dialysate_Temperature": max(0.03, (temp-34)/8),
        "prior_idh_label_w":     0.10*risk,
        "Dry_Weight":            0.07,
        "Age":                   0.05,
        "Heart_Rate":            0.04,
        "Sex":                   0.02,
        "DM":                    0.01,
    }
    total = sum(raw.values())
    return {k: round(v/total, 3) for k, v in raw.items()}

def _build_response(pid, sessions, idx):
    s = sessions[idx]
    prior = _prior_idh_window(sessions, idx)
    risk, al, ep = _mock_risk(s, prior)
    ap = s.get("ap_sections") or {}
    nurse_symp   = sorted({sym for e in (s.get("nurse_events") or []) for sym in (e.get("symptoms") or [])})
    nurse_interv = sorted({iv  for e in (s.get("nurse_events") or []) for iv  in (e.get("interventions") or [])})
    return {
        "pid":               pid,
        "name":              f"Patient {pid}",
        "age":               s.get("Age", "?"),
        "sex":               s.get("Sex", "?"),
        "comorbidities":     s.get("comorbidities", ""),
        "totalSessions":     len(sessions),
        "lifetimeIDHRate":   round(_lifetime_idh_rate(sessions), 3),
        "recentSBP":         _recent_sbp(sessions, idx),
        "priorIDHWindow":    prior,
        "activeOrders":      [o["drug"] for o in (s.get("orders") or []) if o.get("drug")][:6],
        "importantNotes":    ap.get("important_notes") or "",
        "currentManagement": ap.get("current_management") or "",
        "esa":               ap.get("esa") or "",
        "nurseSymptoms":     nurse_symp,
        "nurseInterventions":nurse_interv,
        "currentSession": {
            "sessionDate":  s.get("session_date"),
            "PreHD_SBP":    s.get("baseline_sbp"),
            "DryWeight":    s.get("Dry_Weight"),
            "PreHD_Weight": s.get("Pre_HD_Weight"),
            "TargetUF":     s.get("Target_UF_Volume"),
            "UFRate":       s.get("Ultrafiltration_Rate"),
            "BloodFlow":    s.get("Blood_Flow_Rate"),
            "DialysateTemp":s.get("Dialysate_Temperature"),
            "UF_BW_Perc":   s.get("UF_BW_Perc"),
        },
        "risk":             risk,
        "aleatoric":        al,
        "epistemic":        ep,
        "attentionWeights": _attention(s, risk),
        "shapeCurves": {
            "Pre_HD_SBP":           _shape_sbp(s.get("baseline_sbp", 130)),
            "UF_BW_Perc":           _shape_uf(s.get("UF_BW_Perc", 4.0)),
            "Ultrafiltration_Rate": _shape_rate(s.get("Ultrafiltration_Rate", 0.65)),
            "Dialysate_Temperature":_shape_temp(s.get("Dialysate_Temperature", 36.5)),
        },
        "sessionDate": s.get("session_date"),
        "idh_actual":  s.get("idh"),
    }

def _system_prompt(pt):
    top3 = sorted(pt["attentionWeights"].items(), key=lambda x: -x[1])[:3]
    top3_text = "\n".join(f"  - {k} (attention {v*100:.0f}%)" for k, v in top3)
    is_dnr = "DNR" in (pt.get("importantNotes") or "")
    s = pt["currentSession"]
    return f"""You are a hemodialysis clinical decision-support AI assistant (clinician-in-the-loop; does not replace physician judgment).

[Patient Data]
- ID: {pt['pid']}, Age {pt['age']}, Sex {pt['sex']}, Comorbidities: {pt['comorbidities']}
- Total sessions: {pt['totalSessions']}, Lifetime IDH rate: {pt['lifetimeIDHRate']*100:.0f}%
- Recent SBP trend: {' -> '.join(str(x) for x in pt['recentSBP'])} mmHg
- IDH in recent window: {pt['priorIDHWindow']}/3 sessions
- Medications: {', '.join(pt['activeOrders']) or 'none'}
- Important notes: {pt['importantNotes'] or 'none'}
- Current management: {pt['currentManagement'] or 'none'}
- ESA: {pt['esa'] or 'none'}
- Nurse-recorded symptoms: {pt['nurseSymptoms'] or 'none'}
- Nurse interventions: {pt['nurseInterventions'] or 'none'}

[Current Session ({s['sessionDate']})]
- SBP {s['PreHD_SBP']} mmHg, Dry weight {s['DryWeight']} kg, Pre-HD weight {s['PreHD_Weight']} kg
- UF target {s['TargetUF']} L / rate {s['UFRate']} L/hr / body weight ratio {s['UF_BW_Perc']:.1f}%
- Dialysate temp {s['DialysateTemp']} degC, Blood flow {s['BloodFlow']} mL/min

[NAM-LSS Model Prediction]
- IDH risk: {pt['risk']*100:.1f}% (Aleatoric={pt['aleatoric']:.3f}, Epistemic={pt['epistemic']:.3f})
- Top features:
{top3_text}

[Vetted Intervention List - ONLY choose from these]
{chr(10).join('  - ' + v for v in VETTED_INTERVENTIONS)}

[Rules]
1. Only recommend interventions from the list above.
2. If IDH risk >= 40%, proactively suggest 1-3 interventions with data-based rationale.
3. {'Patient has signed DNR - use conservative tone, avoid overly aggressive suggestions.' if is_dnr else 'No special constraints.'}
4. Be concise. Say "uncertain" when uncertain. Do not fabricate information."""

# ---------- FastAPI ----------------------------------------------------------
app = FastAPI(title="IDH Agent Demo", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/patients")
def list_patients():
    result = []
    for pid, sessions in MOCK_SESSIONS.items():
        last = sessions[-1]
        prior = _prior_idh_window(sessions, len(sessions)-1)
        risk, _, _ = _mock_risk(last, prior)
        result.append({"pid": pid, "name": f"Patient {pid}",
                        "age": last.get("Age","?"), "sex": last.get("Sex","?"),
                        "risk": round(risk, 3)})
    result.sort(key=lambda x: -x["risk"])
    return result

@app.get("/api/patients/{pid}")
def get_patient(pid: str):
    if pid not in MOCK_SESSIONS:
        raise HTTPException(404, f"Patient {pid} not found")
    sessions = MOCK_SESSIONS[pid]
    return _build_response(pid, sessions, len(sessions)-1)

@app.get("/api/patients/{pid}/sessions")
def list_sessions(pid: str):
    if pid not in MOCK_SESSIONS:
        raise HTTPException(404, f"Patient {pid} not found")
    return [{"index": i, "date": s["session_date"],
             "idh": _is_idh(s.get("idh")), "sbp": s.get("baseline_sbp")}
            for i, s in enumerate(MOCK_SESSIONS[pid])]

@app.get("/api/patients/{pid}/sessions/{idx}")
def get_session(pid: str, idx: int):
    if pid not in MOCK_SESSIONS:
        raise HTTPException(404, f"Patient {pid} not found")
    sessions = MOCK_SESSIONS[pid]
    if idx < 0 or idx >= len(sessions):
        raise HTTPException(400, f"Index {idx} out of range")
    return _build_response(pid, sessions, idx)

class ChatRequest(BaseModel):
    pid: str
    messages: list[dict[str, str]]

@app.post("/api/chat")
async def chat(req: ChatRequest):
    if req.pid not in MOCK_SESSIONS:
        raise HTTPException(404, f"Patient {req.pid} not found")
    if not GEMINI_API_KEY:
        async def no_key():
            msg = json.dumps({"error": "GEMINI_API_KEY not set."})
            yield "data: " + msg + "\n\n"
        return StreamingResponse(no_key(), media_type="text/event-stream")

    sessions = MOCK_SESSIONS[req.pid]
    pt = _build_response(req.pid, sessions, len(sessions)-1)
    system = _system_prompt(pt)

    # Gemini non-streaming endpoint (more reliable than SSE for parsing)
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        + GEMINI_MODEL
        + ":generateContent?key="
        + GEMINI_API_KEY
    )

    gemini_messages = []
    for m in req.messages:
        role = "user" if m["role"] == "user" else "model"
        gemini_messages.append({"role": role, "parts": [{"text": m["content"]}]})

    # Ensure conversation starts with user role
    if not gemini_messages or gemini_messages[0]["role"] != "user":
        gemini_messages.insert(0, {"role": "user", "parts": [{"text": "Hello"}]})

    payload = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": gemini_messages,
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024},
    }

    async def generate():
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()

                # Extract text from Gemini response
                text = (
                    data.get("candidates", [{}])[0]
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "")
                )

                if not text:
                    # Log full response for debugging
                    err = json.dumps({"error": "Empty response from Gemini: " + json.dumps(data)[:200]})
                    yield "data: " + err + "\n\n"
                    return

                # Simulate streaming by yielding chunks
                words = text.split(" ")
                chunk_size = 5
                for i in range(0, len(words), chunk_size):
                    chunk_text = " ".join(words[i:i+chunk_size])
                    if i + chunk_size < len(words):
                        chunk_text += " "
                    chunk = json.dumps({"message": {"content": chunk_text}, "done": False})
                    yield "data: " + chunk + "\n\n"

            done_msg = json.dumps({"done": True})
            yield "data: " + done_msg + "\n\n"

        except httpx.HTTPStatusError as e:
            err_msg = json.dumps({"error": "Gemini API error: " + str(e.response.text)[:300]})
            yield "data: " + err_msg + "\n\n"
        except Exception as e:
            err_msg = json.dumps({"error": str(e)})
            yield "data: " + err_msg + "\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/status")
def status():
    return {
        "mode":         "mock",
        "n_patients":   len(MOCK_SESSIONS),
        "n_sessions":   sum(len(v) for v in MOCK_SESSIONS.values()),
        "chat_enabled": bool(GEMINI_API_KEY),
        "model":        GEMINI_MODEL,
        "note":         "Synthetic data only. No real patient records.",
    }


# ---------- serve frontend ---------------------------------------------------
_static = Path(__file__).parent.parent / "frontend" / "dist"
if _static.exists():
    app.mount("/", StaticFiles(directory=str(_static), html=True), name="static")
else:
    @app.get("/")
    def root():
        return {"status": "ok", "note": "Run 'npm run build' in frontend/ first"}
