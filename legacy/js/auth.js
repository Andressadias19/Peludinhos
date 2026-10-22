// FUNÇÕES DE AUTENTICAÇÃO COMPARTILHADAS
// Usado pelas páginas dentro de /pages que exigem login (perfil, mapa...).
// Carregue este arquivo ANTES do script da página:
//   <script src="../js/auth.js"></script>
//
// IMPORTANTE: isto só melhora a experiência (redireciona quem não está logado).
// A segurança de verdade está no backend (middleware autenticarToken).

const API_URL = "/api";
const LOGIN_URL = "../login.html";


function obterToken() {
  return localStorage.getItem("token");
}


// remove o token e volta para o login
function sair() {
  localStorage.removeItem("token");
  window.location.replace(LOGIN_URL);
}


// lê a data de expiração que vem dentro do JWT (sem validar a assinatura —
// quem valida é o servidor; aqui é só para não abrir a página com token vencido)
function tokenExpirado(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return !payload.exp || payload.exp * 1000 < Date.now();
  } catch (erro) {
    return true; // token malformado
  }
}


// chame no topo das páginas protegidas
function exigirLogin() {
  const token = obterToken();

  if (!token || tokenExpirado(token)) {
    sair();
    return false;
  }

  return true;
}


// fetch que já envia "Authorization: Bearer TOKEN".
// Se o servidor responder 401 (token inválido/expirado), faz logout automaticamente.
// Erros de conexão NÃO fazem logout: a exceção sobe para a página tratar.
async function fetchAutenticado(caminho, opcoes = {}) {
  const token = obterToken();

  if (!token) {
    sair();
    throw new Error("Sem token");
  }

  const headers = Object.assign({}, opcoes.headers, {
    Authorization: `Bearer ${token}`
  });

  if (opcoes.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const resposta = await fetch(API_URL + caminho, Object.assign({}, opcoes, { headers }));

  if (resposta.status === 401) {
    sair();
    throw new Error("Sessão expirada");
  }

  return resposta;
}
