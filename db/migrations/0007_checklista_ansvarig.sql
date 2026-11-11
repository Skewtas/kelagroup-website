-- Checklistor: vem hos kunden som ansvarar för varje fråga (fritext, t.ex. "Malin"),
-- och punktens plats på sidan så att KELA OS visar frågorna i samma ordning som checklistan.
ALTER TABLE checklist_answers ADD COLUMN owner TEXT NOT NULL DEFAULT '';
ALTER TABLE checklist_history ADD COLUMN owner TEXT NOT NULL DEFAULT '';
ALTER TABLE checklist_answers ADD COLUMN pos INTEGER NOT NULL DEFAULT 0;
