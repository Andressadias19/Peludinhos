-- Bancos existentes: executar uma vez antes de iniciar a nova API.
-- Conserva Animal.estado_saude para compatibilidade com outros módulos.
BEGIN;
LOCK TABLE Avistamento IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'avistamento' AND column_name = 'estado_saude'
    ) THEN
        ALTER TABLE Avistamento ADD COLUMN estado_saude TEXT;
        -- O fluxo antigo criava exatamente um animal por avistamento.
        -- Só recupera a saúde quando existe um único avistamento, sem inventar histórico.
        UPDATE Avistamento v SET estado_saude = a.estado_saude
        FROM Animal a
        WHERE a.id_animal = v.id_animal
          AND (SELECT count(*) FROM Avistamento other WHERE other.id_animal = a.id_animal) = 1;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_avistamento_animal_data
    ON Avistamento (id_animal, data_hora DESC, id_avistamento DESC);
COMMIT;
