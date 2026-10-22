console.log("JavaScript do perfil carregado!");

// Depende de ../js/auth.js (obterToken, sair, fetchAutenticado, API_URL),
// que já foi carregado no <head> e já redirecionou quem está sem token.


// ELEMENTOS DA PÁGINA
const estadoCarregando = document.getElementById("estadoCarregando");
const estadoErro = document.getElementById("estadoErro");
const conteudoPerfil = document.getElementById("conteudoPerfil");
const mensagemErro = document.getElementById("mensagemErro");

const cabecalhoPerfil = document.getElementById("cabecalhoPerfil");
const avatarImagem = document.getElementById("avatarImagem");
const avatarPlaceholder = document.getElementById("avatarPlaceholder");
const perfilNome = document.getElementById("perfilNome");
const perfilMembroDesde = document.getElementById("perfilMembroDesde");
const perfilEmail = document.getElementById("perfilEmail");
const perfilTelefone = document.getElementById("perfilTelefone");
const avisoSucesso = document.getElementById("avisoSucesso");

const modoVisualizacao = document.getElementById("modoVisualizacao");
const formEditar = document.getElementById("formEditar");
const formSenha = document.getElementById("formSenha");

const nomeInput = document.getElementById("nome");
const celularInput = document.getElementById("celular");
const emailSomenteLeitura = document.getElementById("emailSomenteLeitura");

const senhaAtualInput = document.getElementById("senhaAtual");
const novaSenhaInput = document.getElementById("novaSenha");
const confirmarNovaSenhaInput = document.getElementById("confirmarNovaSenha");

const fotoInput = document.getElementById("foto");
const fotoPreview = document.getElementById("fotoPreview");
const fotoPlaceholder = document.getElementById("fotoPlaceholder");
const removerFotoBtn = document.getElementById("removerFoto");
const textoFoto = document.getElementById("textoFoto");

const TAMANHO_MAX_FOTO = 5 * 1024 * 1024; // 5 MB (mesmo limite do servidor)
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];

// o que fazer com a foto ao salvar: null = não mexer, File = enviar nova, "remover" = apagar
let alteracaoFoto = null;

// dados que vieram do servidor (única fonte dos dados exibidos)
let usuarioAtual = null;


// ALTERNAR ENTRE CARREGANDO / ERRO / CONTEÚDO
function mostrarSecao(secao) {
  [estadoCarregando, estadoErro, conteudoPerfil].forEach(function (elemento) {
    elemento.classList.toggle("hidden", elemento !== secao);
    elemento.classList.toggle("flex", elemento === secao);
  });
}

// dentro do perfil: visualização, formulário de edição ou formulário de senha
function mostrarModo(modo) {
  [modoVisualizacao, formEditar, formSenha].forEach(function (elemento) {
    elemento.classList.toggle("hidden", elemento !== modo);
    elemento.classList.toggle("flex", elemento === modo);
  });

  // no formulário de edição a foto já aparece no próprio formulário,
  // então a foto/nome/"membro desde" do topo ficam escondidos
  const editando = modo === formEditar;
  cabecalhoPerfil.classList.toggle("hidden", editando);
  cabecalhoPerfil.classList.toggle("flex", !editando);

  window.scrollTo({ top: 0, behavior: "smooth" });
}


// FORMATAÇÃO
// "93991234567" → "(93) 99123-4567" (mesma máscara do cadastro)
function formatarTelefone(valor) {
  let numeros = (valor || "").replace(/\D/g, "").slice(0, 11);

  if (numeros.length > 10) {
    numeros = numeros.replace(/^(\d{2})(\d{5})(\d{0,4})$/, "($1) $2-$3");
  } else if (numeros.length > 6) {
    numeros = numeros.replace(/^(\d{2})(\d{4})(\d{0,4})$/, "($1) $2-$3");
  } else if (numeros.length > 2) {
    numeros = numeros.replace(/^(\d{2})(\d{0,5})$/, "($1) $2");
  } else if (numeros.length > 0) {
    numeros = numeros.replace(/^(\d{0,2})$/, "($1");
  }

  return numeros;
}

function formatarMembroDesde(dataCadastro) {
  const data = new Date(dataCadastro);

  if (!dataCadastro || isNaN(data)) {
    return "";
  }

  return "Membro desde " + data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}


