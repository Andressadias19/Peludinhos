const { Readable } = require("node:stream");
const { ErroDeArmazenamento } = require("./erros");
const { AREAS, nomeValido } = require("./regras");

// DRIVER SUPABASE STORAGE (STORAGE_DRIVER=supabase)
// Usado só pelo backend, com a chave service role, que nunca sai do servidor:
//   área publica -> SUPABASE_BUCKET_PUBLICO (bucket público). O navegador continua pedindo /uploads/<nome>
//                   ao Express, que confere o nome e redireciona para a URL pública do arquivo (decisão D1).
//   área privada -> SUPABASE_BUCKET_PRIVADO (bucket privado), fotos de perfil. Os bytes são lidos pelo backend e
//                   entregues por GET /api/usuarios/:id/foto; nenhuma URL do bucket privado vai ao navegador.
// Os nomes dos arquivos são os mesmos do driver local e ficam na raiz do bucket, então os valores gravados no
// PostgreSQL ("/uploads/<nome>" e "<nome>") não mudam.
// Não há transação compartilhada entre o PostgreSQL e o Storage: veja "Limitações" no README.

const BUCKETS_PADRAO = Object.freeze({ publico: "peludinhos-publico", privado: "peludinhos-privado" });
const TEMPO_LIMITE_PADRAO = 15000;
const TEMPO_LIMITE_MINIMO = 1000;
const TEMPO_LIMITE_MAXIMO = 120000;
// Os envios são limitados a 5 MB pelas rotas; acima disto, a resposta não é uma foto do sistema.
const TAMANHO_MAXIMO_LEITURA = 10 * 1024 * 1024;
// Regras de nome de bucket do Supabase Storage (minúsculas, números, hífen e sublinhado).
const NOME_DE_BUCKET = /^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$/;
const HOSTS_HTTP_PERMITIDOS = ["localhost", "127.0.0.1", "[::1]"];
// Sem conexão estabelecida: a requisição não chegou ao Supabase, então nada foi gravado nem apagado.
const SEM_CONEXAO = ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT"];
// Respostas positivas de existência valem por 5 minutos no redirecionamento de /uploads (os arquivos nunca
// são sobrescritos; uma exclusão feita por este servidor limpa a entrada).
const VALIDADE_DO_CACHE_MS = 5 * 60 * 1000;
const MAXIMO_NO_CACHE = 1000;


const texto = valor => (typeof valor === "string" ? valor.trim() : "");

