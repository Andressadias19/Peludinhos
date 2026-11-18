const { lerPastasDeUpload } = require("../config/uploadsConfig");
const { criarDriverLocal } = require("./local");
const { criarDriverSupabase, lerConfiguracaoSupabase } = require("./supabase");
const { ErroDeArmazenamento } = require("./erros");
const { AREAS, PREFIXO_PUBLICO, NOME_DE_ARQUIVO, TIPOS, nomeValido, tipoDoArquivo } = require("./regras");

// CAMADA DE ARMAZENAMENTO DAS FOTOS
// Os controllers usam só esta interface; o driver (STORAGE_DRIVER) decide onde os arquivos ficam:
//   local (padrão): pastas do disco (UPLOADS_DIR e UPLOADS_PRIVATE_DIR)       -> server/storage/local.js
//   supabase:       buckets do Supabase Storage (SUPABASE_BUCKET_PUBLICO/PRIVADO) -> server/storage/supabase.js
// Todo driver implementa os mesmos métodos assíncronos:
//
//   salvar(area, nome, conteudo, { tipo })  grava um Buffer; nunca sobrescreve (erro ARQUIVO_JA_EXISTE)
//   existe(area, nome)            true/false
//   ler(area, nome)               Buffer (erro ARQUIVO_NAO_ENCONTRADO)
//   abrirLeitura(area, nome)      { stream, tamanho }; "não encontrado" é descoberto antes de a resposta começar
//   excluir(area, nome)           true se apagou, false se já não existia
//   middlewarePublico()           middleware Express montado em /uploads
//   descrever()                   { driver, ... } para diagnóstico e para os testes (sem segredos)
//   verificar()                   opcional: confere a configuração remota na inicialização
//
// A fachada acrescenta descartar(area, nome, contexto): exclusão que registra falhas no log sem lançar erro.
//
// Esta fachada valida área, nome e conteúdo antes de chamar o driver, e converte nomes de arquivo
// nos valores gravados no PostgreSQL (e vice-versa). Esses valores não mudam com o driver:
//   área publica: "/uploads/<nome>" (fotos de animais, avistamentos e desaparecimentos)
//   área privada: "<nome>"          (fotos de perfil, Usuario.foto_perfil; saem só por GET /api/usuarios/:id/foto)

const DRIVER_PADRAO = "local";
const DRIVERS = ["local", "supabase"];


function erroDeConfiguracao(motivo) {
    return new Error(`Configuração do armazenamento inválida: ${motivo}`);
}

// STORAGE_DRIVER: local (padrão) ou supabase. Qualquer outro valor impede o servidor de iniciar.
function lerDriver(env = process.env) {
    const bruto = typeof env.STORAGE_DRIVER === "string" ? env.STORAGE_DRIVER.trim() : "";
    const driver = bruto.toLowerCase() || DRIVER_PADRAO;
    if (DRIVERS.includes(driver)) return driver;
    throw erroDeConfiguracao(`STORAGE_DRIVER deve ser local ou supabase (recebido: ${JSON.stringify(bruto.slice(0, 40))}).`);
}


function validarArea(area) {
    if (area !== AREAS.PUBLICA && area !== AREAS.PRIVADA) {
        throw new ErroDeArmazenamento("AREA_INVALIDA", "Área de armazenamento inválida.");
    }
}

function validarNome(nome) {
    if (!nomeValido(nome)) throw new ErroDeArmazenamento("NOME_DE_ARQUIVO_INVALIDO", "Nome de arquivo inválido.");
}

// Valor gravado no banco para um arquivo da área
function referencia(area, nome) {
    validarArea(area);
    validarNome(nome);
    return area === AREAS.PUBLICA ? PREFIXO_PUBLICO + nome : nome;
}

// Nome do arquivo a partir do valor gravado no banco; null se o valor não for uma referência válida da área
// (nesse caso nenhum arquivo é lido ou apagado)
function nomeDaReferencia(area, valor) {
    validarArea(area);
    if (typeof valor !== "string") return null;
    if (area === AREAS.PUBLICA) {
        if (!valor.startsWith(PREFIXO_PUBLICO)) return null;
        const nome = valor.slice(PREFIXO_PUBLICO.length);
        return nomeValido(nome) ? nome : null;
    }
    return nomeValido(valor) ? valor : null;
}

