// npm run supabase:limpar-validacao [-- --confirmar]
// Remove do Supabase REAL só os registros e fotos das contas de validação (e-mails @validacao-supabase.invalid).
// Sem --confirmar: apenas mostra o que seria removido (nada é gravado nem apagado).
// Lê SOMENTE o arquivo de ambiente da validação (padrão .env.supabase.local); recusa bancos locais e o driver local,
// para nunca tocar no banco de desenvolvimento, no banco de testes ou nas pastas de fotos locais.
// Não exclui buckets, tabelas, políticas nem qualquer recurso do projeto.
// Uso: node scripts/limpar-validacao-supabase.cjs [--arquivo-env=<arquivo>] [--marcador=@x.invalid] [--confirmar]
const OPCAO = '--arquivo-env=';
if (!process.argv.some(item => item.startsWith(OPCAO))) process.argv.push(`${OPCAO}.env.supabase.local`);

(async () => {
    const { carregarAmbiente } = require('../server/config/carregarAmbiente');
    carregarAmbiente();
    const { montarConfiguracao, ehBancoLocal } = require('../server/config/databaseConfig');
    if (ehBancoLocal(montarConfiguracao(process.env))) {
        throw new Error('A configuração aponta para um PostgreSQL local. Este comando é só para o Supabase real.');
    }
    const { lerDriver } = require('../server/storage');
    if (lerDriver(process.env) !== 'supabase') throw new Error('Defina STORAGE_DRIVER=supabase: este comando é só para o Supabase real.');

    const { limparValidacao, MARCADOR_PADRAO } = require('./limpezaValidacao.cjs');
    const marcadorOpcao = process.argv.find(item => item.startsWith('--marcador='));
    const marcador = marcadorOpcao ? marcadorOpcao.slice('--marcador='.length) : MARCADOR_PADRAO;
    const confirmar = process.argv.includes('--confirmar');
    const pool = require('../server/config/database');
    const { armazenamento } = require('../server/storage');
    try {
        const r = await limparValidacao({ pool, armazenamento, marcador, confirmar });
        const contagem = chave => `${r[chave].length}`;
        console.log(`Contas de validação (${marcador}): ${contagem('usuarios')}`);
        console.log(`Animais ${contagem('animais')} | avistamentos ${contagem('avistamentos')} | desaparecimentos ${contagem('perdidos')} | `
            + `solicitações de associação ${contagem('associacoes')} | de adoção ${contagem('adocoes')} | notícias ${contagem('noticias')}`);
        console.log(`Fotos ligadas: ${r.fotos.publica.length} pública(s), ${r.fotos.privada.length} privada(s)`);
        if (r.bloqueado) {
            console.log(`\nNADA FOI REMOVIDO: ${r.bloqueios.join('; ')}. Resolva esses registros antes (pelo painel) e rode de novo.`);
            process.exitCode = 1;
        } else if (!r.executado) {
            console.log(r.usuarios.length ? '\nSimulação: nada foi removido. Para remover, rode de novo com --confirmar.' : '\nNada a remover.');
        } else {
            console.log(`\nRemovido do banco. Fotos apagadas: ${r.arquivos.apagados.length}; já não existiam: ${r.arquivos.jaNaoExistiam.length}; `
                + `mantidas por ainda estarem em uso: ${r.fotos.publica.length + r.fotos.privada.length - r.fotosApagaveis.publica.length - r.fotosApagaveis.privada.length}.`);
            if (r.arquivos.falhas.length) {
                console.log(`Fotos que não puderam ser apagadas (remova pelo painel do Storage):\n  ${r.arquivos.falhas.join('\n  ')}`);
                process.exitCode = 1;
            }
        }
    } finally {
        await pool.end();
    }
})().catch(erro => {
    console.error(`Limpeza não executada: ${erro.message}`);
    process.exitCode = 1;
});
