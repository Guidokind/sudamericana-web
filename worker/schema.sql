-- Sudamericana Lluvias V1
-- Ejecutar una vez sobre la base D1.

CREATE TABLE IF NOT EXISTS rain_reports (
  id TEXT PRIMARY KEY,
  reporter_hash TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  millimeters REAL NOT NULL,
  intensity TEXT NOT NULL CHECK (intensity IN ('weak', 'moderate', 'strong')),
  ongoing INTEGER NOT NULL DEFAULT 0 CHECK (ongoing IN (0, 1)),
  measured INTEGER NOT NULL DEFAULT 1 CHECK (measured IN (0, 1)),
  comment TEXT,
  place_label TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  flags INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pending_rain_reports (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  reporter_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  millimeters REAL NOT NULL,
  intensity TEXT NOT NULL,
  ongoing INTEGER NOT NULL DEFAULT 0,
  measured INTEGER NOT NULL DEFAULT 1,
  comment TEXT,
  place_label TEXT,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rain_reports_created
  ON rain_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rain_reports_geo
  ON rain_reports(lat, lng);

CREATE INDEX IF NOT EXISTS idx_rain_reports_reporter
  ON rain_reports(reporter_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pending_ip
  ON pending_rain_reports(ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pending_expiry
  ON pending_rain_reports(expires_at);
