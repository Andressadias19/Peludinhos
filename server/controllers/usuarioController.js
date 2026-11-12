const pool = require("../config/database");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");

// fotos de perfil ficam em server/uploads (o banco guarda só o caminho "/uploads/...")
const PASTA_UPLOADS = path.join(__dirname, "..", "uploads");


// CADASTRAR USUÁRIO
async function cadastrarUsuario(req, res) {
    try {
        const { nome, senha, telefone } = req.body || {};
        // e-mail sem espaços e em minúsculas: Ana@exemplo.com e ana@exemplo.com são a mesma conta
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

        if (!nome || !email || !senha) {
            return res.status(400).json({
                erro: "Preencha todos os campos obrigatórios."
            });
        }

        const usuarioExistente = await pool.query(
            "SELECT id_usuario FROM Usuario WHERE lower(email) = $1",
            [email]
        );

        if (usuarioExistente.rows.length > 0) {
            return res.status(409).json({
                erro: "Este e-mail já está cadastrado."
            });
        }

        const senhaHash = await bcrypt.hash(senha, 10);

        const resultado = await pool.query(
            `INSERT INTO Usuario
            (nome, email, senha_hash, telefone, tipo_usuario)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id_usuario, nome, email, telefone, tipo_usuario, data_cadastro, ativo`,
            [nome, email, senhaHash, telefone || null, "usuario"]
        );

        return res.status(201).json({
            mensagem: "Usuário cadastrado com sucesso!",
            usuario: resultado.rows[0]
        });

    } catch (erro) {
        // dois cadastros simultâneos com o mesmo e-mail: o índice único do banco barra o segundo
        if (erro.code === "23505") {
            return res.status(409).json({
                erro: "Este e-mail já está cadastrado."
            });
        }

        console.error("Erro ao cadastrar usuário:", erro);

        return res.status(500).json({
            erro: "Erro interno do servidor."
        });
    }
}


// BUSCAR PERFIL DO USUÁRIO LOGADO
async function buscarMeuPerfil(req, res) {
    try {
        const idUsuario = req.usuario.id_usuario;

        const resultado = await pool.query(
            `SELECT
                id_usuario,
                nome,
                email,
                telefone,
                foto_perfil,
                tipo_usuario,
                data_cadastro,
                ativo
            FROM Usuario
            WHERE id_usuario = $1
            AND ativo = TRUE`,
            [idUsuario]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                erro: "Usuário não encontrado."
            });
        }

        return res.status(200).json({
            usuario: resultado.rows[0]
        });

    } catch (erro) {
        console.error("Erro ao buscar perfil:", erro);

        return res.status(500).json({
            erro: "Erro interno do servidor."
        });
    }
}


// CAMPOS QUE O PRÓPRIO USUÁRIO PODE ALTERAR NO PERFIL
// qualquer outro campo (tipo_usuario, ativo, id_usuario, senha_hash, email...) é recusado
const CAMPOS_EDITAVEIS = ["nome", "telefone"];


// ATUALIZAR PERFIL DO USUÁRIO LOGADO
async function atualizarMeuPerfil(req, res) {
    try {
        // o id vem SEMPRE do token, nunca do corpo da requisição
        const idUsuario = req.usuario.id_usuario;
        const dados = req.body || {};

        const camposRecebidos = Object.keys(dados);

        const camposProibidos = camposRecebidos.filter(function (campo) {
            return !CAMPOS_EDITAVEIS.includes(campo);
        });

        if (camposProibidos.length > 0) {
            return res.status(400).json({
                erro: "Campo(s) não permitido(s): " + camposProibidos.join(", ") + "."
            });
        }

        if (camposRecebidos.length === 0) {
            return res.status(400).json({
                erro: "Nenhum dado para atualizar."
            });
        }

        const colunas = [];
        const valores = [];

        if (dados.nome !== undefined) {
            const nome = typeof dados.nome === "string" ? dados.nome.trim() : "";

            if (nome.length < 3 || nome.length > 255) {
                return res.status(400).json({
                    erro: "Informe seu nome completo."
                });
            }

            valores.push(nome);
            colunas.push("nome = $" + valores.length);
        }

        if (dados.telefone !== undefined) {
            const telefone = typeof dados.telefone === "string"
                ? dados.telefone.replace(/\D/g, "")
                : "";

            if (telefone.length < 10 || telefone.length > 11) {
                return res.status(400).json({
                    erro: "Informe um celular válido com DDD."
                });
            }

            valores.push(telefone);
            colunas.push("telefone = $" + valores.length);
        }

        valores.push(idUsuario);

        const resultado = await pool.query(
            `UPDATE Usuario
            SET ${colunas.join(", ")}
            WHERE id_usuario = $${valores.length}
            AND ativo = TRUE
            RETURNING id_usuario, nome, email, telefone, foto_perfil, tipo_usuario, data_cadastro, ativo`,
            valores
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                erro: "Usuário não encontrado."
            });
        }

        return res.status(200).json({
            mensagem: "Perfil atualizado com sucesso!",
            usuario: resultado.rows[0]
        });

    } catch (erro) {
        console.error("Erro ao atualizar perfil:", erro);

        return res.status(500).json({
            erro: "Erro interno do servidor."
        });
    }
}


