-- Konta i projekty w chmurze (Cloudflare D1, SQLite).
-- Użytkownik loguje się przez Google: zapisujemy tylko identyfikator Google (sub), e-mail i imię.

CREATE TABLE users (
  id          TEXT PRIMARY KEY,           -- nasz identyfikator (losowy)
  google_sub  TEXT NOT NULL UNIQUE,       -- identyfikator konta Google
  email       TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,           -- ms od 1970
  last_login  INTEGER NOT NULL
);

-- Sesje logowania: w ciasteczku jest losowy token, w bazie tylko jego skrót (SHA-256).
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Projekty: cały projekt jako JSON (taki jak plik z „Eksportuj”).
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  data        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL            -- do wykrywania zmian z innego urządzenia
);
CREATE INDEX projects_user ON projects(user_id, updated_at DESC);
