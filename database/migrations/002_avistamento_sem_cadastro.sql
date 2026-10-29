-- Executar após 001_saude_avistamento.sql. Não remove nem une cadastros antigos.
BEGIN;
LOCK TABLE Avistamento IN ACCESS EXCLUSIVE MODE;
ALTER TABLE Avistamento ALTER COLUMN id_animal DROP NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'avistamento' AND column_name = 'especie_observada') THEN
        ALTER TABLE Avistamento
            ADD COLUMN nome_observado VARCHAR(100),
            ADD COLUMN especie_observada VARCHAR(50),
            ADD COLUMN raca_observada VARCHAR(50),
            ADD COLUMN cor_observada VARCHAR(50),
            ADD COLUMN genero_observado VARCHAR(20);
        UPDATE Avistamento v SET nome_observado = a.nome, especie_observada = a.especie,
            raca_observada = a.raca, cor_observada = a.cor, genero_observado = a.genero
            FROM Animal a WHERE a.id_animal = v.id_animal;
        ALTER TABLE Avistamento ALTER COLUMN especie_observada SET NOT NULL;
    END IF;
END $$;
COMMIT;