// CONFIGURAÇÃO: lida e validada só quando STORAGE_DRIVER=supabase
// As mensagens citam apenas nomes de variáveis, nunca os valores.
function lerConfiguracaoSupabase(env = process.env) {
    const erros = [];

    const urlBruta = texto(env.SUPABASE_URL);
    let url = "";
    if (!urlBruta) {
        erros.push("Defina SUPABASE_URL (endereço do projeto, como https://<projeto>.supabase.co).");
    } else {
        let endereco = null;
        try { endereco = new URL(urlBruta); } catch { erros.push("SUPABASE_URL não é uma URL válida."); }
        if (endereco) {
            const httpLocal = endereco.protocol === "http:" && HOSTS_HTTP_PERMITIDOS.includes(endereco.hostname);
            if (endereco.protocol !== "https:" && !httpLocal) erros.push("SUPABASE_URL deve usar https (http só para localhost).");
            if (endereco.username || endereco.password) erros.push("SUPABASE_URL não pode conter usuário ou senha.");
            if ((endereco.pathname !== "/" && endereco.pathname !== "") || endereco.search || endereco.hash) {
                erros.push("SUPABASE_URL deve ser só o endereço do projeto, sem caminho, parâmetros ou #.");
            }
            url = endereco.origin;
        }
    }

    const chave = texto(env.SUPABASE_SERVICE_ROLE_KEY);
    if (!chave) {
        erros.push("Defina SUPABASE_SERVICE_ROLE_KEY (chave service role, só no backend).");
    } else if (/\s/.test(chave)) {
        erros.push("SUPABASE_SERVICE_ROLE_KEY não pode conter espaços ou quebras de linha.");
    } else if (chave.length < 20) {
        erros.push("SUPABASE_SERVICE_ROLE_KEY parece incompleta.");
    } else if (/^sb_publishable_/.test(chave) || papelDaChave(chave) === "anon") {
        erros.push("SUPABASE_SERVICE_ROLE_KEY recebeu uma chave pública (anon/publishable); use a chave service role (secreta).");
    } else if (papelDaChave(chave) && papelDaChave(chave) !== "service_role") {
        erros.push("SUPABASE_SERVICE_ROLE_KEY não é uma chave service role.");
    }

    const bucketPublico = texto(env.SUPABASE_BUCKET_PUBLICO) || BUCKETS_PADRAO.publico;
    const bucketPrivado = texto(env.SUPABASE_BUCKET_PRIVADO) || BUCKETS_PADRAO.privado;
    for (const [variavel, bucket] of [["SUPABASE_BUCKET_PUBLICO", bucketPublico], ["SUPABASE_BUCKET_PRIVADO", bucketPrivado]]) {
        if (!NOME_DE_BUCKET.test(bucket)) erros.push(`${variavel} deve ter de 3 a 63 caracteres: letras minúsculas, números, - ou _.`);
    }
    if (bucketPublico.toLowerCase() === bucketPrivado.toLowerCase()) {
        erros.push("SUPABASE_BUCKET_PUBLICO e SUPABASE_BUCKET_PRIVADO precisam ser buckets diferentes: as fotos privadas não podem ficar no bucket público.");
    }

    let tempoLimiteMs = TEMPO_LIMITE_PADRAO;
    const tempo = texto(env.SUPABASE_TIMEOUT_MS);
    if (tempo) {
        tempoLimiteMs = /^\d+$/.test(tempo) ? Number(tempo) : NaN;
        if (!(tempoLimiteMs >= TEMPO_LIMITE_MINIMO && tempoLimiteMs <= TEMPO_LIMITE_MAXIMO)) {
            erros.push(`SUPABASE_TIMEOUT_MS deve ser um número inteiro de ${TEMPO_LIMITE_MINIMO} a ${TEMPO_LIMITE_MAXIMO}.`);
        }
    }

    if (erros.length) throw new Error(`Configuração do armazenamento inválida: ${erros.join(" ")}`);

    const configuracao = { url, bucketPublico, bucketPrivado, tempoLimiteMs };
    // A chave fica fora da enumeração: não aparece em console.log, JSON.stringify ou util.inspect da configuração.
    Object.defineProperty(configuracao, "chave", { value: chave, enumerable: false });
    return Object.freeze(configuracao);
}

// Papel declarado numa chave em formato JWT (chaves antigas do Supabase); null se não for JWT.
function papelDaChave(chave) {
    const partes = chave.split(".");
    if (partes.length !== 3 || !chave.startsWith("eyJ")) return null;
    try {
        const papel = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8")).role;
        return typeof papel === "string" ? papel : null;
    } catch {
        return null;
    }
}


// Todas as requisições ao Supabase passam por aqui: tempo limite em cada uma, inclusive na leitura do corpo.
// fetchBase é resolvido a cada chamada (permite injetar um fetch falso nos testes).
function fetchComTempoLimite(obterFetch, tempoLimiteMs) {
    return function (url, opcoes = {}) {
        const limite = AbortSignal.timeout(tempoLimiteMs);
        const signal = opcoes.signal ? AbortSignal.any([opcoes.signal, limite]) : limite;
        return obterFetch()(url, { ...opcoes, signal });
    };
}


