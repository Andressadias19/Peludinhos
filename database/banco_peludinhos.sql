-----------------------------------------------------------
-- TABELA USUARIO
-----------------------------------------------------------

CREATE TABLE Usuario (
    id_usuario BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    foto_perfil VARCHAR(500),
    tipo_usuario VARCHAR(20) NOT NULL DEFAULT 'usuario',
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT chk_usuario_tipo_usuario
        CHECK (tipo_usuario IN ('usuario', 'administrador'))
);

-- Um e-mail por conta, sem diferença entre maiúsculas e minúsculas (a API grava em minúsculas).
CREATE UNIQUE INDEX uq_usuario_email_minusculo ON Usuario (lower(email));

-----------------------------------------------------------
-- TABELA ANIMAL
-----------------------------------------------------------

CREATE TABLE Animal (
    id_animal BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(100),
    especie VARCHAR(50) NOT NULL,
    raca VARCHAR(50),
    cor VARCHAR(50),
    genero VARCHAR(20),
    estado_saude TEXT,
    idade_aproximada VARCHAR(20) NOT NULL DEFAULT 'DESCONHECIDA'
        CHECK (idade_aproximada IN ('FILHOTE', 'ADULTO', 'IDOSO', 'DESCONHECIDA')),
    caracteristicas VARCHAR(500),
    situacao VARCHAR(30) NOT NULL DEFAULT 'NAO_INFORMADA',
    status_castracao VARCHAR(20) NOT NULL DEFAULT 'DESCONHECIDO'
        CHECK (status_castracao IN ('CASTRADO', 'NAO_CASTRADO', 'DESCONHECIDO')),
    status_vacinacao VARCHAR(20) NOT NULL DEFAULT 'DESCONHECIDA'
        CHECK (status_vacinacao IN ('ATUALIZADA', 'INCOMPLETA', 'DESCONHECIDA')),
    fonte_informacao VARCHAR(30) NOT NULL DEFAULT 'NAO_INFORMADA'
        CHECK (fonte_informacao IN ('OBSERVACAO_DIRETA', 'INFORMADO_POR_TERCEIRO', 'REGISTRO_VETERINARIO', 'NAO_INFORMADA')),
    foto VARCHAR(500),
    status_validacao VARCHAR(30) NOT NULL DEFAULT 'Pendente',
    data_validacao TIMESTAMP,
    observacao_validacao TEXT,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP,
    ref_sinpatinhas VARCHAR(100),
    id_usuario_cadastrador BIGINT NOT NULL,
    id_usuario_validador BIGINT,

    CONSTRAINT chk_animal_status_validacao
        CHECK (status_validacao IN ('Pendente', 'Validado', 'Recusado'))
);

-----------------------------------------------------------
-- TABELA PUBLICA_PERDA
-----------------------------------------------------------

