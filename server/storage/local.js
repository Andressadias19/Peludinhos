const fsPadrao = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const { ErroDeArmazenamento } = require("./erros");

// DRIVER LOCAL: fotos em pastas do disco do servidor
// publica: servida em /uploads por express.static (animais, avistamentos, desaparecimentos)
// privada: nunca servida diretamente; sai só pela API (fotos de perfil: GET /api/usuarios/:id/foto)
// Recebe área e nome já validados pela fachada (index.js); mesmo assim confere que o caminho
// final fica dentro da pasta da área (defesa em profundidade contra path traversal).
// sistemaDeArquivos pode ser trocado nos testes para simular falhas do disco.
function criarDriverLocal({ publica, privada }, { sistemaDeArquivos = fsPadrao } = {}) {
    const fs = sistemaDeArquivos;
    const pastas = { publica, privada };

    function caminho(area, nome) {
        const pasta = path.resolve(pastas[area]);
        const arquivo = path.resolve(pasta, nome);
        if (path.dirname(arquivo) !== pasta) {
            throw new ErroDeArmazenamento("NOME_DE_ARQUIVO_INVALIDO", "Nome de arquivo inválido.");
        }
        return arquivo;
    }

    function traduzir(erro, nome) {
        // erros já classificados (como o caminho recusado por caminho()) seguem como estão
        if (erro instanceof ErroDeArmazenamento) return erro;
        if (erro && erro.code === "ENOENT") return new ErroDeArmazenamento("ARQUIVO_NAO_ENCONTRADO", `Arquivo ${nome} não encontrado.`, erro);
        if (erro && erro.code === "EEXIST") return new ErroDeArmazenamento("ARQUIVO_JA_EXISTE", `Arquivo ${nome} já existe e não será sobrescrito.`, erro);
        return new ErroDeArmazenamento("FALHA_NO_ARMAZENAMENTO", `Falha no armazenamento do arquivo ${nome}.`, erro);
    }

    // Grava sem sobrescrever (flag wx). Se a gravação falhar depois de criar o arquivo,
    // remove o que ficou pela metade; um arquivo que já existia nunca é tocado.
    async function salvar(area, nome, conteudo) {
        const arquivo = caminho(area, nome);
        try {
            await fs.mkdir(pastas[area], { recursive: true });
        } catch (erro) {
            // inclusive EEXIST (o caminho da pasta existe, mas é um arquivo): é falha da pasta, não colisão de nomes
            throw new ErroDeArmazenamento("FALHA_NO_ARMAZENAMENTO", `Falha ao preparar a pasta do arquivo ${nome}.`, erro);
        }
        let handle;
        try {
            handle = await fs.open(arquivo, "wx");
        } catch (erro) {
            throw traduzir(erro, nome);
        }
        try {
            await handle.writeFile(conteudo);
            await handle.close();
        } catch (erro) {
            await handle.close().catch(() => {});
            await fs.unlink(arquivo).catch(() => {});
            throw traduzir(erro, nome);
        }
    }

    async function existe(area, nome) {
        try {
            return (await fs.stat(caminho(area, nome))).isFile();
        } catch (erro) {
            if (erro.code === "ENOENT") return false;
            throw traduzir(erro, nome);
        }
    }

    async function ler(area, nome) {
        try {
            return await fs.readFile(caminho(area, nome));
        } catch (erro) {
            throw traduzir(erro, nome);
        }
    }

    // Abre antes de devolver: "não encontrado" é descoberto antes de qualquer cabeçalho ser enviado.
    async function abrirLeitura(area, nome) {
        let handle;
        try {
            handle = await fs.open(caminho(area, nome), "r");
            const info = await handle.stat();
            if (!info.isFile()) throw Object.assign(new Error("não é um arquivo"), { code: "ENOENT" });
            return { stream: handle.createReadStream(), tamanho: info.size };
        } catch (erro) {
            await handle?.close().catch(() => {});
            throw traduzir(erro, nome);
        }
    }

    // true se apagou; false se o arquivo já não existia
    async function excluir(area, nome) {
        try {
            await fs.unlink(caminho(area, nome));
            return true;
        } catch (erro) {
            if (erro.code === "ENOENT") return false;
            throw traduzir(erro, nome);
        }
    }

    // Arquivos públicos em /uploads, como antes da camada de armazenamento.
    function middlewarePublico() {
        return express.static(pastas.publica, {
            setHeaders: function (res) {
                res.setHeader("X-Content-Type-Options", "nosniff");
            }
        });
    }

    function descrever() {
        return { driver: "local", publica: path.resolve(pastas.publica), privada: path.resolve(pastas.privada) };
    }

    return { salvar, existe, ler, abrirLeitura, excluir, middlewarePublico, descrever };
}

module.exports = { criarDriverLocal };