// FOTO DE PERFIL
// foto_perfil pode ser uma URL completa ou um caminho do servidor (ex.: "/uploads/foto.jpg")
function urlDaFoto(fotoPerfil) {
  if (!fotoPerfil) {
    return null;
  }

  if (/^https?:\/\//i.test(fotoPerfil)) {
    return fotoPerfil;
  }

  return new URL(fotoPerfil, new URL(API_URL).origin).href;
}

function mostrarAvatarPadrao() {
  avatarImagem.removeAttribute("src");
  avatarImagem.classList.add("hidden");
  avatarPlaceholder.classList.remove("hidden");
  avatarPlaceholder.classList.add("flex");
}

// se a imagem não existir mais no servidor, volta para o ícone (sem imagem quebrada)
avatarImagem.addEventListener("error", mostrarAvatarPadrao);

function preencherAvatar(fotoPerfil) {
  const url = urlDaFoto(fotoPerfil);

  if (!url) {
    mostrarAvatarPadrao();
    return;
  }

  avatarImagem.src = url;
  avatarImagem.classList.remove("hidden");
  avatarPlaceholder.classList.add("hidden");
  avatarPlaceholder.classList.remove("flex");
}


// PREENCHER A TELA COM OS DADOS REAIS
// textContent (e não innerHTML) para o conteúdo do usuário nunca virar HTML
function preencherPerfil(usuario) {
  usuarioAtual = usuario;

  perfilNome.textContent = usuario.nome;
  perfilMembroDesde.textContent = formatarMembroDesde(usuario.data_cadastro);
  perfilEmail.textContent = usuario.email;
  perfilTelefone.textContent = usuario.telefone ? formatarTelefone(usuario.telefone) : "Não informado";
  preencherAvatar(usuario.foto_perfil);
}


// CARREGAR PERFIL: GET /api/usuarios/me
// o usuário é identificado pelo JWT (Authorization: Bearer ...), nunca por ID na URL
async function carregarPerfil() {
  mostrarSecao(estadoCarregando);

  try {
    const resposta = await fetchAutenticado("/usuarios/me");

    // conta desativada ou removida depois do login: a sessão não vale mais
    if (resposta.status === 404) {
      sair();
      return;
    }

    if (!resposta.ok) {
      throw new Error("Erro " + resposta.status);
    }

    const dados = await resposta.json();

    preencherPerfil(dados.usuario);
    mostrarModo(modoVisualizacao);
    mostrarSecao(conteudoPerfil);

  } catch (erro) {
    // 401 → fetchAutenticado já removeu o token e está redirecionando
    if (!obterToken()) {
      return;
    }

    // servidor offline / erro 500: NÃO faz logout, só avisa
    console.error("Erro ao carregar perfil:", erro);
    mostrarSecao(estadoErro);
  }
}

document.getElementById("tentarNovamente").addEventListener("click", carregarPerfil);


// LOGOUT
document.querySelectorAll(".botao-sair").forEach(function (botao) {
  botao.addEventListener("click", sair);
});


// MENSAGENS DE ERRO (mesmo padrão do cadastro: <p id="erro-CAMPO">)
function mostrarErro(campo, mensagem) {
  const erro = document.getElementById("erro-" + campo);
  erro.textContent = mensagem;
  erro.classList.remove("hidden");

  const input = document.getElementById(campo);
  if (input && input.tagName === "INPUT") {
    input.classList.add("input-erro");
  }
}

function limparErro(campo) {
  const erro = document.getElementById("erro-" + campo);
  erro.textContent = "";
  erro.classList.add("hidden");

  const input = document.getElementById(campo);
  if (input) {
    input.classList.remove("input-erro");
  }
}

function limparErrosDoFormulario(form) {
  form.querySelectorAll(".erro-msg").forEach(function (erro) {
    limparErro(erro.id.replace("erro-", ""));
  });
}

[nomeInput, celularInput, senhaAtualInput, novaSenhaInput, confirmarNovaSenhaInput].forEach(function (input) {
  input.addEventListener("input", function () {
    limparErro(input.id);
  });
});