function criarDriverSupabase(configuracao, opcoes = {}) {
    const criarCliente = opcoes.criarCliente || require("@supabase/supabase-js").createClient;
    const obterFetch = () => opcoes.fetch || globalThis.fetch;
    const buckets = { [AREAS.PUBLICA]: configuracao.bucketPublico, [AREAS.PRIVADA]: configuracao.bucketPrivado };

    // Cliente só de servidor: sem sessão de usuário, sem renovação de token e sem leitura de URL de login.
    // A autenticação dos usuários continua sendo o JWT próprio da API; o Supabase Auth não é usado.
    const cliente = criarCliente(configuracao.url, configuracao.chave, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: fetchComTempoLimite(obterFetch, configuracao.tempoLimiteMs) }
    });
    const bucket = area => cliente.storage.from(buckets[area]);

    // Remove a chave (e qualquer token com cara de JWT ou chave secreta) de textos que podem ir para o log.
    function limpar(valor) {
        let resultado = String(valor);
        if (configuracao.chave) resultado = resultado.split(configuracao.chave).join("***");
        return resultado.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "***").replace(/sb_secret_[\w-]+/g, "***");
    }

    // Causa resumida e sem segredos (o erro original do SDK não é anexado).
    function resumo(erro) {
        const partes = [erro && erro.name];
        if (erro && erro.status !== undefined) partes.push(`status ${erro.status}`);
        if (erro && erro.statusCode !== undefined) partes.push(`statusCode ${erro.statusCode}`);
        if (erro && erro.code !== undefined) partes.push(`code ${erro.code}`);
        if (erro && erro.message) partes.push(erro.message);
        const original = erro && erro.originalError;
        if (original) partes.push(`origem: ${original.name || ""} ${(original.cause && original.cause.code) || original.code || ""} ${original.message || ""}`.trim());
        return new Error(limpar(partes.filter(Boolean).join(" | ")));
    }

    const DESCRICAO = { salvar: "gravar", existe: "consultar", ler: "ler", excluir: "excluir", verificar: "verificar o bucket" };

    // MAPEIA ERROS DO SUPABASE PARA OS CÓDIGOS DA CAMADA
    // Só "objeto não encontrado" vira ARQUIVO_NAO_ENCONTRADO; bucket ausente, permissão, rede e tempo limite são falhas.
    function classificar(erro, nome, operacao) {
        if (erro instanceof ErroDeArmazenamento) return erro;
        const escrita = operacao === "salvar" || operacao === "excluir";
        const alvo = `${DESCRICAO[operacao] || operacao} ${nome} no Supabase Storage`;
        const causa = resumo(erro);
        const falha = (motivo, mensagem, incerto = false) =>
            new ErroDeArmazenamento("FALHA_NO_ARMAZENAMENTO", mensagem, causa, { motivo, resultadoIncerto: incerto && escrita });
        const incertoTexto = operacao === "salvar"
            ? " O resultado é incerto: o arquivo pode ter sido gravado e ficar órfão no bucket."
            : operacao === "excluir" ? " O resultado é incerto: o arquivo pode ter sido apagado." : "";

        const status = Number(erro && erro.status);
        const temRespostaHttp = Boolean(erro && erro.__isStorageError && Number.isFinite(status));
        if (temRespostaHttp) {
            const codigos = [String(erro.statusCode ?? ""), String(status)];
            const codigo = String(erro.code ?? "");
            const mensagem = String(erro.message ?? "");
            if (codigo === "NoSuchBucket" || /bucket not found/i.test(mensagem)) {
                return falha("CONFIGURACAO", `Bucket não encontrado ao ${alvo}. Confira SUPABASE_BUCKET_PUBLICO e SUPABASE_BUCKET_PRIVADO.`);
            }
            if (codigos.includes("409") || /^(Duplicate|KeyAlreadyExists|ResourceAlreadyExists)$/i.test(codigo) || /already exists|duplicate/i.test(mensagem)) {
                if (operacao === "salvar") return new ErroDeArmazenamento("ARQUIVO_JA_EXISTE", `Arquivo ${nome} já existe no Supabase Storage e não será sobrescrito.`, causa);
                return falha("DESCONHECIDO", `Conflito inesperado ao ${alvo}.`);
            }
            if (codigos.includes("404") || codigo === "NoSuchKey" || /object not found|^not.?found$/i.test(mensagem)) {
                if (operacao === "salvar" || operacao === "verificar") return falha("CONFIGURACAO", `Destino não encontrado ao ${alvo}.`);
                return new ErroDeArmazenamento("ARQUIVO_NAO_ENCONTRADO", `Arquivo ${nome} não encontrado no Supabase Storage.`, causa);
            }
            if (codigos.some(c => c === "401" || c === "403") || /^(AccessDenied|InvalidJWT|Unauthorized|InvalidSignature)$/i.test(codigo)
                || /row-level security|unauthorized|invalid jwt|signature/i.test(mensagem)) {
                return falha("PERMISSAO", `Sem permissão para ${alvo}. Confira SUPABASE_SERVICE_ROLE_KEY.`);
            }
            if (codigos.includes("429")) return falha("INDISPONIVEL", `Limite de requisições atingido ao ${alvo}.`);
            if (codigos.some(c => /^5\d\d$/.test(c))) {
                // 503: o serviço recusou antes de processar; outros 5xx podem ter ocorrido depois da gravação.
                const incerto = !codigos.includes("503");
                return falha("INDISPONIVEL", `Supabase Storage indisponível ao ${alvo}.${incerto ? incertoTexto : ""}`, incerto);
            }
            return falha("DESCONHECIDO", `Falha ao ${alvo}.`);
        }

        // Sem resposta HTTP: tempo limite, rede ou erro inesperado.
        const original = (erro && erro.originalError) || erro;
        const nomeDoErro = original && original.name;
        if (nomeDoErro === "TimeoutError" || nomeDoErro === "AbortError") {
            return falha("TEMPO_ESGOTADO", `Tempo limite esgotado ao ${alvo}.${incertoTexto}`, true);
        }
        const codigoDeRede = original && ((original.cause && original.cause.code) || original.code);
        if (SEM_CONEXAO.includes(codigoDeRede)) {
            return falha("INDISPONIVEL", `Não foi possível conectar ao Supabase Storage ao ${alvo}.`);
        }
        if ((erro && erro.__isStorageError) || original instanceof TypeError) {
            return falha("INDISPONIVEL", `Falha de rede ao ${alvo}.${incertoTexto}`, true);
        }
        return falha("DESCONHECIDO", `Falha inesperada ao ${alvo}.${incertoTexto}`, true);
    }

    // Executa uma chamada do SDK, que pode devolver { data, error } ou lançar (ex.: tempo esgotado no corpo).
    async function executar(operacao, nome, chamada) {
        let resultado;
        try {
            resultado = await chamada();
        } catch (erro) {
            throw classificar(erro, nome, operacao);
        }
        if (resultado && resultado.error) throw classificar(resultado.error, nome, operacao);
        return resultado ? resultado.data : undefined;
    }

    function respostaInvalida(nome, operacao) {
        return new ErroDeArmazenamento("FALHA_NO_ARMAZENAMENTO", `Resposta inesperada do Supabase Storage ao ${DESCRICAO[operacao]} ${nome}.`, undefined, { motivo: "RESPOSTA_INVALIDA" });
    }

    // Cache de existência das fotos públicas, usado só no redirecionamento de /uploads.
    const existentes = new Map();
    function lembrar(nome) {
        existentes.delete(nome);
        existentes.set(nome, Date.now() + VALIDADE_DO_CACHE_MS);
        if (existentes.size > MAXIMO_NO_CACHE) existentes.delete(existentes.keys().next().value);
    }
    function lembrado(nome) {
        const validade = existentes.get(nome);
        if (validade && validade > Date.now()) return true;
        existentes.delete(nome);
        return false;
    }


    // upsert=false: o Supabase recusa um nome já existente (ARQUIVO_JA_EXISTE) em vez de substituir o arquivo.
    // Em caso de erro, nada é apagado aqui: com resultado incerto, o objeto remoto pode ser de outra operação.
    async function salvar(area, nome, conteudo, { tipo } = {}) {
        await executar("salvar", nome, () => bucket(area).upload(nome, conteudo, { contentType: tipo, upsert: false, cacheControl: "3600" }));
    }

    // info() lê os metadados com resposta JSON, que distingue "objeto não encontrado" de bucket ausente ou sem permissão
    // (o HEAD usado por exists() do SDK não traz corpo e trataria qualquer 400/404 como inexistente).
    async function existe(area, nome) {
        try {
            await executar("existe", nome, () => bucket(area).info(nome));
            return true;
        } catch (erro) {
            if (erro.codigo === "ARQUIVO_NAO_ENCONTRADO") return false;
            throw erro;
        }
    }

    // O download termina (corpo inteiro na memória, até 10 MB) antes de devolver: falhas de leitura aparecem aqui,
    // antes de qualquer cabeçalho de sucesso, e o tamanho é exato.
    async function ler(area, nome, operacao = "ler") {
        const arquivo = await executar(operacao, nome, () => bucket(area).download(nome));
        if (!arquivo || typeof arquivo.arrayBuffer !== "function" || !(arquivo.size <= TAMANHO_MAXIMO_LEITURA)) throw respostaInvalida(nome, operacao);
        try {
            return Buffer.from(await arquivo.arrayBuffer());
        } catch (erro) {
            throw classificar(erro, nome, operacao);
        }
    }

    async function abrirLeitura(area, nome) {
        const conteudo = await ler(area, nome);
        return { stream: Readable.from([conteudo]), tamanho: conteudo.length };
    }

    // remove() devolve a lista dos objetos apagados; lista vazia significa que o arquivo já não existia.
    async function excluir(area, nome) {
        if (area === AREAS.PUBLICA) existentes.delete(nome);
        const apagados = await executar("excluir", nome, () => bucket(area).remove([nome]));
        if (!Array.isArray(apagados)) throw respostaInvalida(nome, "excluir");
        return apagados.length > 0;
    }

    // /uploads/<nome>: confere o nome, confirma que o arquivo existe no bucket PÚBLICO e redireciona para a URL
    // pública dele. O destino é montado só com a configuração do servidor e um nome no formato do sistema;
    // nada da requisição (query, outros caminhos, cabeçalhos) entra no endereço.
    function middlewarePublico() {
        const prefixo = `${configuracao.url}/storage/v1/object/public/${configuracao.bucketPublico}/`;
        return async function redirecionarFotoPublica(req, res, next) {
            if (req.method !== "GET" && req.method !== "HEAD") return next();
            const nome = req.path.slice(1);
            // Sem decodificação: um nome válido não tem % nem barras; qualquer outra coisa segue para o 404.
            if (req.path !== `/${nome}` || !nomeValido(nome)) return next();
            try {
                if (!lembrado(nome)) {
                    if (!(await existe(AREAS.PUBLICA, nome))) return next();
                    lembrar(nome);
                }
            } catch (erro) {
                console.error("Foto pública não pôde ser consultada no Supabase Storage:", erro);
                res.set("Cache-Control", "no-store");
                return res.status(503).json({ erro: "Não foi possível carregar a foto." });
            }
            const destino = bucket(AREAS.PUBLICA).getPublicUrl(nome).data.publicUrl;
            if (destino !== prefixo + nome) return next();
            res.set({ "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" });
            return res.redirect(302, destino);
        };
    }

    // Confere na inicialização se os buckets existem, se a chave tem acesso e se a visibilidade está certa.
    // Falha de rede não impede o início (o Supabase pode estar fora do ar); configuração errada impede.
    async function verificar() {
        const problemas = [];
        for (const [area, nomeDoBucket, deveSerPublico] of [["público", configuracao.bucketPublico, true], ["privado", configuracao.bucketPrivado, false]]) {
            let dados;
            try {
                dados = await executar("verificar", nomeDoBucket, () => cliente.storage.getBucket(nomeDoBucket));
            } catch (erro) {
                if (erro.motivo === "INDISPONIVEL" || erro.motivo === "TEMPO_ESGOTADO") return { disponivel: false, problemas: [], erro };
                problemas.push(erro.motivo === "PERMISSAO"
                    ? `sem permissão para acessar o bucket ${area} ${nomeDoBucket} (confira SUPABASE_SERVICE_ROLE_KEY)`
                    : `bucket ${area} ${nomeDoBucket} não encontrado`);
                continue;
            }
            if (!dados || dados.public !== deveSerPublico) {
                problemas.push(deveSerPublico
                    ? `o bucket público ${nomeDoBucket} não está marcado como público`
                    : `o bucket privado ${nomeDoBucket} está marcado como público: as fotos de perfil ficariam expostas`);
            }
        }
        return { disponivel: true, problemas };
    }

    function descrever() {
        return { driver: "supabase", url: configuracao.url, bucketPublico: configuracao.bucketPublico, bucketPrivado: configuracao.bucketPrivado, tempoLimiteMs: configuracao.tempoLimiteMs };
    }

    return { salvar, existe, ler: (area, nome) => ler(area, nome), abrirLeitura, excluir, middlewarePublico, verificar, descrever };
}

module.exports = { criarDriverSupabase, lerConfiguracaoSupabase, BUCKETS_PADRAO, TEMPO_LIMITE_PADRAO, TAMANHO_MAXIMO_LEITURA };
