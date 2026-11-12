const pool = require("../config/database");


// DADOS DO ADMINISTRADOR AUTENTICADO
// req.administrador vem do exigirAdministrador, já conferido no banco
function buscarAdministradorAtual(req, res) {
    return res.status(200).json({
        administrador: req.administrador
    });
}


// RESUMO DO PAINEL: contagens lidas do banco no momento da requisição
async function buscarResumo(req, res) {
    try {
        const resultado = await pool.query(
            `SELECT
                u.total AS usuarios_total, u.ativos AS usuarios_ativos, u.administradores,
                a.total AS animais_total, a.pendentes AS animais_pendentes,
                a.validados AS animais_validados, a.recusados AS animais_recusados,
                v.total AS avistamentos_total, v.sem_cadastro AS avistamentos_sem_cadastro,
                v.ultimos_30_dias AS avistamentos_ultimos_30_dias,
                p.total AS desaparecimentos_total, p.perdidos AS desaparecimentos_perdidos,
                p.encontrados AS desaparecimentos_encontrados,
                s.pendentes AS associacoes_pendentes,
                CURRENT_TIMESTAMP AS gerado_em
            FROM
                (SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE ativo)::int AS ativos,
                    count(*) FILTER (WHERE ativo AND tipo_usuario = 'administrador')::int AS administradores
                 FROM Usuario) u,
                (SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE status_validacao = 'Pendente')::int AS pendentes,
                    count(*) FILTER (WHERE status_validacao = 'Validado')::int AS validados,
                    count(*) FILTER (WHERE status_validacao = 'Recusado')::int AS recusados
                 FROM Animal) a,
                (SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE id_animal IS NULL)::int AS sem_cadastro,
                    count(*) FILTER (WHERE data_hora >= CURRENT_TIMESTAMP - interval '30 days')::int AS ultimos_30_dias
                 FROM Avistamento) v,
                (SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE status_perda = 'PERDIDO')::int AS perdidos,
                    count(*) FILTER (WHERE status_perda = 'ENCONTRADO')::int AS encontrados
                 FROM Publica_Perda) p,
                (SELECT count(*) FILTER (WHERE status_solicitacao = 'PENDENTE')::int AS pendentes
                 FROM Solicitacao_Associacao_Avistamento) s`
        );

        const linha = resultado.rows[0];

        return res.status(200).json({
            resumo: {
                usuarios: {
                    total: linha.usuarios_total,
                    ativos: linha.usuarios_ativos,
                    administradores: linha.administradores
                },
                animais: {
                    total: linha.animais_total,
                    pendentes: linha.animais_pendentes,
                    validados: linha.animais_validados,
                    recusados: linha.animais_recusados
                },
                avistamentos: {
                    total: linha.avistamentos_total,
                    sem_cadastro: linha.avistamentos_sem_cadastro,
                    ultimos_30_dias: linha.avistamentos_ultimos_30_dias
                },
                desaparecimentos: {
                    total: linha.desaparecimentos_total,
                    perdidos: linha.desaparecimentos_perdidos,
                    encontrados: linha.desaparecimentos_encontrados
                },
                associacoes: {
                    pendentes: linha.associacoes_pendentes
                }
            },
            gerado_em: linha.gerado_em
        });

    } catch (erro) {
        console.error("Erro ao montar resumo administrativo:", erro);

        return res.status(500).json({
            erro: "Não foi possível carregar o resumo do painel."
        });
    }
}


module.exports = {
    buscarAdministradorAtual,
    buscarResumo
};
