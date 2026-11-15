-- Materiały zapisane na koncie (biblioteka użytkownika): płyty z kolorem, grubością, obrzeżem i wzorem —
-- do wstawiania w kolejnych projektach. data — materiał jako JSON (jak w pliku projektu).
CREATE TABLE user_materials (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  data        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX user_materials_user ON user_materials(user_id, name);