function mostrarAviso(mensagem) {
  avisoSucesso.textContent = mensagem;
  avisoSucesso.classList.remove("hidden");
}

function esconderAviso() {
  avisoSucesso.classList.add("hidden");
}

// trava o botão enquanto a requisição está em andamento (evita envio duplo)
function travarFormulario(form, travado) {
  form.querySelector("button[type=submit]").disabled = travado;
}


// VER E DESVER SENHA (igual ao cadastro)
document.querySelectorAll(".toggle-senha").forEach(function (toggle) {
  toggle.addEventListener("click", function () {
    const input = document.getElementById(toggle.dataset.target);
    input.type = input.type === "password" ? "text" : "password";
  });
});


// FOTO NO FORMULÁRIO DE EDIÇÃO
// mostra no círculo a foto atual, a nova foto escolhida ou o ícone padrão
function mostrarFotoNoFormulario(url) {
  if (fotoPreview.src.startsWith("blob:")) {
    URL.revokeObjectURL(fotoPreview.src); // libera a pré-visualização anterior
  }

  if (url) {
    fotoPreview.src = url;
    fotoPreview.classList.remove("hidden");
    fotoPlaceholder.classList.add("hidden");
    fotoPlaceholder.classList.remove("flex");
  } else {
    fotoPreview.removeAttribute("src");
    fotoPreview.classList.add("hidden");
    fotoPlaceholder.classList.remove("hidden");
    fotoPlaceholder.classList.add("flex");
  }

  removerFotoBtn.classList.toggle("hidden", !url);
  textoFoto.textContent = url ? "trocar a foto" : "adicionar uma foto";
}

fotoPreview.addEventListener("error", function () {
  // arquivo escolhido com extensão de imagem, mas que não abre como imagem
  if (alteracaoFoto instanceof File) {
    mostrarErro("foto", "Não foi possível abrir essa imagem. Escolha outro arquivo.");
    alteracaoFoto = null;
    fotoInput.value = "";
    mostrarFotoNoFormulario(urlDaFoto(usuarioAtual.foto_perfil)); // volta para a foto atual
    return;
  }

  mostrarFotoNoFormulario(null);
});

fotoInput.addEventListener("change", function () {
  const arquivo = fotoInput.files[0];
  limparErro("foto");

  if (!arquivo) {
    return;
  }

  if (!TIPOS_FOTO.includes(arquivo.type)) {
    mostrarErro("foto", "Escolha uma imagem JPG, PNG ou WEBP.");
    fotoInput.value = "";
    return;
  }

  if (arquivo.size > TAMANHO_MAX_FOTO) {
    mostrarErro("foto", "A imagem deve ter no máximo 5 MB.");
    fotoInput.value = "";
    return;
  }

  alteracaoFoto = arquivo;
  mostrarFotoNoFormulario(URL.createObjectURL(arquivo));
});

removerFotoBtn.addEventListener("click", function () {
  limparErro("foto");
  fotoInput.value = "";
  // se o usuário tinha foto salva, ela será apagada ao salvar; senão só desfaz a escolha
  alteracaoFoto = usuarioAtual.foto_perfil ? "remover" : null;
  mostrarFotoNoFormulario(null);
});

// envia a nova foto (PUT) ou remove a atual (DELETE); devolve a resposta da API
function salvarFoto() {
  if (alteracaoFoto === "remover") {
    return fetchAutenticado("/usuarios/me/foto", { method: "DELETE" });
  }

  return fetchAutenticado("/usuarios/me/foto", {
    method: "PUT",
    headers: { "Content-Type": alteracaoFoto.type },
    body: alteracaoFoto // o próprio arquivo, em binário (sem base64)
  });
}


// ABRIR / CANCELAR FORMULÁRIOS
document.getElementById("botaoEditar").addEventListener("click", function () {
  esconderAviso();
  limparErrosDoFormulario(formEditar);
  alteracaoFoto = null;
  fotoInput.value = "";
  mostrarFotoNoFormulario(urlDaFoto(usuarioAtual.foto_perfil));
  nomeInput.value = usuarioAtual.nome;
  celularInput.value = formatarTelefone(usuarioAtual.telefone);
  emailSomenteLeitura.value = usuarioAtual.email;
  mostrarModo(formEditar);
  nomeInput.focus();
});

