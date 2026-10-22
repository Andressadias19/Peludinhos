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
    tipo_usuario VARCHAR(20) NOT NULL,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ativo BOOLEAN NOT NULL DEFAULT TRUE
);

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
    situacao VARCHAR(30) NOT NULL,
    foto VARCHAR(500),
    status_validacao VARCHAR(30) DEFAULT 'Pendente',
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ref_sinpatinhas VARCHAR(100),
    id_usuario_cadastrador BIGINT NOT NULL,
    id_usuario_validador BIGINT
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
    id_animal BIGINT NOT NULL,
    id_usuario_autor BIGINT NOT NULL,

    CONSTRAINT chk_avistamento_latitude
        CHECK (latitude BETWEEN -90 AND 90),

    CONSTRAINT chk_avistamento_longitude
        CHECK (longitude BETWEEN -180 AND 180)
);

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
    ON DELETE CASCADE,

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
    ON DELETE CASCADE;

-----------------------------------------------------------
-- CHAVE ESTRANGEIRA - NOTICIA
-----------------------------------------------------------

ALTER TABLE Noticia
    ADD CONSTRAINT fk_noticia_usuario_autor
    FOREIGN KEY (id_usuario_autor)
    REFERENCES Usuario (id_usuario)
    ON DELETE RESTRICT;