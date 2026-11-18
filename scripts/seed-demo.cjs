// Dados fictícios e idempotentes para a demonstração Docker local.
// Nunca lê ou copia registros do Supabase.
const bcrypt = require("bcrypt");
const pool = require("../server/config/database");

const email = String(process.env.DEMO_ADMIN_EMAIL || "").trim().toLowerCase();
const senha = String(process.env.DEMO_ADMIN_PASSWORD || "");

if (!email || !senha || senha.length < 12) {
    console.error("Defina DEMO_ADMIN_EMAIL e uma DEMO_ADMIN_PASSWORD com pelo menos 12 caracteres em .env.docker.");
    process.exit(1);
}

const animaisDemo = [
    {
        chave: "caramelo",
        nome: "Caramelo (demonstração)",
        especie: "Cachorro",
        raca: "Sem raça definida",
        cor: "Caramelo",
        genero: "Macho",
        idade: "ADULTO",
        castracao: "NAO_CASTRADO",
        vacinacao: "DESCONHECIDA",
        latitude: -2.44306,
        longitude: -54.70833,
        observacao: "Demonstração Docker: cachorro caramelo observado próximo à praça.",
        diasAtras: 2
    },
    {
        chave: "luna",
        nome: "Luna (demonstração)",
        especie: "Gato",
        raca: "Sem raça definida",
        cor: "Cinza e branco",
        genero: "Fêmea",
        idade: "ADULTO",
        castracao: "CASTRADO",
        vacinacao: "ATUALIZADA",
        latitude: -2.4371,
        longitude: -54.7118,
        observacao: "Demonstração Docker: gata cinza e branca observada em uma rua residencial.",
        diasAtras: 5
    },
    {
        chave: "pretinho",
        nome: "Pretinho (demonstração)",
        especie: "Cachorro",
        raca: "Sem raça definida",
        cor: "Preto",
        genero: "Macho",
        idade: "FILHOTE",
        castracao: "DESCONHECIDO",
        vacinacao: "DESCONHECIDA",
        latitude: -2.4504,
        longitude: -54.7002,
        observacao: "Demonstração Docker: cão preto observado perto de um ponto de ônibus.",
        diasAtras: 12
    }
];

async function executar() {
    const hashSenha = await bcrypt.hash(senha, 12);
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        const usuario = await cliente.query(
            `INSERT INTO Usuario (nome, email, senha_hash, tipo_usuario, ativo)
             VALUES ('Administrador de demonstração', $1, $2, 'administrador', TRUE)
             ON CONFLICT (email) DO UPDATE SET
               nome = EXCLUDED.nome,
               senha_hash = EXCLUDED.senha_hash,
               tipo_usuario = 'administrador',
               ativo = TRUE
             RETURNING id_usuario`,
            [email, hashSenha]
        );
        const idUsuario = usuario.rows[0].id_usuario;
        const idsAnimais = new Map();

        for (const animal of animaisDemo) {
            const existente = await cliente.query(
                `SELECT id_animal FROM Animal
                 WHERE id_usuario_cadastrador = $1 AND nome = $2`,
                [idUsuario, animal.nome]
            );
            let idAnimal = existente.rows[0]?.id_animal;
            if (!idAnimal) {
                const inserido = await cliente.query(
                    `INSERT INTO Animal (
                       nome, especie, raca, cor, genero, idade_aproximada, situacao,
                       status_castracao, status_vacinacao, fonte_informacao,
                       status_validacao, caracteristicas, id_usuario_cadastrador
                     ) VALUES ($1, $2, $3, $4, $5, $6, 'EM_SITUACAO_DE_RUA', $7, $8,
                               'OBSERVACAO_DIRETA', 'Pendente', $9, $10)
                     RETURNING id_animal`,
                    [animal.nome, animal.especie, animal.raca, animal.cor, animal.genero,
                        animal.idade, animal.castracao, animal.vacinacao,
                        `Registro fictício para demonstração Docker (${animal.chave}).`, idUsuario]
                );
                idAnimal = inserido.rows[0].id_animal;
            }
            idsAnimais.set(animal.chave, idAnimal);

            const tag = `Demonstração Docker: avistamento ${animal.chave}.`;
            const avistamentoExiste = await cliente.query(
                `SELECT 1 FROM Avistamento WHERE id_usuario_autor = $1 AND observacao = $2 LIMIT 1`,
                [idUsuario, tag]
            );
            if (!avistamentoExiste.rowCount) {
                const dataHora = new Date(Date.now() - animal.diasAtras * 24 * 60 * 60 * 1000);
                await cliente.query(
                    `INSERT INTO Avistamento (
                       latitude, longitude, data_hora, observacao, estado_saude,
                       nome_observado, especie_observada, raca_observada, cor_observada,
                       genero_observado, id_animal, id_usuario_autor
                     ) VALUES ($1, $2, $3, $4, 'Sem alteração observada', $5, $6, $7, $8, $9, $10, $11)`,
                    [animal.latitude, animal.longitude, dataHora, tag, animal.nome,
                        animal.especie, animal.raca, animal.cor, animal.genero, idAnimal, idUsuario]
                );
            }
        }

        const tagSemVinculo = "Demonstração Docker: avistamento sem animal identificado.";
        const semVinculoExiste = await cliente.query(
            `SELECT 1 FROM Avistamento WHERE id_usuario_autor = $1 AND observacao = $2 LIMIT 1`,
            [idUsuario, tagSemVinculo]
        );
        if (!semVinculoExiste.rowCount) {
            await cliente.query(
                `INSERT INTO Avistamento (
                   latitude, longitude, data_hora, observacao, estado_saude,
                   especie_observada, cor_observada, id_animal, id_usuario_autor
                 ) VALUES (-2.4462, -54.7151, NOW() - INTERVAL '1 day', $1,
                           'Não foi possível avaliar', 'Cachorro', 'Branco e marrom', NULL, $2)`,
                [tagSemVinculo, idUsuario]
            );
        }

        await cliente.query("COMMIT");
        console.log(`Demonstração pronta: ${animaisDemo.length} animais, avistamentos e conta administrativa ${email}.`);
    } catch (erro) {
        await cliente.query("ROLLBACK").catch(() => {});
        throw erro;
    } finally {
        cliente.release();
        await pool.end();
    }
}

executar().catch(erro => {
    console.error(`Não foi possível preparar os dados de demonstração: ${erro.message}`);
    process.exitCode = 1;
});
