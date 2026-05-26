import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { loadModels, matchFaces } from '../lib/faceApi'

// Grupos de puntos para dibujar la malla facial (68 landmarks)
const MESH_GROUPS = [
  [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
  [17,18,19,20,21],
  [22,23,24,25,26],
  [27,28,29,30],
  [30,31,32,33,34,35],
  [36,37,38,39,40,41,36],
  [42,43,44,45,46,47,42],
  [48,49,50,51,52,53,54,55,56,57,58,59,48],
  [60,61,62,63,64,65,66,67,60],
]

function drawFace(ctx, { box, landmarks, nombre, persona }) {
  const reconocido = nombre !== 'Desconocido'
  const green   = '#30d158'
  const blue    = '#0a84ff'
  const color   = reconocido ? green : blue
  const colorDim = reconocido ? 'rgba(48,209,88,0.45)' : 'rgba(10,132,255,0.45)'
  const dotColor = reconocido ? 'rgba(48,209,88,0.85)' : 'rgba(10,132,255,0.85)'

  // ── Malla de puntos (landmarks) ──────────────────────────────────────────
  ctx.lineWidth   = 0.7
  ctx.strokeStyle = colorDim
  for (const group of MESH_GROUPS) {
    ctx.beginPath()
    ctx.moveTo(landmarks[group[0]].x, landmarks[group[0]].y)
    for (let i = 1; i < group.length; i++) {
      ctx.lineTo(landmarks[group[i]].x, landmarks[group[i]].y)
    }
    ctx.stroke()
  }
  for (const pt of landmarks) {
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 1.3, 0, Math.PI * 2)
    ctx.fillStyle = dotColor
    ctx.fill()
  }

  // ── Marco redondeado alrededor de la cara ─────────────────────────────────
  const { x, y, width, height } = box
  const r = 10
  ctx.strokeStyle = color
  ctx.lineWidth   = 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.stroke()

  // ── Etiqueta flotante con nombre ──────────────────────────────────────────
  const label    = reconocido ? nombre : 'Desconocido'
  const fontSize = Math.max(13, Math.min(18, width * 0.12))
  ctx.font       = `600 ${fontSize}px Inter, system-ui, sans-serif`
  const tw       = ctx.measureText(label).width
  const padX     = 12, padY = 6
  const lw       = tw + padX * 2
  const lh       = fontSize + padY * 2
  const lx       = x + width / 2 - lw / 2
  const ly       = y - lh - 8

  // Fondo pill
  ctx.fillStyle = reconocido ? 'rgba(48,209,88,0.92)' : 'rgba(10,132,255,0.92)'
  roundRect(ctx, lx, Math.max(4, ly), lw, lh, lh / 2)
  ctx.fill()

  // Texto
  ctx.fillStyle   = reconocido ? '#000' : '#fff'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, lx + padX, Math.max(4 + lh / 2, ly + lh / 2))

  // Línea conectora de la etiqueta a la cara
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.lineWidth   = 1
  ctx.setLineDash([3, 3])
  ctx.moveTo(x + width / 2, Math.max(4 + lh, ly + lh))
  ctx.lineTo(x + width / 2, y)
  ctx.stroke()
  ctx.setLineDash([])
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ─────────────────────────────────────────────────────────────────────────────

