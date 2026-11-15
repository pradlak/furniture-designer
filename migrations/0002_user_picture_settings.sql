-- Zdjęcie profilowe z Google (adres obrazka, do awatara w rogu strony) i ustawienia programu
-- (kolor zaznaczenia, jednostki) — zapamiętane dla użytkownika, żeby działały na każdym urządzeniu.
ALTER TABLE users ADD COLUMN picture TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN settings TEXT NOT NULL DEFAULT '';