document.getElementById("botaoAlterarSenha").addEventListener("click", function () {
  esconderAviso();
  limparErrosDoFormulario(formSenha);
  formSenha.reset();
  mostrarModo(formSenha);
  senhaAtualInput.focus();
});

document.querySelectorAll(".botao-cancelar").forEach(function (botao) {
  botao.addEventListener("click", function () {
    mostrarModo(modoVisualizacao);
  });
});

celularInput.addEventListener("input", function () {
  celularInput.value = formatarTelefone(celularInput.value);
});


// EDITAR PERFIL: PATCH /api/usuarios/me
// só nome e telefone são enviados; o servidor decide quem é o usuário pelo token
formEditar.addEventListener("submit", async function (event) {
  event.preventDefault();
  limparErrosDoFormulario(formEditar);

  const nome = nomeInput.value.trim();
  const telefone = celularInput.value.replace(/\D/g, "");

  let valido = true;

  if (nome.length < 3) {
    mostrarErro("nome", "Informe seu nome completo.");
    valido = false;
  }

  if (telefone.length < 10 || telefone.length > 11) {
    mostrarErro("celular", "Informe um celular válido com DDD.");
    valido = false;
  }

  if (!valido) {
    return;
  }

  travarFormulario(formEditar, true);

  try {
    const resposta = await fetchAutenticado("/usuarios/me", {
      method: "PATCH",
      body: JSON.stringify({ nome: nome, telefone: telefone })
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      mostrarErro("formEditar", dados.erro || "Não foi possível salvar as alterações.");
      return;
    }

    // a tela mostra o que o banco devolveu, não o que foi digitado
    preencherPerfil(dados.usuario);

    if (alteracaoFoto) {
      const respostaFoto = await salvarFoto();
      const dadosFoto = await respostaFoto.json();

      if (!respostaFoto.ok) {
        mostrarErro("foto", dadosFoto.erro || "Não foi possível salvar a foto.");
        mostrarErro("formEditar", "Nome e celular foram salvos, mas a foto não. Tente enviá-la novamente.");
        return;
      }

      alteracaoFoto = null;
      preencherPerfil(dadosFoto.usuario);
    }

    mostrarModo(modoVisualizacao);
    mostrarAviso("Perfil atualizado com sucesso!");

  } catch (erro) {
    if (!obterToken()) {
      return;
    }
    console.error("Erro ao salvar perfil:", erro);
    mostrarErro("formEditar", "Não foi possível conectar ao servidor. Tente novamente.");

  } finally {
    travarFormulario(formEditar, false);
  }
});


// ALTERAR SENHA: PATCH /api/usuarios/me/senha
formSenha.addEventListener("submit", async function (event) {
  event.preventDefault();
  limparErrosDoFormulario(formSenha);

  const senhaAtual = senhaAtualInput.value;
  const novaSenha = novaSenhaInput.value;
  const confirmarNovaSenha = confirmarNovaSenhaInput.value;

  let valido = true;

  if (senhaAtual === "") {
    mostrarErro("senhaAtual", "Informe sua senha atual.");
    valido = false;
  }

  if (novaSenha.length < 6) {
    mostrarErro("novaSenha", "A nova senha deve ter pelo menos 6 caracteres.");
    valido = false;
  }

  if (confirmarNovaSenha === "" || confirmarNovaSenha !== novaSenha) {
    mostrarErro("confirmarNovaSenha", "As senhas não conferem.");
    valido = false;
  }

  if (!valido) {
    return;
  }

  travarFormulario(formSenha, true);

  try {
    const resposta = await fetchAutenticado("/usuarios/me/senha", {
      method: "PATCH",
      body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha })
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      mostrarErro("formSenha", dados.erro || "Não foi possível alterar a senha.");
      return;
    }

    formSenha.reset();
    mostrarModo(modoVisualizacao);
    mostrarAviso("Senha alterada com sucesso!");

  } catch (erro) {
    if (!obterToken()) {
      return;
    }
    console.error("Erro ao alterar senha:", erro);
    mostrarErro("formSenha", "Não foi possível conectar ao servidor. Tente novamente.");

  } finally {
    travarFormulario(formSenha, false);
  }
});


carregarPerfil();
