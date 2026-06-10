import { useState, useEffect, useRef, useCallback } from 'react'

const API = ''

function getRiskMeta(r) {
  if (r >= 0.6) return { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', label: '高風險', color: '#ef4444' }
  if (r >= 0.35) return { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', label: '中等風險', color: '#f59e0b' }
  return { bg: '#f0fdf4', border: '#86efac', text: '#14532d', label: '低風險', color: '#22c55e' }
}

function ShapeCurveChart({ curve }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !curve) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    const pad = { top: 14, right: 14, bottom: 34, left: 42 }
    const cw = W - pad.left - pad.right
    const ch = H - pad.top - pad.bottom
    ctx.clearRect(0, 0, W, H)
    const { points, xMin, xMax, currentVal } = curve
    const toX = v => pad.left + ((v - xMin) / (xMax - xMin)) * cw
    const toY = v => pad.top + ch - v * ch
    ctx.strokeStyle = 'rgba(148,163,184,0.18)'; ctx.lineWidth = 0.5
    ;[0, 0.25, 0.5, 0.75, 1].forEach(v => {
      ctx.beginPath(); ctx.moveTo(pad.left, toY(v)); ctx.lineTo(pad.left + cw, toY(v)); ctx.stroke()
    })
    ctx.beginPath()
    ctx.moveTo(toX(points[0][0]), toY(0))
    points.forEach(([x, y]) => ctx.lineTo(toX(x), toY(y)))
    ctx.lineTo(toX(points[points.length - 1][0]), toY(0))
    ctx.closePath()
    ctx.fillStyle = 'rgba(99,102,241,0.08)'; ctx.fill()
    ctx.beginPath(); ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2
    points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(toX(x), toY(y)) : ctx.lineTo(toX(x), toY(y)))
    ctx.stroke()
    const closest = points.reduce((b, p) => Math.abs(p[0] - currentVal) < Math.abs(b[0] - currentVal) ? p : b, points[0])
    const mx = toX(currentVal), my = toY(closest[1])
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(239,68,68,0.35)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(mx, pad.top); ctx.lineTo(mx, pad.top + ch); ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#ef4444'; ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px system-ui'; ctx.textAlign = 'right'
    ;[0, 0.25, 0.5, 0.75, 1].forEach(v => ctx.fillText((v * 100).toFixed(0) + '%', pad.left - 5, toY(v) + 3))
    ctx.textAlign = 'center'
    for (let i = 0; i <= 4; i++) {
      const xv = xMin + (xMax - xMin) * i / 4
      ctx.fillText(xv % 1 === 0 ? xv.toFixed(0) : xv.toFixed(1), toX(xv), pad.top + ch + 16)
    }
    ctx.fillStyle = '#ef4444'; ctx.font = '500 11px system-ui'
    ctx.textAlign = mx > W * 0.75 ? 'right' : 'center'
    ctx.fillText(currentVal % 1 === 0 ? currentVal.toFixed(0) : currentVal.toFixed(1), mx > W * 0.75 ? mx - 4 : mx, my - 10)
  }, [curve])
  if (!curve) return null
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <p style={{ fontSize: '11px', color: 'var(--color-text-2)', marginBottom: '5px', fontWeight: 500 }}>{curve.label}</p>
      <div style={{ position: 'relative', height: '110px', width: '100%' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}

function AttentionBars({ weights }) {
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const max = sorted[0][1]
  const shades = ['#6366f1','#6366f1','#818cf8','#818cf8','#a5b4fc','#a5b4fc','#c7d2fe','#ddd6fe']
  return (
    <div>
      {sorted.map(([feat, w], i) => (
        <div key={feat} style={{ marginBottom: '7px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-text-2)', fontFamily: 'monospace' }}>{feat}</span>
            <span style={{ fontSize: '11px', color: 'var(--color-text-3)' }}>{(w * 100).toFixed(0)}%</span>
          </div>
          <div style={{ height: '5px', background: 'var(--color-surface-2)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(w / max) * 100}%`, background: shades[i], borderRadius: '3px', transition: 'width 0.5s ease' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function RiskGauge({ risk }) {
  const rm = getRiskMeta(risk)
  const pct = Math.round(risk * 100)
  const angle = -135 + risk * 270
  return (
    <div style={{ background: rm.bg, border: `1px solid ${rm.border}`, borderRadius: 'var(--radius-lg)', padding: '1.25rem', textAlign: 'center' }}>
      <svg viewBox="0 0 120 80" style={{ width: '110px', height: '73px', display: 'block', margin: '0 auto 8px' }}>
        <path d="M10 70 A55 55 0 0 1 110 70" fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="10" strokeLinecap="round" />
        <path d="M10 70 A55 55 0 0 1 110 70" fill="none" stroke={rm.color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${risk * 172.8} 172.8`} />
        <line x1="60" y1="70"
          x2={60 + 36 * Math.cos((angle - 90) * Math.PI / 180)}
          y2={70 + 36 * Math.sin((angle - 90) * Math.PI / 180)}
          stroke={rm.text} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="60" cy="70" r="4" fill={rm.text} />
      </svg>
      <div style={{ fontSize: '26px', fontWeight: 500, color: rm.text, lineHeight: 1 }}>{pct}%</div>
      <div style={{ fontSize: '11px', color: rm.text, marginTop: '4px', fontWeight: 500 }}>{rm.label}</div>
    </div>
  )
}

function ChatMsg({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '10px', gap: '7px', alignItems: 'flex-start' }}>
      {!isUser && (
        <div style={{ width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0, marginTop: '2px', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-robot" style={{ fontSize: '13px', color: '#6366f1' }} />
        </div>
      )}
      <div style={{
        maxWidth: '82%', fontSize: '13px', lineHeight: '1.65', whiteSpace: 'pre-wrap',
        background: isUser ? 'rgba(99,102,241,0.1)' : 'var(--color-surface-2)',
        border: '0.5px solid var(--color-border)',
        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        padding: '9px 13px', color: 'var(--color-text)',
      }}>
        {msg.content}
        {msg.streaming && <span style={{ display: 'inline-block', width: '5px', height: '12px', background: 'var(--color-text-3)', marginLeft: '2px', verticalAlign: 'text-bottom', animation: 'blink 1s infinite' }} />}
      </div>
    </div>
  )
}

export default function App() {
  const [patients, setPatients] = useState([])
  const [selectedPid, setSelectedPid] = useState(null)
  const [patient, setPatient] = useState(null)
  const [sessions, setSessions] = useState([])
  const [selectedSessionIdx, setSelectedSessionIdx] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('shape')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [statusInfo, setStatusInfo] = useState(null)
  const chatEndRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/api/status`).then(r => r.json()).then(setStatusInfo).catch(() => {})
    fetch(`${API}/api/patients`)
      .then(r => r.json())
      .then(data => { setPatients(data); if (data.length) setSelectedPid(data[0].pid) })
      .catch(() => {})
  }, [])

  // load session list when patient changes
  useEffect(() => {
    if (!selectedPid) return
    fetch(`${API}/api/patients/${selectedPid}/sessions`)
      .then(r => r.json())
      .then(data => {
        setSessions(data)
        setSelectedSessionIdx(data.length - 1)
      })
      .catch(() => setSessions([]))
  }, [selectedPid])

  // load patient detail when session changes
  useEffect(() => {
    if (!selectedPid || selectedSessionIdx === null) return
    setLoading(true)
    const url = selectedSessionIdx !== null
      ? `${API}/api/patients/${selectedPid}/sessions/${selectedSessionIdx}`
      : `${API}/api/patients/${selectedPid}`
    fetch(url)
      .then(r => r.json())
      .then(data => {
        setPatient(data)
        setLoading(false)
        setMessages([{
          role: 'assistant',
          content: `病人 ${data.pid}　${data.currentSession?.sessionDate || ''}\nIDH 預測風險：${(data.risk * 100).toFixed(1)}%${data.risk >= 0.4
            ? '\n\n⚠️ 風險偏高，建議評估超過濾速率與透析液溫度。'
            : '\n\n目前風險低，繼續常規監測。'}`,
        }])
      })
      .catch(() => setLoading(false))
  }, [selectedPid, selectedSessionIdx])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming || !selectedPid) return
    setInput('')
    const userMsg = { role: 'user', content: text }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setStreaming(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }])
    try {
      abortRef.current = new AbortController()
      const resp = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: selectedPid, messages: newMsgs.map(m => ({ role: m.role, content: m.content })) }),
        signal: abortRef.current.signal,
      })
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = '', fullReply = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const obj = JSON.parse(line.slice(6))
              if (obj.error) { fullReply = `⚠️ ${obj.error}`; break }
              if (obj.message?.content) fullReply += obj.message.content
            } catch {}
          }
        }
        setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: fullReply, streaming: true }; return u })
      }
      setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: fullReply || '（無回應）', streaming: false }; return u })
    } catch (err) {
      if (err.name === 'AbortError') return
      setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: `⚠️ 連線失敗：${err.message}`, streaming: false }; return u })
    } finally { setStreaming(false) }
  }, [input, streaming, messages, selectedPid])

  const topShapeFeats = patient
    ? Object.entries(patient.attentionWeights || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f]) => f).filter(f => patient.shapeCurves?.[f])
    : []
  const sess = patient?.currentSession || {}

  return (
    <>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { to { transform: rotate(360deg); } }
        .tab { background:none; border:none; padding:8px 14px; font-size:12px; font-weight:500; color:var(--color-text-2); border-bottom:2px solid transparent; cursor:pointer; transition:all 0.15s; }
        .tab.active { color:var(--color-indigo); border-bottom-color:var(--color-indigo); }
        .tab:hover:not(.active) { color:var(--color-text); }
        .pt-row { display:flex; align-items:center; justify-content:space-between; padding:9px 10px; border-radius:var(--radius-md); cursor:pointer; border:0.5px solid transparent; margin-bottom:3px; transition:all 0.12s; }
        .pt-row:hover { background:var(--color-surface-2); }
        .pt-row.sel { background:var(--color-indigo-light); border-color:rgba(99,102,241,0.3); }
        .sess-btn { width:100%; text-align:left; background:none; border:0.5px solid var(--color-border); border-radius:6px; padding:5px 8px; font-size:11px; margin-bottom:3px; cursor:pointer; transition:all 0.12s; display:flex; justify-content:space-between; align-items:center; }
        .sess-btn:hover { background:var(--color-surface-2); }
        .sess-btn.active { border-color:var(--color-indigo); background:var(--color-indigo-light); }
        .send-btn { background:var(--color-indigo); color:#fff; border:none; border-radius:var(--radius-md); padding:0 14px; height:36px; font-size:13px; font-weight:500; flex-shrink:0; }
        .send-btn:hover:not(:disabled) { background:#4f46e5; }
        .send-btn:disabled { opacity:0.45; cursor:not-allowed; }
        .quick { font-size:11px; padding:3px 10px; border-radius:20px; background:var(--color-surface-2); border:0.5px solid var(--color-border); color:var(--color-text-2); cursor:pointer; }
        .quick:hover { border-color:var(--color-indigo); color:var(--color-indigo); }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* header */}
        <div style={{ padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '0.5px solid var(--color-border)', background: 'var(--color-surface)', flexShrink: 0 }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'var(--color-indigo-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-activity-heartbeat" style={{ fontSize: '15px', color: 'var(--color-indigo)' }} />
          </div>
          <span style={{ fontWeight: 500 }}>IDH Clinical Agent</span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-3)' }}>NAM-LSS V2 · 透析中低血壓決策支援</span>
          {statusInfo && (
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--color-text-3)', fontFamily: 'monospace' }}>
              {statusInfo.data_mode} · {statusInfo.n_patients} 病人 · {statusInfo.n_sessions} sessions
            </span>
          )}
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '210px 1fr 320px', overflow: 'hidden' }}>

          {/* col 1: patient list */}
          <div style={{ borderRight: '0.5px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 12px 8px', flexShrink: 0 }}>
              <p style={{ fontSize: '10px', fontWeight: 500, color: 'var(--color-text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>病人列表</p>
              <div style={{ overflowY: 'auto', maxHeight: '260px' }}>
                {patients.map(p => {
                  const rm = getRiskMeta(p.risk)
                  return (
                    <div key={p.pid} className={`pt-row${selectedPid === p.pid ? ' sel' : ''}`} onClick={() => { setSelectedPid(p.pid); setSelectedSessionIdx(null) }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '12px' }}>{p.pid}</div>
                        <div style={{ fontSize: '10px', color: 'var(--color-text-3)' }}>{p.age}y · {p.sex}</div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 6px', borderRadius: '4px', background: rm.bg, color: rm.text, border: `1px solid ${rm.border}` }}>
                        {Math.round(p.risk * 100)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* session timeline */}
            {sessions.length > 0 && (
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderTop: '0.5px solid var(--color-border)', padding: '10px 12px' }}>
                <p style={{ fontSize: '10px', fontWeight: 500, color: 'var(--color-text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px', flexShrink: 0 }}>
                  透析記錄 ({sessions.length} 次)
                </p>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {[...sessions].reverse().map((s) => (
                    <button key={s.index} className={`sess-btn${selectedSessionIdx === s.index ? ' active' : ''}`}
                      onClick={() => setSelectedSessionIdx(s.index)}>
                      <span style={{ color: 'var(--color-text-2)' }}>{s.date}</span>
                      <span style={{
                        fontSize: '10px', padding: '1px 5px', borderRadius: '3px',
                        background: s.idh ? '#fef2f2' : '#f0fdf4',
                        color: s.idh ? '#991b1b' : '#14532d',
                        border: `0.5px solid ${s.idh ? '#fca5a5' : '#86efac'}`,
                      }}>{s.idh ? 'IDH' : 'OK'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* current session vitals */}
            {patient && (
              <div style={{ padding: '10px 12px', borderTop: '0.5px solid var(--color-border)', flexShrink: 0 }}>
                {[
                  ['SBP', sess.PreHD_SBP, 'mmHg'],
                  ['UF 速率', sess.UFRate, 'L/hr'],
                  ['透析液溫', sess.DialysateTemp, '°C'],
                ].map(([label, val, unit]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-2)' }}>{label}</span>
                    <span style={{ fontSize: '11px', fontWeight: 500 }}>{val} <span style={{ fontSize: '10px', color: 'var(--color-text-3)' }}>{unit}</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* col 2: risk + explainability */}
          <div style={{ overflowY: 'auto', padding: '18px 22px' }}>
            {loading && <p style={{ color: 'var(--color-text-3)', fontSize: '13px' }}>載入中…</p>}
            {patient && !loading && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <RiskGauge risk={patient.risk} />
                  <div style={{ background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
                    <p style={{ fontSize: '10px', fontWeight: 500, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '7px' }}>病人概況</p>
                    <div style={{ fontSize: '12px', lineHeight: '1.9' }}>
                      {[
                        ['共病', patient.comorbidities],
                        ['累計', `${patient.totalSessions} 次`],
                        ['IDH率', `${(patient.lifetimeIDHRate * 100).toFixed(0)}%`],
                        ['近窗', `${patient.priorIDHWindow}/${3} 次`],
                      ].map(([k, v]) => <div key={k}><span style={{ color: 'var(--color-text-2)' }}>{k}：</span>{v}</div>)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
                      {[['Aleatoric', patient.aleatoric, '#6366f1'], ['Epistemic', patient.epistemic, '#f59e0b']].map(([lbl, val, c]) => (
                        <div key={lbl} style={{ background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '5px', textAlign: 'center' }}>
                          <div style={{ fontSize: '10px', color: 'var(--color-text-3)' }}>{lbl}</div>
                          <div style={{ fontSize: '12px', fontWeight: 500, color: c }}>{val.toFixed(3)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {patient.importantNotes && (
                  <div style={{ display: 'flex', gap: '7px', alignItems: 'flex-start', marginBottom: '14px', padding: '8px 11px', borderRadius: 'var(--radius-md)', background: patient.importantNotes.includes('DNR') ? 'rgba(239,68,68,0.06)' : 'var(--color-surface-2)', border: `0.5px solid ${patient.importantNotes.includes('DNR') ? 'rgba(239,68,68,0.3)' : 'var(--color-border)'}` }}>
                    <i className="ti ti-alert-circle" style={{ fontSize: '14px', color: patient.importantNotes.includes('DNR') ? '#ef4444' : 'var(--color-text-3)', flexShrink: 0, marginTop: '1px' }} />
                    <span style={{ fontSize: '12px', lineHeight: '1.55' }}>{patient.importantNotes}</span>
                  </div>
                )}

                <div style={{ display: 'flex', borderBottom: '0.5px solid var(--color-border)', marginBottom: '14px' }}>
                  <button className={`tab${activeTab === 'shape' ? ' active' : ''}`} onClick={() => setActiveTab('shape')}>Shape Functions</button>
                  <button className={`tab${activeTab === 'attn' ? ' active' : ''}`} onClick={() => setActiveTab('attn')}>Attention Weights</button>
                </div>

                {activeTab === 'shape' && (
                  <div>
                    {topShapeFeats.map(f => <ShapeCurveChart key={f} curve={patient.shapeCurves[f]} />)}
                    <p style={{ fontSize: '11px', color: 'var(--color-text-3)', marginTop: '4px' }}>
                      <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#ef4444', marginRight: '5px', verticalAlign: 'middle' }} />
                      紅點為病人目前數值，Y 軸為 IDH 風險機率。
                    </p>
                  </div>
                )}
                {activeTab === 'attn' && (
                  <div>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-2)', marginBottom: '12px', lineHeight: '1.6' }}>模型注意力權重 — 越高代表模型在此次預測中越依賴該特徵。</p>
                    <AttentionBars weights={patient.attentionWeights} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* col 3: chat */}
          <div style={{ borderLeft: '0.5px solid var(--color-border)', display: 'flex', flexDirection: 'column', background: 'var(--color-surface)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <i className="ti ti-message-chatbot" style={{ fontSize: '15px', color: 'var(--color-indigo)' }} />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>臨床諮詢</span>
              <span style={{ marginLeft: 'auto', fontSize: '11px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(34,197,94,0.1)', color: '#15803d', border: '0.5px solid rgba(34,197,94,0.3)' }}>Ollama</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {messages.map((m, i) => <ChatMsg key={i} msg={m} />)}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: '6px 10px', borderTop: '0.5px solid var(--color-border)', display: 'flex', gap: '5px', flexWrap: 'wrap', flexShrink: 0 }}>
              {['建議介入措施', '解釋風險原因', '與上次比較', 'ESA 狀況'].map(q => (
                <button key={q} className="quick" onClick={() => setInput(q)}>{q}</button>
              ))}
            </div>
            <div style={{ padding: '8px 12px', borderTop: '0.5px solid var(--color-border)', display: 'flex', gap: '8px', flexShrink: 0 }}>
              <input type="text" value={input} placeholder="詢問臨床問題…"
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                disabled={streaming} style={{ flex: 1, fontSize: '13px' }} />
              <button className="send-btn" onClick={sendMessage} disabled={streaming || !input.trim()}>
                {streaming ? <i className="ti ti-loader-2" style={{ fontSize: '14px', animation: 'spin 1s linear infinite' }} /> : '送出'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
