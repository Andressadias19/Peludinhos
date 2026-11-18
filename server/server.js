// .env (padrão) ou, com --arquivo-env=<arquivo>, somente esse arquivo (veja config/carregarAmbiente.js)
require("./config/carregarAmbiente").carregarAmbiente();
const { lerConfiguracaoServidor, validarSegredoJwt } = require("./config/serverConfig");
const criarApp = require("./app");
const { armazenamento } = require("./storage");

// PORT, SERVE_FRONTEND (ou o argumento --serve-frontend), CORS_ORIGIN, DIAGNOSTICO_BANCO e JWT_SECRET;
// valores inválidos impedem o servidor de subir, com a lista do que corrigir
const configuracao = lerConfiguracaoServidor(process.env, process.argv);
validarSegredoJwt(process.env);

const app = criarApp(configuracao);

// No modo supabase, confere buckets e permissões antes de aceitar requisições (no modo local, nada a conferir).
// Configuração remota errada impede o início; o Supabase fora do ar só gera um aviso.
armazenamento.verificar().then(() => {
    // sem host fixo: aceita conexões de qualquer interface de rede (necessário em hospedagem)
    app.listen(configuracao.porta, () => {
        const modo = configuracao.servirFrontend ? "API e frontend" : "somente API";
        const ambiente = process.env.PELUDINHOS_ARQUIVO_ENV ? ` - ambiente ${process.env.PELUDINHOS_ARQUIVO_ENV}, armazenamento ${armazenamento.driver}` : "";
        console.log(`Servidor rodando na porta ${configuracao.porta} (${modo})${ambiente}`);
    });
}).catch(erro => {
    console.error(erro.message);
    process.exit(1);
});