// Cria o driver definido por STORAGE_DRIVER. As variáveis SUPABASE_* só são lidas (e exigidas) no modo supabase;
// UPLOADS_DIR e UPLOADS_PRIVATE_DIR, só no modo local.
function criarDriver(env, opcoes) {
    if (lerDriver(env) === "supabase") {
        return criarDriverSupabase(lerConfiguracaoSupabase(env), { fetch: opcoes.fetch, criarCliente: opcoes.criarCliente });
    }
    return criarDriverLocal(lerPastasDeUpload(env));
}


// MONTA A FACHADA SOBRE UM DRIVER
// opcoes.driver: driver já criado (usado nos testes para simular falhas); padrão: o definido por STORAGE_DRIVER.
// opcoes.fetch e opcoes.criarCliente: substituem o acesso à rede do driver supabase (testes sem conexão externa).
function criarArmazenamento(env = process.env, opcoes = {}) {
    const driver = opcoes.driver || criarDriver(env, opcoes);
    const nomeDoDriver = driver.descrever().driver;

    function preparar(area, nome) {
        validarArea(area);
        validarNome(nome);
    }

    async function salvar(area, nome, conteudo) {
        preparar(area, nome);
        if (!Buffer.isBuffer(conteudo) || conteudo.length === 0) {
            throw new ErroDeArmazenamento("CONTEUDO_INVALIDO", "Conteúdo do arquivo inválido.");
        }
        await driver.salvar(area, nome, conteudo, { tipo: tipoDoArquivo(nome) });
        return { area, nome, referencia: referencia(area, nome) };
    }

    async function existe(area, nome) {
        preparar(area, nome);
        return driver.existe(area, nome);
    }

    async function ler(area, nome) {
        preparar(area, nome);
        return driver.ler(area, nome);
    }

    async function abrirLeitura(area, nome) {
        preparar(area, nome);
        const arquivo = await driver.abrirLeitura(area, nome);
        return { ...arquivo, tipo: tipoDoArquivo(nome) };
    }

    async function excluir(area, nome) {
        preparar(area, nome);
        return driver.excluir(area, nome);
    }

    // Exclusão que nunca interrompe a operação: usada na compensação (arquivo novo de uma transação
    // desfeita) e na remoção da foto antiga depois do COMMIT. Falhas vão para o log e o arquivo fica órfão,
    // sem afetar o banco, que já está correto. Devolve true se apagou.
    async function descartar(area, nome, contexto = "Arquivo não pôde ser removido:") {
        try {
            return await excluir(area, nome);
        } catch (erro) {
            console.error(contexto, erro);
            return false;
        }
    }

    // Na inicialização: configuração remota errada (bucket ausente, sem permissão, privado marcado como público)
    // impede o servidor de subir; serviço fora do ar só gera um aviso.
    async function verificar() {
        if (typeof driver.verificar !== "function") return;
        const resultado = await driver.verificar();
        if (resultado.problemas.length) throw erroDeConfiguracao(`${resultado.problemas.join("; ")}.`);
        if (!resultado.disponivel) {
            console.warn(`Aviso: o armazenamento ${nomeDoDriver} não respondeu na inicialização (${resultado.erro.message}). `
                + "As operações com fotos podem falhar até o serviço voltar.");
        }
    }

    return Object.freeze({
        driver: nomeDoDriver,
        salvar,
        existe,
        ler,
        abrirLeitura,
        excluir,
        descartar,
        verificar,
        referencia,
        nomeDaReferencia,
        middlewarePublico: () => driver.middlewarePublico(),
        descrever: () => driver.descrever()
    });
}


// Instância usada pela aplicação, criada no primeiro acesso (depois do dotenv), não no primeiro require.
let instancia;

module.exports = {
    get armazenamento() {
        if (!instancia) instancia = criarArmazenamento(process.env);
        return instancia;
    },
    criarArmazenamento,
    lerDriver,
    referencia,
    nomeDaReferencia,
    ErroDeArmazenamento,
    AREAS,
    PREFIXO_PUBLICO,
    NOME_DE_ARQUIVO,
    TIPOS
};
