# 🧠 FaceID — Reconocimiento Facial con React + Supabase

Aplicación web que reconoce personas en tiempo real usando la cámara del navegador y muestra sus datos desde una base de datos en Supabase.

---

## Tecnologías

- **React 19 + Vite** — frontend
- **face-api.js** (`@vladmandic/face-api`) — detección y reconocimiento facial en el navegador
- **Supabase** — base de datos (PostgreSQL)
- **React Router** — navegación entre páginas

---

## Estructura del proyecto

```
src/
├── lib/
│   ├── supabase.js          # Cliente de Supabase
│   └── faceApi.js           # Carga de modelos y funciones de reconocimiento
├── components/
│   ├── RegisterPerson.jsx   # Página: registrar persona
│   ├── RecognizeLive.jsx    # Página: reconocimiento en vivo
│   └── PersonCard.jsx       # Panel de información de persona
├── App.jsx                  # Rutas y navbar
├── App.css                  # Estilos
└── main.jsx
```

---

## Instalación paso a paso

### 1. Configurar Supabase

1. Crea un proyecto en https://supabase.com
2. Ve a **SQL Editor** y ejecuta el contenido de `supabase_schema.sql`
3. Ve a **Project Settings → API** y copia:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

### 2. Crear el archivo `.env`

Copia `.env.example` como `.env` y rellena tus credenciales:

```
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key_aqui
```

### 3. Instalar dependencias y arrancar

```bash
npm install
npm run dev
```

Abre http://localhost:5173 en tu navegador.

---

## Uso

### Registrar una persona

1. Ve a la pestaña **Registrar**
2. Llena los datos (nombre obligatorio, el resto opcional)
3. Haz clic en **Abrir cámara**, colócate frente a ella y presiona **Capturar foto**
4. Haz clic en **Registrar persona** — se guarda en Supabase

### Reconocer en vivo

1. Ve a la pestaña **Reconocer**
2. Haz clic en **Iniciar reconocimiento**
3. Si reconoce a alguien: cuadro **verde** + datos en el panel lateral
4. Si no la reconoce: cuadro **azul** con "Desconocido"
5. Presiona **Recargar personas** para sincronizar nuevos registros sin reiniciar

---

## Solución de problemas

**Los modelos tardan en cargar la primera vez**
Se descargan desde jsDelivr CDN (~6 MB). Necesitas internet; el navegador los cachea después.

**"No se detectó ningún rostro"**
Asegúrate de tener buena iluminación y cara visible de frente.

**Reconoce mal a alguien**
En `src/lib/faceApi.js` ajusta el umbral en `matchFaces`:
```js
if (bestMatch.distancia > 0.50) {  // Baja a 0.45 para más estrictez
```

**Error de permisos de cámara**
El navegador requiere que el sitio esté en `localhost` o HTTPS para acceder a la cámara.
