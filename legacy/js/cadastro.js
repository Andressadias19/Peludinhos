console.log("JavaScript do cadastro carregado!");


// ELEMENTOS DA PÁGINA
const cadastroForm = document.getElementById("cadastroForm");
const nomeInput = document.getElementById("nome");
const emailInput = document.getElementById("email");
const celularInput = document.getElementById("celular");
const senhaInput = document.getElementById("senha");
const confirmarSenhaInput = document.getElementById("confirmarSenha");

const fotoInput = document.getElementById("foto");
const fotoPreview = document.getElementById("fotoPreview");
const fotoPlaceholder = document.getElementById("fotoPlaceholder");
const removerFotoBtn = document.getElementById("removerFoto");

const TAMANHO_MAX_FOTO = 5 * 1024 * 1024; // 5 MB


// FUNÇÃO DE VER E DESVER SENHA (funciona para os dois campos de senha)
// cada "olho" tem data-target com o id do input que ele controla
document.querySelectorAll(".toggle-senha").forEach(function (toggle) {
  toggle.addEventListener("click", function () {
    const input = document.getElementById(toggle.dataset.target);
    if (input.type === "password") {
      input.type = "text";
    } else {
      input.type = "password";
    }
  });
});


// FOTO DE PERFIL (OPCIONAL)
// quando o usuário escolhe um arquivo, mostramos a pré-visualização dentro do círculo
fotoInput.addEventListener("change", function () {
  const arquivo = fotoInput.files[0];
  limparErro("foto");

  if (!arquivo) {
    return;
  }

  if (!arquivo.type.startsWith("image/")) {
    mostrarErro("foto", "Escolha um arquivo de imagem (JPG, PNG...).");
    removerFoto();
    return;
  }

  if (arquivo.size > TAMANHO_MAX_FOTO) {
    mostrarErro("foto", "A imagem deve ter no máximo 5 MB.");
    removerFoto();
    return;
  }

  const leitor = new FileReader(); // lê o arquivo e transforma em uma URL que a <img> consegue exibir
  leitor.onload = function (evento) {
    fotoPreview.src = evento.target.result;
    fotoPreview.classList.remove("hidden");
    fotoPlaceholder.classList.add("hidden");
    fotoPlaceholder.classList.remove("flex");
    removerFotoBtn.classList.remove("hidden");
  };
  leitor.readAsDataURL(arquivo);
});

removerFotoBtn.addEventListener("click", function () {
  removerFoto();
  limparErro("foto");
});

function removerFoto() {
  fotoInput.value = ""; // limpa o arquivo escolhido
  fotoPreview.src = "";
  fotoPreview.classList.add("hidden");
  fotoPlaceholder.classList.remove("hidden");
  fotoPlaceholder.classList.add("flex");
  removerFotoBtn.classList.add("hidden");
}


// MÁSCARA DO CELULAR: transforma "11987654321" em "(11) 98765-4321" enquanto digita
celularInput.addEventListener("input", function () {
  let numeros = celularInput.value.replace(/\D/g, "").slice(0, 11); // deixa só os dígitos, no máximo 11

  if (numeros.length > 10) {
    numeros = numeros.replace(/^(\d{2})(\d{5})(\d{0,4})$/, "($1) $2-$3");
  } else if (numeros.length > 6) {
    numeros = numeros.replace(/^(\d{2})(\d{4})(\d{0,4})$/, "($1) $2-$3");
  } else if (numeros.length > 2) {
    numeros = numeros.replace(/^(\d{2})(\d{0,5})$/, "($1) $2");
  } else if (numeros.length > 0) {
    numeros = numeros.replace(/^(\d{0,2})$/, "($1");
  }

  celularInput.value = numeros;
});


// MENSAGENS DE ERRO
// cada campo tem um <p id="erro-NOMEDOCAMPO"> logo abaixo dele
function mostrarErro(campo, mensagem) {
  const erro = document.getElementById("erro-" + campo);
  erro.textContent = mensagem;
  erro.classList.remove("hidden");

  const input = document.getElementById(campo);
  if (input.type !== "file") {
    input.classList.add("input-erro");
  }
}

function limparErro(campo) {
  const erro = document.getElementById("erro-" + campo);
  erro.textContent = "";
  erro.classList.add("hidden");
  document.getElementById(campo).classList.remove("input-erro");
}

// quando o usuário volta a digitar num campo com erro, o erro some
[nomeInput, emailInput, celularInput, senhaInput, confirmarSenhaInput].forEach(function (input) {
  input.addEventListener("input", function () {
    limparErro(input.id);
  });
});


// VALIDAÇÃO E ENVIO DO FORMULÁRIO
cadastroForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const nome = nomeInput.value.trim();
  const email = emailInput.value.trim();
  const celular = celularInput.value.replace(/\D/g, ""); // só os dígitos
  const senha = senhaInput.value;
  const confirmarSenha = confirmarSenhaInput.value;

  let valido = true;

  if (nome.length < 3) {
    mostrarErro("nome", "Informe seu nome completo.");
    valido = false;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    mostrarErro("email", "Informe um e-mail válido.");
    valido = false;
  }

  if (celular.length < 10 || celular.length > 11) {
    mostrarErro("celular", "Informe um celular válido com DDD.");
    valido = false;
  }

  if (senha.length < 6) {
    mostrarErro("senha", "A senha deve ter pelo menos 6 caracteres.");
    valido = false;
  }

  if (confirmarSenha === "" || confirmarSenha !== senha) {
    mostrarErro("confirmarSenha", "As senhas não conferem.");
    valido = false;
  }

  if (!valido) {
    return;
  }

try {
    const resposta = await fetch("/api/usuarios", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            nome: nome,
            email: email,
            telefone: celular,
            senha: senha
        })
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
        if (resposta.status === 409) {
            mostrarErro("email", dados.erro);
            return;
        }

        alert(dados.erro || "Não foi possível realizar o cadastro.");
        return;
    }

    alert("Cadastro realizado com sucesso! Faça login para continuar.");

    window.location.href = "../login.html";

} catch (erro) {
    console.error("Erro ao conectar com o servidor:", erro);

    alert("Não foi possível conectar ao servidor.");
}

});
