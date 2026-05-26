import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { loadModels, getFaceDescriptor } from '../lib/faceApi'

const EMPTY = { nombre:'', edad:'', carrera:'', email:'', telefono:'', id_institucional:'', notas:'' }

const STEPS = [
  { text: 'Mira directamente a la cámara',   icon: '👁',  dir: 'center' },
  { text: 'Gira levemente a la derecha',      icon: '→',   dir: 'right'  },
  { text: 'Gira levemente a la izquierda',    icon: '←',   dir: 'left'   },
  { text: 'Inclina la cabeza hacia arriba',   icon: '↑',   dir: 'up'     },
  { text: 'Inclina la cabeza hacia abajo',    icon: '↓',   dir: 'down'   },
]

function avgDescriptors(descs) {
  const avg = new Float32Array(128)
  for (const d of descs) for (let i = 0; i < 128; i++) avg[i] += d[i]
  for (let i = 0; i < 128; i++) avg[i] /= descs.length
  return avg
}

export default function RegisterPerson() {
  const [form,        setForm]        = useState(EMPTY)
  const [savingState, setSaving]      = useState('idle')
  const [msg,         setMsg]         = useState('')
  const [ready,       setReady]       = useState(false)
  const [tab,         setTab]         = useState('camara')

  // Estado de captura multi-ángulo
  const [capturePhase, setCapturePhase] = useState('idle')
  // idle | detecting | step | complete | error
  const [currentStep,  setCurrentStep]  = useState(0)
  const [captured,     setCaptured]     = useState(0)   // cuántos ángulos capturados
  const [stepMsg,      setStepMsg]      = useState('')
  const [flashOk,      setFlashOk]      = useState(false)
  const [preview,      setPreview]      = useState(null)

  // Subida de archivo
  const [filePreview,  setFilePreview]  = useState(null)

  const videoRef     = useRef(null)
  const canvasRef    = useRef(null)
  const streamRef    = useRef(null)
  const fileRef      = useRef(null)
  const descriptorsRef = useRef([])
  const timerRef     = useRef(null)
  const capturingRef = useRef(false)

  useEffect(() => {
    loadModels().then(() => setReady(true))
      .catch(() => setMsg('Error al cargar modelos de IA.'))
    return () => { stopCam(); clearTimeout(timerRef.current) }
  }, [])

  // ── Cámara ────────────────────────────────────────────────────────────────
  async function startCam() {
    setMsg(''); setCapturePhase('idle'); setCaptured(0)
    setCurrentStep(0); setPreview(null); descriptorsRef.current = []
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = s
      videoRef.current.srcObject = s
      await videoRef.current.play()
      setCapturePhase('detecting')
      setStepMsg('Coloca tu cara dentro del óvalo')
      startCaptureLoop()
    } catch (e) {
      setMsg('Sin acceso a la cámara: ' + e.message)
    }
  }

  function stopCam() {
    capturingRef.current = false
    clearTimeout(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCapturePhase('idle')
  }

  // ── Bucle de captura automática ───────────────────────────────────────────
  const startCaptureLoop = useCallback(() => {
    capturingRef.current = true

    async function detect() {
      if (!capturingRef.current) return
      const video = videoRef.current
      if (!video || video.readyState < 2) { timerRef.current = setTimeout(detect, 200); return }

      // Dibuja el frame actual en canvas para detectar
      const c = canvasRef.current
      c.width = video.videoWidth; c.height = video.videoHeight
      c.getContext('2d').drawImage(video, 0, 0)

      const result = await getFaceDescriptor(c).catch(() => null)

      if (!result) {
        setCapturePhase('detecting')
        setStepMsg('Coloca tu cara dentro del óvalo')
        timerRef.current = setTimeout(detect, 300)
        return
      }

      // Cara detectada
      const step = descriptorsRef.current.length
      if (step >= STEPS.length) return // ya terminamos

      setCapturePhase('step')
      setCurrentStep(step)
      setStepMsg(STEPS[step].text)

      // Espera 1.2 s por ángulo (tiempo para que el usuario se mueva)
      timerRef.current = setTimeout(async () => {
        if (!capturingRef.current) return

        // Captura este ángulo
        c.getContext('2d').drawImage(video, 0, 0)
        const res = await getFaceDescriptor(c).catch(() => null)

        if (res) {
          descriptorsRef.current.push(res.descriptor)
          const n = descriptorsRef.current.length
          setCaptured(n)
          setFlashOk(true)
          setTimeout(() => setFlashOk(false), 300)

          if (n >= STEPS.length) {
            // ✅ Todos los ángulos capturados
            capturingRef.current = false
            // Guarda el último frame como preview
            setPreview(c.toDataURL('image/jpeg'))
            stopCam()
            setCapturePhase('complete')
            setStepMsg('✓ Escaneo completo')
          } else {
            setStepMsg(STEPS[n].text)
            timerRef.current = setTimeout(detect, 800)
          }
        } else {
          timerRef.current = setTimeout(detect, 300)
        }
      }, step === 0 ? 800 : 1400)
    }

    detect()
  }, [])

  // ── Archivo ───────────────────────────────────────────────────────────────
  function onFile(file) {
    if (!file?.type.startsWith('image/')) { setMsg('Selecciona una imagen válida.'); return }
    setMsg('')
    const r = new FileReader()
    r.onload = e => setFilePreview(e.target.result)
    r.readAsDataURL(file)
  }

  function switchTab(t) {
    stopCam(); setPreview(null); setFilePreview(null)
    setMsg(''); setSaving('idle'); setTab(t)
    setCapturePhase('idle'); setCaptured(0)
    descriptorsRef.current = []
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    const photoSrc = tab === 'camara' ? preview : filePreview
    if (!form.nombre.trim()) { setMsg('El nombre es obligatorio.'); return }
    if (!photoSrc) { setMsg('Completa el escaneo de la cara primero.'); return }

    setSaving('loading'); setMsg('Procesando descriptor facial…')

    try {
      let finalDescriptor

      if (tab === 'camara' && descriptorsRef.current.length > 0) {
        // Promedio de todos los ángulos capturados
        finalDescriptor = avgDescriptors(descriptorsRef.current)
      } else {
        // Foto única subida
        const img = new Image()
        img.src = photoSrc
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej })
        const c = canvasRef.current
        c.width = img.width; c.height = img.height
        c.getContext('2d').drawImage(img, 0, 0)
        const res = await getFaceDescriptor(c)
        if (!res) { setSaving('error'); setMsg('No se detectó rostro en la foto. Usa una imagen clara y de frente.'); return }
        finalDescriptor = res.descriptor
      }

      // Subir foto a Storage
      setMsg('Subiendo foto…')
      let foto_url = null
      try {
        const blob = await (await fetch(photoSrc)).blob()
        const path = `${Date.now()}_${form.nombre.trim().replace(/\s+/g,'_')}.jpg`
        const { data: up, error: upErr } = await supabase.storage.from('fotos-personas').upload(path, blob, { contentType: 'image/jpeg' })
        if (!upErr) foto_url = supabase.storage.from('fotos-personas').getPublicUrl(up.path).data.publicUrl
      } catch {}

      setMsg('Guardando en base de datos…')
      const { error } = await supabase.from('personas').insert({
        nombre:           form.nombre.trim(),
        edad:             form.edad ? parseInt(form.edad) : null,
        carrera:          form.carrera.trim()          || null,
        email:            form.email.trim()            || null,
        telefono:         form.telefono.trim()         || null,
        id_institucional: form.id_institucional.trim() || null,
        notas:            form.notas.trim()            || null,
        foto_url,
        face_descriptor: JSON.stringify(Array.from(finalDescriptor)),
      })
      if (error) throw error

      setSaving('success')
      setMsg(`✓ ${form.nombre} registrado con ${descriptorsRef.current.length || 1} ángulo${descriptorsRef.current.length > 1 ? 's' : ''}.`)
      setForm(EMPTY); setPreview(null); setFilePreview(null)
      setCaptured(0); setCapturePhase('idle'); descriptorsRef.current = []
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setSaving('error'); setMsg('Error al guardar: ' + err.message)
    }
  }

  const cH = f => setForm(p => ({ ...p, [f.target.name]: f.target.value }))

  const camOn      = ['detecting','step','complete'].includes(capturePhase) && streamRef.current
  const progress   = (captured / STEPS.length) * 100
  const photoSrc   = tab === 'camara' ? preview : filePreview
  const scanActive = capturePhase === 'step' || capturePhase === 'detecting'

  return (
    <div className="reg-page">
      <h1 className="reg-title">Registrar persona</h1>

      <div className="reg-layout">
        {/* ── Panel foto ── */}
        <div className="reg-photo-panel">

          <div className="reg-tabs">
            <button className={`reg-tab ${tab==='camara'  ? 'active':''}`} onClick={() => switchTab('camara')}>Escaneo</button>
            <button className={`reg-tab ${tab==='archivo' ? 'active':''}`} onClick={() => switchTab('archivo')}>Subir foto</button>
          </div>

          {/* Contenedor del óvalo con anillo de progreso */}
          <div className="oval-wrap">
            {/* Anillo de progreso SVG */}
            <svg className="progress-ring" viewBox="0 0 260 312">
              {/* Track gris */}
              <ellipse cx="130" cy="156" rx="124" ry="150"
                fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
              {/* Progreso verde */}
              <ellipse cx="130" cy="156" rx="124" ry="150"
                fill="none"
                stroke={capturePhase === 'complete' ? 'var(--green)' : capturePhase === 'detecting' ? 'rgba(255,255,255,0.2)' : 'var(--blue)'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 137 * progress / 100} ${2 * Math.PI * 137}`}
                strokeDashoffset={2 * Math.PI * 137 * 0.25}
                style={{ transition: 'stroke-dasharray .4s ease, stroke .3s' }}
              />
            </svg>

            {/* Óvalo con video/preview */}
            <div className={`reg-oval ${flashOk ? 'oval-flash' : ''} ${capturePhase === 'complete' ? 'oval-ok' : ''}`}>
              <video
                ref={videoRef} autoPlay muted playsInline className="reg-video"
                style={{ display: (camOn && capturePhase !== 'complete') ? 'block' : 'none' }}
              />
              {(capturePhase === 'complete' || (tab === 'archivo' && filePreview)) && photoSrc && (
                <img src={photoSrc} className="reg-preview" alt="preview" />
              )}
              {tab === 'archivo' && !filePreview && (
                <div className="reg-dropzone" onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}>
                  <span className="dz-icon">🖼</span>
                  <span className="dz-text">Arrastra o haz clic</span>
                </div>
              )}
              {tab === 'camara' && capturePhase === 'idle' && (
                <div className="reg-oval-hint">
                  <svg viewBox="0 0 80 100" className="face-guide-svg">
                    <ellipse cx="40" cy="50" rx="28" ry="36" fill="none"
                      stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeDasharray="5 3" />
                  </svg>
                  <span>Presiona Iniciar escaneo</span>
                </div>
              )}

              <canvas ref={canvasRef} style={{ display:'none' }} />

              {/* Badge de captura */}
              {capturePhase === 'complete' && <div className="face-badge ok">✓</div>}
            </div>

            {/* Puntos de progreso */}
            {tab === 'camara' && (
              <div className="capture-dots">
                {STEPS.map((s, i) => (
                  <div
                    key={i}
                    className={`cdot ${i < captured ? 'cdot-done' : i === currentStep && scanActive ? 'cdot-active' : ''}`}
                    title={s.text}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Instrucción del paso actual */}
          {tab === 'camara' && scanActive && (
            <div className="capture-instruction">
              <span className="ci-icon">{STEPS[currentStep]?.icon}</span>
              <span className="ci-text">{stepMsg}</span>
            </div>
          )}
          {tab === 'camara' && capturePhase === 'complete' && (
            <div className="capture-instruction done">
              <span className="ci-icon">✓</span>
              <span className="ci-text">Escaneo completo — {captured} ángulos</span>
            </div>
          )}
          {tab === 'camara' && capturePhase === 'detecting' && (
            <div className="capture-instruction detecting">
              <span className="ci-text">{stepMsg}</span>
            </div>
          )}

          {/* Botones */}
          <div className="reg-cam-controls">
            {tab === 'camara' && capturePhase === 'idle' && (
              <button className="faceid-btn" onClick={startCam} disabled={!ready}>
                {ready ? 'Iniciar escaneo' : 'Cargando IA…'}
              </button>
            )}
            {tab === 'camara' && scanActive && (
              <button className="faceid-btn-ghost" onClick={() => { stopCam(); setCapturePhase('idle'); setPreview(null); descriptorsRef.current = []; setCaptured(0) }}>
                Cancelar
              </button>
            )}
            {tab === 'camara' && capturePhase === 'complete' && (
              <button className="faceid-btn-ghost" onClick={() => { setPreview(null); setCapturePhase('idle'); setCaptured(0); descriptorsRef.current = [] }}>
                Repetir escaneo
              </button>
            )}
            {tab === 'archivo' && (
              <>
                <button className="faceid-btn" onClick={() => fileRef.current?.click()} disabled={!ready}>
                  {ready ? 'Seleccionar imagen' : 'Cargando…'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => onFile(e.target.files[0])} />
              </>
            )}
            {tab === 'archivo' && filePreview && (
              <button className="faceid-btn-ghost" onClick={() => { setFilePreview(null); if (fileRef.current) fileRef.current.value = '' }}>
                Quitar foto
              </button>
            )}
          </div>

          {msg && (
            <div className={`reg-msg ${savingState==='success' ? 'msg-ok' : savingState==='error' ? 'msg-err' : 'msg-info'}`}>
              {msg}
            </div>
          )}
        </div>

        {/* ── Formulario ── */}
        <form className="reg-form" onSubmit={handleSubmit}>
          <div className="rf-group">
            <label>Nombre completo *</label>
            <input name="nombre" value={form.nombre} onChange={cH} placeholder="Juan Pérez" required />
          </div>
          <div className="rf-row">
            <div className="rf-group">
              <label>Edad</label>
              <input name="edad" type="number" min="1" max="120" value={form.edad} onChange={cH} placeholder="23" />
            </div>
            <div className="rf-group">
              <label>ID / Cédula</label>
              <input name="id_institucional" value={form.id_institucional} onChange={cH} placeholder="001-XXXXX" />
            </div>
          </div>
          <div className="rf-group">
            <label>Carrera / Departamento</label>
            <input name="carrera" value={form.carrera} onChange={cH} placeholder="Ing. en Sistemas" />
          </div>
          <div className="rf-group">
            <label>Email</label>
            <input name="email" type="email" value={form.email} onChange={cH} placeholder="correo@ejemplo.com" />
          </div>
          <div className="rf-group">
            <label>Teléfono</label>
            <input name="telefono" value={form.telefono} onChange={cH} placeholder="+1 809-000-0000" />
          </div>
          <div className="rf-group">
            <label>Notas</label>
            <textarea name="notas" value={form.notas} onChange={cH} placeholder="Información adicional…" rows={3} />
          </div>
          <button
            className="faceid-btn btn-block"
            type="submit"
            disabled={savingState==='loading' || !photoSrc}
          >
            {savingState==='loading' ? 'Guardando…' : 'Registrar persona'}
          </button>
        </form>
      </div>
    </div>
  )
}
