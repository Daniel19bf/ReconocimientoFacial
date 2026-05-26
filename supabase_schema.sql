-- =====================================================================
-- Esquema para el sistema de reconocimiento facial (React + Supabase)
-- Ejecuta este SQL en: Supabase → SQL Editor → New query
-- =====================================================================

-- 1. Tabla principal
CREATE TABLE IF NOT EXISTS personas (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre            TEXT        NOT NULL,
    edad              INTEGER,
    carrera           TEXT,
    email             TEXT,
    telefono          TEXT,
    id_institucional  TEXT,
    notas             TEXT,
    foto_url          TEXT,          -- URL pública de la foto en Supabase Storage
    face_descriptor   TEXT,          -- JSON array de 128 floats (Float32Array)
    creado_en         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personas_nombre ON personas(nombre);

-- 2. Storage bucket para las fotos
-- (Crea el bucket manualmente en Supabase → Storage → New bucket)
-- Nombre del bucket: fotos-personas
-- Marcar como "Public bucket" para poder acceder a las URLs directamente

-- 3. Row Level Security (descomenta si lo necesitas)
-- ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "lectura_publica"   ON personas FOR SELECT USING (true);
-- CREATE POLICY "insercion_publica" ON personas FOR INSERT WITH CHECK (true);
-- CREATE POLICY "borrado_publica"   ON personas FOR DELETE USING (true);

-- 4. Si ya tienes la tabla creada, agrega la columna foto_url con esto:
-- ALTER TABLE personas ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- Verificar estructura
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'personas'
ORDER BY ordinal_position;
