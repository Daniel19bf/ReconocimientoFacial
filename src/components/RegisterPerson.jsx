import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { loadModels, getFaceDescriptor } from '../lib/faceApi'

const EMPTY = { nombre:'', edad:'', carrera:'', email:'', telefono:'', id_institucional:'', notas:'' }

export default function RegisterPerson() {
  const [form,        setForm]        = useState(EMPTY)
  const [savingState, setSaving]      = useState('idle')   // idle|loading|success|error
  const [msg,         setMsg]         = useState('')
  const [ready,       setReady]       = useState(false)
  const [tab,         setTab]         = useState('camara') // camara|archivo
  const [camOn,       setCamOn]       = useState(false)
  const [preview,     setPreview]     = useState(null)
  const [faceOk,      setFaceOk]      = useState(null)    // null|true|false

  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const fileRef   = useRef(null)

  useEffect(() => {
    loadModels().then(() => setReady(true))
      .catch(() => setMsg('Error al cargar modelos de IA.'))
    return () => stopCam()
  }, [])

  // ── Cámara ────────────────────────────────────────────────────────────────
  async function startCam() {
    setPreview(null); setFaceOk(null); setMsg('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = s
      videoRef.current.srcObject = s
      await videoRef.current.play()
      setCamOn(true)
    } catch { setMsg('Sin acceso a la cámara.') }
  }

  function stopCam() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCamOn(false)
  }

  function capturar() {
    const v = videoRef.current, c = canvasRef.current
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    setPreview(c.toDataURL('image/jpeg'))
    stopCam()
  }

  // ── Archivo ───────────────────────────────────────────────────────────────
  function onFile(file) {
    if (!file?.type.startsWith('image/')) { setMsg('Selecciona una imagen válida.'); return }
    setMsg(''); setFaceOk(null)
    const r = new FileReader()
    r.onload = e => setPreview(e.target.result)
    r.readAsDataURL(file)
  }

  // ── Cambio de pestaña ─────────────────────────────────────────────────────
  function switchTab(t) { stopCam(); setPreview(null); setFaceOk(null); setMsg(''); setTab(t) }

  // ── Guardar ───────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre.trim()) { setMsg('El nombre es obligatorio.'); return }
    if (!preview)             { setMsg('Agrega una foto primero.');  return }

    setSaving('loading'); setMsg('Analizando rostro…')

    const img = new Image()
    img.src = preview
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej })
    const c = canvasRef.current
    c.width = img.width; c.height = img.height
    c.getContext('2d').drawImage(img, 0, 0)

    const result = await getFaceDescriptor(c)
    if (!result) {
      setSaving('error'); setFaceOk(false)
      setMsg('No se detectó ningún rostro. Usa una foto clara, de frente.')
      return
    }

    setFaceOk(true); setMsg('Subiendo foto…')
    try {
      // ── Subir foto a Supabase Storage ──────────────────────────────────
      let foto_url = null
      try {
        // Convertir dataURL → Blob
        const res  = await fetch(preview)
        const blob = await res.blob()
        const ext  = blob.type === 'image/png' ? 'png' : 'jpg'
        const path = `${Date.now()}_${form.nombre.trim().replace(/\s+/g, '_')}.${ext}`

        const { data: uploadData, error: upErr } = await supabase.storage
          .from('fotos-personas')
          .upload(path, blob, { contentType: blob.type, upsert: false })

        if (upErr) {
          console.warn('No se pudo subir la foto:', upErr.message)
        } else {
          const { data: urlData } = supabase.storage
            .from('fotos-personas')
            .getPublicUrl(uploadData.path)
          foto_url = urlData.publicUrl
        }
      } catch (uploadErr) {
        console.warn('Error al subir foto:', uploadErr)
        // Continuar aunque falle el upload — el reconocimiento funciona igual
      }

      setMsg('Guardando en base de datos…')
      const { error } = await supabase.from('personas').insert({
        nombre:           form.nombre.trim(),
        edad:             form.edad ? parseInt(form.edad) : null,
        carrera:          form.carrera.trim()           || null,
        email:            form.email.trim()             || null,
        telefono:         form.telefono.trim()          || null,
        id_institucional: form.id_institucional.trim()  || null,
        notas:            form.notas.trim()             || null,
        foto_url,
        face_descriptor:  JSON.stringify(Array.from(result.descriptor)),
      })
      if (error) throw error
      setSaving('success')
      setMsg(`${form.nombre} registrado correctamente.`)
      setForm(EMPTY); setPreview(null); setFaceOk(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setSaving('error'); setMsg('Error al guardar: ' + err.message)
    }
  }

  const cH = f => setForm(p => ({ ...p, [f.target.name]: f.target.value }))

  return (
    <div className="reg-page">
      <h1 className="reg-title">Registrar persona</h1>

      <div className="reg-layout">
        {/* ── Panel foto ── */}
        <div className="reg-photo-panel">

          {/* Tabs */}
          <div className="reg-tabs">
            <button className={`reg-tab ${tab==='camara'  ? 'active':''}`} onClick={() => switchTab('camara')}>
              Cámara
            </button>
            <button className={`reg-tab ${tab==='archivo' ? 'active':''}`} onClick={() => switchTab('archivo')}>
              Subir foto
            </button>
          </div>

          {/* Ventana oval */}
          <div className={`reg-oval ${faceOk===true ? 'oval-ok' : faceOk===false ? 'oval-err' : ''}`}>
            {camOn && (
              <video ref={videoRef} autoPlay muted playsInline className="reg-video" />
            )}
            {preview && !camOn && (
              <img src={preview} className="reg-preview" alt="preview" />
            )}
            {!camOn && !preview && tab === 'camara' && (
              <div className="reg-oval-hint">
                <svg viewBox="0 0 80 100" className="face-guide-svg">
                  <ellipse cx="40" cy="50" rx="28" ry="36"
                    fill="none" stroke="rgba(255,255,255,0.2)"
                    strokeWidth="1.5" strokeDasharray="5 3" />
                </svg>
                <span>Coloca tu cara aquí</span>
              </div>
            )}
            {!camOn && !preview && tab === 'archivo' && (
              <div
                className="reg-dropzone"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}
              >
                <span className="dz-icon">🖼</span>
                <span className="dz-text">Arrastra o haz clic</span>
              </div>
            )}
            <canvas ref={canvasRef} style={{ display:'none' }} />

            {/* Badge de detección */}
            {faceOk === true  && <div className="face-badge ok">✓</div>}
            {faceOk === false && <div className="face-badge err">✕</div>}
          </div>

          {/* Controles */}
          <div className="reg-cam-controls">
            {tab === 'camara' && !camOn && (
              <button className="faceid-btn" onClick={startCam} disabled={!ready}>
                {ready ? 'Abrir cámara' : 'Cargando…'}
              </button>
            )}
            {tab === 'camara' && camOn && (
              <>
                <button className="faceid-btn"            onClick={capturar}>Capturar</button>
                <button className="faceid-btn-ghost"      onClick={stopCam}>Cancelar</button>
              </>
            )}
            {tab === 'archivo' && (
              <>
                <button className="faceid-btn" onClick={() => fileRef.current?.click()} disabled={!ready}>
                  {ready ? 'Seleccionar imagen' : 'Cargando…'}
                </button>
                <input ref={fileRef} type="file" accept="image/*"
                  style={{ display:'none' }} onChange={e => onFile(e.target.files[0])} />
              </>
            )}
            {preview && !camOn && (
              <button className="faceid-btn-ghost" onClick={() => {
                setPreview(null); setFaceOk(null); setMsg(''); setSaving('idle')
                if (fileRef.current) fileRef.current.value = ''
              }}>
                Quitar foto
              </button>
            )}
          </div>

          {/* Mensaje */}
          {msg && (
            <div className={`reg-msg ${
              savingState==='success' ? 'msg-ok'
              : savingState==='error' ? 'msg-err'
              : 'msg-info'
            }`}>{msg}</div>
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
            disabled={savingState==='loading' || !preview}
          >
            {savingState==='loading' ? 'Guardando…' : 'Registrar persona'}
          </button>
        </form>
      </div>
    </div>
  )
}