// ALTERAR SENHA DO USUÁRIO LOGADO
async function alterarMinhaSenha(req, res) {
    try {
        const idUsuario = req.usuario.id_usuario;
        const { senha_atual, nova_senha } = req.body || {};

        if (typeof senha_atual !== "string" || typeof nova_senha !== "string" || !senha_atual || !nova_senha) {
            return res.status(400).json({
                erro: "Informe a senha atual e a nova senha."
            });
        }

        if (nova_senha.length < 6) {
            return res.status(400).json({
                erro: "A nova senha deve ter pelo menos 6 caracteres."
            });
        }

        const resultado = await pool.query(
            "SELECT senha_hash FROM Usuario WHERE id_usuario = $1 AND ativo = TRUE",
            [idUsuario]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                erro: "Usuário não encontrado."
            });
        }

        const senhaCorreta = await bcrypt.compare(
            senha_atual,
            resultado.rows[0].senha_hash
        );

        // 400 (e não 401) para o frontend não confundir com sessão expirada
        if (!senhaCorreta) {
            return res.status(400).json({
                erro: "A senha atual está incorreta."
            });
        }

        const novaSenhaHash = await bcrypt.hash(nova_senha, 10);

        await pool.query(
            "UPDATE Usuario SET senha_hash = $1 WHERE id_usuario = $2",
            [novaSenhaHash, idUsuario]
        );

        return res.status(200).json({
            mensagem: "Senha alterada com sucesso!"
        });

    } catch (erro) {
        console.error("Erro ao alterar senha:", erro);

        return res.status(500).json({
            erro: "Erro interno do servidor."
        });
    }
}


// DESCOBRIR O TIPO REAL DA IMAGEM PELOS PRIMEIROS BYTES
// (não confia no Content-Type nem no nome do arquivo enviados pelo navegador)
function extensaoDaImagem(buffer) {
    if (buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return "jpg";
    }

    if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
        return "png";
    }

    if (buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
        return "webp";
    }

    return null;
}


// APAGAR O ARQUIVO DA FOTO ANTIGA (só arquivos da pasta uploads)
function apagarFotoAntiga(fotoPerfil) {
    if (!fotoPerfil || !fotoPerfil.startsWith("/uploads/")) {
        return;
    }

    // basename impede caminhos como "/uploads/../../server.js"
    const arquivo = path.join(PASTA_UPLOADS, path.basename(fotoPerfil));

    fs.promises.unlink(arquivo).catch(function () {
        // se o arquivo já não existe, não há nada a fazer
    });
}


// ENVIAR / TROCAR FOTO DO USUÁRIO LOGADO
// o corpo da requisição é o próprio arquivo da imagem (express.raw na rota)
async function atualizarMinhaFoto(req, res) {
    try {
        const idUsuario = req.usuario.id_usuario;
        const imagem = req.body;

        if (!Buffer.isBuffer(imagem) || imagem.length === 0) {
            return res.status(400).json({
                erro: "Envie uma imagem JPG, PNG ou WEBP."
            });
        }

        const extensao = extensaoDaImagem(imagem);

        if (!extensao) {
            return res.status(400).json({
                erro: "O arquivo enviado não é uma imagem JPG, PNG ou WEBP válida."
            });
        }

        const atual = await pool.query(
            "SELECT foto_perfil FROM Usuario WHERE id_usuario = $1 AND ativo = TRUE",
            [idUsuario]
        );

        if (atual.rows.length === 0) {
            return res.status(404).json({
                erro: "Usuário não encontrado."
            });
        }

        // nome gerado pelo servidor: id do usuário + horário (também evita cache da foto antiga)
        const nomeArquivo = `usuario-${idUsuario}-${Date.now()}.${extensao}`;

        await fs.promises.mkdir(PASTA_UPLOADS, { recursive: true });
        await fs.promises.writeFile(path.join(PASTA_UPLOADS, nomeArquivo), imagem);

        const resultado = await pool.query(
            `UPDATE Usuario
            SET foto_perfil = $1
            WHERE id_usuario = $2
            RETURNING id_usuario, nome, email, telefone, foto_perfil, tipo_usuario, data_cadastro, ativo`,
            ["/uploads/" + nomeArquivo, idUsuario]
        );

        apagarFotoAntiga(atual.rows[0].foto_perfil);

        return res.status(200).json({
            mensagem: "Foto atualizada com sucesso!",
            usuario: resultado.rows[0]
        });

    } catch (erro) {
        console.error("Erro ao atualizar foto:", erro);

        return res.status(500).json({
            erro: "Erro interno do servidor."
        });
    }
}


// REMOVER FOTO DO USUÁRIO LOGADO
async function removerMinhaFoto(req, res) {
    try {
        const idUsuario = req.usuario.id_usuario;

        const atual = await pool.query(
            "SELECT foto_perfil FROM Usuario WHERE id_usuario = $1 AND ativo = TRUE",
            [idUsuario]
        );

        if (atual.rows.length === 0) {
            return res.status(404).json({
                erro: "Usuário não encontrado."
            });
        }

        const resultado = await pool.query(
            `UPDATE Usuario
            SET foto_perfil = NULL
            WHERE id_usuario = $1
            RETURNING id_usuario, nome, email, telefone, foto_perfil, tipo_usuario, data_cadastro, ativo`,
            [idUsuario]
        );

        apagarFotoAntiga(atual.rows[0].foto_perfil);

        return res.status(200).json({
            mensagem: "Foto removida com sucesso!",
            usuario: resultado.rows[0]
        });

    } catch (erro) {
        console.error("Erro ao remover foto:", erro);

        return res.status(500).json({
            erro: "Erro interno do servidor."
        });
    }
}


// EXPORTAR FUNÇÕES
module.exports = {
    cadastrarUsuario,
    buscarMeuPerfil,
    atualizarMeuPerfil,
    alterarMinhaSenha,
    atualizarMinhaFoto,
    removerMinhaFoto,
    CAMPOS_EDITAVEIS,
    apagarFotoAntiga
};