export default function RecognizeLive() {
  const [appState,     setAppState]   = useState('idle')
  const [personas,     setPersonas]   = useState([])
  const [detected,     setDetected]   = useState([])
  const [errorMsg,     setErrorMsg]   = useState('')
  const [bootMsg,      setBootMsg]    = useState('')
  const [faceCount,    setFaceCount]  = useState(0)

  const videoRef      = useRef(null)
  const canvasRef     = useRef(null)
  const streamRef     = useRef(null)
  const rafRef        = useRef(null)
  const frameN        = useRef(0)
  const clearTimerRef = useRef(null)   // timer para limpiar resultados con delay
  const lastResultRef = useRef([])     // última detección válida (para estabilidad)

  useEffect(() => { boot(); return () => stopCamera() }, [])

  async function boot() {
    setAppState('booting'); setBootMsg('Cargando modelos de IA…')
    try {
      await loadModels()
      setBootMsg('Sincronizando base de datos…')
      await fetchPersonas()
      setAppState('ready'); setBootMsg('')
    } catch (e) {
      setErrorMsg('Error al iniciar: ' + e.message); setAppState('idle')
    }
  }

  async function fetchPersonas() {
    const { data, error } = await supabase
      .from('personas')
      .select('id,nombre,edad,carrera,email,telefono,id_institucional,notas,foto_url,face_descriptor')
    if (error) throw error
    setPersonas(
      data.filter(p => p.face_descriptor).map(p => ({
        ...p,
        descriptor: new Float32Array(JSON.parse(p.face_descriptor)),
      }))
    )
  }

  async function startCamera() {
    setErrorMsg(''); setDetected([])
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setAppState('scanning')
      startLoop()
    } catch {
      setErrorMsg('No se pudo acceder a la cámara.'); setAppState('ready')
    }
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setAppState('ready'); setDetected([]); setFaceCount(0)
    lastResultRef.current = []
  }

  const startLoop = useCallback(() => {
    async function tick() {
      frameN.current++

      // Procesar cada 6 frames (~10 análisis/seg) — menos parpadeo
      if (frameN.current % 6 === 0) {
        const video  = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas || video.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick); return
        }

        // Solo redimensionar canvas si cambió el tamaño de video
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width  = video.videoWidth
          canvas.height = video.videoHeight
        }
        const ctx = canvas.getContext('2d')

        try {
          const resultados = await matchFaces(video, personas)

          if (resultados.length > 0) {
            // ── Hay caras → cancelar timer de limpieza y actualizar
            if (clearTimerRef.current) {
              clearTimeout(clearTimerRef.current)
              clearTimerRef.current = null
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height)
            for (const r of resultados) drawFace(ctx, r)

            const reconocidas = Object.values(
              Object.fromEntries(
                resultados.filter(r => r.nombre !== 'Desconocido')
                  .map(r => [r.persona.id, r.persona])
              )
            )

            lastResultRef.current = reconocidas
            setFaceCount(resultados.length)
            setDetected(reconocidas)
            setAppState('active')

          } else {
            // ── Sin caras → esperar 1.5s antes de limpiar (evita parpadeo)
            if (!clearTimerRef.current) {
              clearTimerRef.current = setTimeout(() => {
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                setDetected([])
                setFaceCount(0)
                setAppState('scanning')
                lastResultRef.current = []
                clearTimerRef.current = null
              }, 1500)
            }
            // Mientras tanto, redibuja la última detección válida en el canvas
            // (no borrar, dejar que el canvas mantenga el último estado)
          }
        } catch { /* frame incompleto */ }
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [personas])

  useEffect(() => {
    if (['scanning','active'].includes(appState)) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      startLoop()
    }
  }, [personas])

  const camActive = ['scanning','active'].includes(appState)

  const ringClass = appState === 'active'   ? 'ring-recognized'
                  : appState === 'scanning' ? 'ring-scanning'
                  : 'ring-idle'

  const statusText = {
    idle:     '',
    booting:  bootMsg,
    ready:    `${personas.length} persona${personas.length !== 1 ? 's' : ''} registrada${personas.length !== 1 ? 's' : ''}`,
    scanning: 'Buscando rostros…',
    active:   faceCount === 1
                ? `${detected.length > 0 ? '✓ ' + detected[0]?.nombre : '1 cara detectada'}`
                : `${faceCount} caras detectadas · ${detected.length} reconocida${detected.length !== 1 ? 's' : ''}`,
  }[appState] ?? ''

  return (
    <div className="faceid-page">

      {/* ── Ventana de escaneo panorámica ── */}
      <div className="scan-wrap">
        <div className={`scan-ring-wide ${ringClass}`}>
          <div className="scan-window-wide">
            <video
              ref={videoRef} autoPlay muted playsInline
              className="scan-video"
              style={{ opacity: camActive ? 1 : 0, transform: 'scaleX(-1)' }}
            />
            <canvas ref={canvasRef} className="scan-canvas"
              style={{ transform: 'scaleX(-1)' }} />

            {!camActive && (
              <div className="scan-idle-overlay">
                <div className="idle-icon">
                  <FaceIcon />
                </div>
                <p className="idle-text">
                  {appState === 'booting' ? bootMsg : 'Listo para reconocer'}
                </p>
              </div>
            )}

            {appState === 'scanning' && <div className="scan-line" />}
          </div>
        </div>

        <div className={`scan-status ${appState === 'active' ? 'status-green' : ''}`}>
          {statusText}
        </div>

        {errorMsg && <div className="scan-error">{errorMsg}</div>}

        <div className="scan-actions">
          {!camActive && appState === 'ready' && (
            <button className="faceid-btn" onClick={startCamera}>
              Iniciar reconocimiento
            </button>
          )}
          {camActive && (
            <button className="faceid-btn faceid-btn-stop" onClick={stopCamera}>
              Detener
            </button>
          )}
          <button className="faceid-btn-ghost" onClick={async () => {
            setBootMsg('Recargando…')
            await fetchPersonas()
            setBootMsg('')
          }} disabled={appState === 'booting'}>
            🔄 Recargar personas
          </button>
        </div>
      </div>

      {/* ── Cards de personas reconocidas ── */}
      {detected.length > 0 && (
        <div className="persons-grid">
          {detected.map(p => (
            <PersonCard key={p.id} persona={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function PersonCard({ persona }) {
  return (
    <div className="person-glass-card">
      <div className="pgc-avatar">
        {persona.foto_url
          ? <img src={persona.foto_url} alt={persona.nombre} className="pgc-avatar-img" />
          : persona.nombre.charAt(0).toUpperCase()
        }
      </div>
      <div className="pgc-body">
        <div className="pgc-name">{persona.nombre}</div>
        <div className="pgc-sub">
          {[persona.carrera, persona.edad ? `${persona.edad} años` : null].filter(Boolean).join(' · ')}
        </div>
        <div className="pgc-fields">
          {persona.id_institucional && <Chip icon="🪪" val={persona.id_institucional} />}
          {persona.email            && <Chip icon="✉️"  val={persona.email} />}
          {persona.telefono         && <Chip icon="📞" val={persona.telefono} />}
          {persona.notas            && <Chip icon="📝" val={persona.notas} />}
        </div>
      </div>
    </div>
  )
}

function Chip({ icon, val }) {
  return (
    <div className="pgc-chip">
      <span>{icon}</span><span>{val}</span>
    </div>
  )
}

function FaceIcon() {
  return (
    <svg viewBox="0 0 80 80" width="64" height="64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2"  y="2"  width="18" height="18" rx="5" stroke="rgba(255,255,255,0.25)" strokeWidth="2"/>
      <rect x="60" y="2"  width="18" height="18" rx="5" stroke="rgba(255,255,255,0.25)" strokeWidth="2"/>
      <rect x="2"  y="60" width="18" height="18" rx="5" stroke="rgba(255,255,255,0.25)" strokeWidth="2"/>
      <rect x="60" y="60" width="18" height="18" rx="5" stroke="rgba(255,255,255,0.25)" strokeWidth="2"/>
      <ellipse cx="40" cy="36" rx="18" ry="22" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="4 3"/>
      <circle cx="33" cy="32" r="2.5" fill="rgba(255,255,255,0.3)"/>
      <circle cx="47" cy="32" r="2.5" fill="rgba(255,255,255,0.3)"/>
      <path d="M33 44 Q40 49 47 44" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
