// LÊ E VALIDA A CONFIGURAÇÃO DO SERVIDOR HTTP (porta, modo de execução, CORS, diagnóstico e segredo do JWT)
// sem efeitos colaterais: pode ser testada sem subir o servidor

// origens do Vite em desenvolvimento (5173) e do vite preview (4173)
const ORIGENS_LOCAIS_PADRAO = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173"
];

const PORTA_PADRAO = 3001;
// tamanho mínimo do JWT_SECRET: com menos que isso, tokens podem ser forjados por força bruta
const TAMANHO_MINIMO_JWT_SECRET = 32;
// valores de exemplo do .env.example: nunca valem como segredo real
const SEGREDOS_DE_EXEMPLO = ["gere_um_segredo_aleatorio", "gere_um_segredo_so_para_testes", "gere_um_segredo_so_para_a_validacao"];


function texto(valor) {
    return typeof valor === "string" ? valor.trim() : "";
}


// cada item precisa ser uma origem completa (protocolo + host + porta opcional), sem caminho;
// "*" é recusado para que nenhuma configuração libere qualquer site
function lerOrigensCors(valor, erros) {
    const lista = texto(valor);

    if (!lista) {
        return ORIGENS_LOCAIS_PADRAO.slice();
    }

    const origens = [];

    lista.split(",").map(texto).filter(Boolean).forEach(function (item) {
        let endereco;

        try {
            endereco = new URL(item);
        } catch (erro) {
            erros.push(`CORS_ORIGIN contém um valor que não é uma origem válida: ${item}`);
            return;
        }

        const semBarraFinal = item.replace(/\/+$/, "");

        if (!["http:", "https:"].includes(endereco.protocol) || endereco.origin !== semBarraFinal) {
            erros.push(`CORS_ORIGIN aceita apenas origens como https://exemplo.com, sem caminho: ${item}`);
            return;
        }

        if (!origens.includes(endereco.origin)) {
            origens.push(endereco.origin);
        }
    });

    if (origens.length === 0 && erros.length === 0) {
        erros.push("CORS_ORIGIN não contém nenhuma origem.");
    }

    return origens;
}


function lerServirFrontend(env, argv, erros) {
    // argumento usado pelo script start:full; funciona igual no Windows e no Linux
    if (argv.includes("--serve-frontend")) {
        return true;
    }

    const valor = texto(env.SERVE_FRONTEND).toLowerCase();

    if (valor === "" || valor === "false") {
        return false;
    }

    if (valor === "true") {
        return true;
    }

    erros.push("SERVE_FRONTEND deve ser true ou false.");
    return false;
}


// DIAGNOSTICO_BANCO=true liga GET /api/teste-banco (consulta o banco sem login); desligada por padrão,
// para não ficar aberta em produção
function lerDiagnosticoBanco(env, erros) {
    const valor = texto(env.DIAGNOSTICO_BANCO).toLowerCase();

    if (valor === "" || valor === "false") {
        return false;
    }

    if (valor === "true") {
        return true;
    }

    erros.push("DIAGNOSTICO_BANCO deve ser true ou false.");
    return false;
}


function lerPorta(valor, erros) {
    const normalizado = texto(valor);

    if (!normalizado) {
        return PORTA_PADRAO;
    }

    if (!/^\d+$/.test(normalizado) || Number(normalizado) < 1 || Number(normalizado) > 65535) {
        erros.push("PORT deve ser um número inteiro entre 1 e 65535.");
        return PORTA_PADRAO;
    }

    return Number(normalizado);
}


function lerConfiguracaoServidor(env = process.env, argv = process.argv) {
    const erros = [];

    const configuracao = {
        porta: lerPorta(env.PORT, erros),
        servirFrontend: lerServirFrontend(env, argv, erros),
        origensCors: lerOrigensCors(env.CORS_ORIGIN, erros),
        diagnosticoBanco: lerDiagnosticoBanco(env, erros)
    };

    if (erros.length > 0) {
        throw new Error("Configuração do servidor inválida:\n- " + erros.join("\n- "));
    }

    return configuracao;
}


// SEGREDO DOS TOKENS (JWT_SECRET)
// sem ele, curto demais ou igual ao texto de exemplo, qualquer pessoa poderia forjar tokens (inclusive de
// administrador); o servidor não inicia. A mensagem nunca mostra o valor.
function validarSegredoJwt(env = process.env) {
    const segredo = texto(env.JWT_SECRET);
    const gerar = "gere com: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"";
    let motivo = null;

    if (!segredo) {
        motivo = `Defina JWT_SECRET (${gerar}).`;
    } else if (SEGREDOS_DE_EXEMPLO.includes(segredo)) {
        motivo = `JWT_SECRET ainda está com o texto de exemplo do .env.example; ${gerar}.`;
    } else if (segredo.length < TAMANHO_MINIMO_JWT_SECRET) {
        motivo = `JWT_SECRET deve ter pelo menos ${TAMANHO_MINIMO_JWT_SECRET} caracteres; ${gerar}.`;
    }

    if (motivo) {
        throw new Error("Configuração do servidor inválida:\n- " + motivo);
    }
}


// OPÇÕES DO PACOTE cors
// requisições sem cabeçalho Origin (testes, curl, aplicativos) seguem normalmente: CORS é uma
// regra do navegador e não substitui o JWT nem as permissões, que continuam valendo em cada rota;
// origem fora da lista não recebe os cabeçalhos CORS, e o navegador bloqueia a resposta
function opcoesCors(origens) {
    return {
        origin: function (origem, callback) {
            callback(null, !origem || origens.includes(origem));
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        allowedHeaders: ["Authorization", "Content-Type"],
        maxAge: 600
    };
}


module.exports = {
    lerConfiguracaoServidor,
    validarSegredoJwt,
    opcoesCors,
    TAMANHO_MINIMO_JWT_SECRET,
    ORIGENS_LOCAIS_PADRAO,
    PORTA_PADRAO
};