CREATE TABLE Publica_Perda (
    id_perda BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Informações do animal desaparecido
    nome_animal VARCHAR(100),
    especie VARCHAR(50) NOT NULL,
    raca VARCHAR(50),
    cor VARCHAR(50),
    genero VARCHAR(20),
    foto VARCHAR(500),

    -- Informações do desaparecimento
    local_desaparecimento VARCHAR(255) NOT NULL,
    data_desaparecimento TIMESTAMP NOT NULL,
    descricao TEXT,
    status_perda VARCHAR(30) NOT NULL DEFAULT 'PERDIDO',

    -- Usuário responsável pela publicação
    id_usuario_tutor BIGINT NOT NULL,

    -- Controle da publicação
    data_publicacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-----------------------------------------------------------
-- TABELA AVISTAMENTO
-----------------------------------------------------------

CREATE TABLE Avistamento (
    id_avistamento BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    latitude NUMERIC(10,8) NOT NULL,
    longitude NUMERIC(11,8) NOT NULL,
    data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    foto VARCHAR(500),
    observacao TEXT,
    estado_saude TEXT,
    nome_observado VARCHAR(100),
    especie_observada VARCHAR(50) NOT NULL,
    raca_observada VARCHAR(50),
    cor_observada VARCHAR(50),
    genero_observado VARCHAR(20),
    id_animal BIGINT,
    id_usuario_autor BIGINT NOT NULL,

    CONSTRAINT chk_avistamento_latitude
        CHECK (latitude BETWEEN -90 AND 90),

    CONSTRAINT chk_avistamento_longitude
        CHECK (longitude BETWEEN -180 AND 180)
);

-----------------------------------------------------------
-- SOLICITACAO DE ASSOCIACAO DE AVISTAMENTO A CADASTRO
-----------------------------------------------------------

CREATE TABLE Solicitacao_Associacao_Avistamento (
    id_solicitacao BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_avistamento BIGINT NOT NULL REFERENCES Avistamento (id_avistamento),
    id_animal_proposto BIGINT NOT NULL REFERENCES Animal (id_animal),
    id_usuario_solicitante BIGINT NOT NULL REFERENCES Usuario (id_usuario),
    justificativa TEXT NOT NULL CHECK (char_length(btrim(justificativa)) BETWEEN 20 AND 1000),
    status_solicitacao VARCHAR(30) NOT NULL DEFAULT 'PENDENTE'
        CHECK (status_solicitacao IN ('PENDENTE', 'APROVADA', 'RECUSADA', 'CORRECAO_SOLICITADA')),
    data_solicitacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_usuario_validador BIGINT REFERENCES Usuario (id_usuario),
    data_decisao TIMESTAMP,
    observacao_decisao TEXT
);

CREATE UNIQUE INDEX uq_solicitacao_associacao_pendente_avistamento
    ON Solicitacao_Associacao_Avistamento (id_avistamento)
    WHERE status_solicitacao = 'PENDENTE';

CREATE INDEX idx_solicitacao_associacao_status_data
    ON Solicitacao_Associacao_Avistamento (status_solicitacao, data_solicitacao DESC);

-----------------------------------------------------------
-- TABELA SOLICITACAO_ADOCAO
-----------------------------------------------------------

CREATE TABLE Solicitacao_adocao (
    id_solicitacao BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    data_solicitacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    mensagem TEXT,
    status_solicitacao VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    id_usuario_solicitante BIGINT NOT NULL,
    id_usuario_validador BIGINT,
    id_animal BIGINT NOT NULL,

    CONSTRAINT chk_status_solicitacao
        CHECK (status_solicitacao IN ('PENDENTE', 'RECUSADA', 'APROVADA'))
);

-----------------------------------------------------------
-- TABELA NOTICIA
-----------------------------------------------------------

CREATE TABLE Noticia (
    id_noticia BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    conteudo TEXT NOT NULL,
    imagem VARCHAR(500),
    categoria TEXT,
    data_publicacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id_usuario_autor BIGINT NOT NULL
);

-----------------------------------------------------------
-- CHAVES ESTRANGEIRAS - ANIMAL
-----------------------------------------------------------

ALTER TABLE Animal
    ADD CONSTRAINT fk_animal_usuario_cadastrador
    FOREIGN KEY (id_usuario_cadastrador)
    REFERENCES Usuario (id_usuario)
    ON DELETE RESTRICT,

    ADD CONSTRAINT fk_animal_usuario_validador
    FOREIGN KEY (id_usuario_validador)
    REFERENCES Usuario (id_usuario)
    ON DELETE SET NULL;

-----------------------------------------------------------
-- CHAVE ESTRANGEIRA - PUBLICA_PERDA
-----------------------------------------------------------

ALTER TABLE Publica_Perda
    ADD CONSTRAINT fk_publica_perda_tutor
    FOREIGN KEY (id_usuario_tutor)
    REFERENCES Usuario (id_usuario)
    ON DELETE RESTRICT;

-----------------------------------------------------------
-- CHAVES ESTRANGEIRAS - AVISTAMENTO
-----------------------------------------------------------

ALTER TABLE Avistamento
    ADD CONSTRAINT fk_avistamento_animal
    FOREIGN KEY (id_animal)
    REFERENCES Animal (id_animal)
    ON DELETE RESTRICT,

    ADD CONSTRAINT fk_avistamento_usuario
    FOREIGN KEY (id_usuario_autor)
    REFERENCES Usuario (id_usuario)
    ON DELETE RESTRICT;

-----------------------------------------------------------
-- CHAVES ESTRANGEIRAS - SOLICITACAO_ADOCAO
-----------------------------------------------------------

ALTER TABLE Solicitacao_adocao
    ADD CONSTRAINT fk_solicitacao_usuario_solicitante
    FOREIGN KEY (id_usuario_solicitante)
    REFERENCES Usuario (id_usuario)
    ON DELETE RESTRICT,

    ADD CONSTRAINT fk_solicitacao_usuario_validador
    FOREIGN KEY (id_usuario_validador)
    REFERENCES Usuario (id_usuario)
    ON DELETE SET NULL,

    ADD CONSTRAINT fk_solicitacao_animal
    FOREIGN KEY (id_animal)
    REFERENCES Animal (id_animal)
    ON DELETE RESTRICT;

-----------------------------------------------------------
-- CHAVE ESTRANGEIRA - NOTICIA
-----------------------------------------------------------

ALTER TABLE Noticia
    ADD CONSTRAINT fk_noticia_usuario_autor
    FOREIGN KEY (id_usuario_autor)
    REFERENCES Usuario (id_usuario)
    ON DELETE RESTRICT;

CREATE INDEX idx_avistamento_animal_data
    ON Avistamento (id_animal, data_hora DESC, id_avistamento DESC);
