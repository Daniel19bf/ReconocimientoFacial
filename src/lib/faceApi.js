import * as faceapi from '@vladmandic/face-api'

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model'

let modelsLoaded = false

export async function loadModels() {
  if (modelsLoaded) return
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ])
  modelsLoaded = true
}

/** Devuelve { descriptor, landmarks: [{x,y}×68], box } o null */
export async function getFaceDescriptor(source) {
  const det = await faceapi
    .detectSingleFace(source, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor()
  if (!det) return null
  return {
    descriptor: det.descriptor,
    landmarks:  det.landmarks.positions,
    box:        det.detection.box,
  }
}

/**
 * Detecta todas las caras en el video y hace matching.
 * Devuelve [{ box, landmarks, nombre, distancia, persona }]
 */
export async function matchFaces(videoEl, personas) {
  const detections = await faceapi
    .detectAllFaces(videoEl, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptors()

  const results = []

  for (const det of detections) {
    const box        = det.detection.box
    const descriptor = det.descriptor
    const landmarks  = det.landmarks.positions   // 68 puntos {x, y}

    let best = { nombre: 'Desconocido', distancia: 1, persona: null }

    for (const p of personas) {
      const dist = faceapi.euclideanDistance(descriptor, p.descriptor)
      if (dist < best.distancia) best = { nombre: p.nombre, distancia: dist, persona: p }
    }

    if (best.distancia > 0.50) best = { nombre: 'Desconocido', distancia: best.distancia, persona: null }

    results.push({ box, landmarks, ...best })
  }

  return results
}

export { faceapi }
