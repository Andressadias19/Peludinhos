export async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof Blob) && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  // Conta desativada depois do login: o token deixa de valer e a sessão é encerrada como se tivesse expirado.
  if ((response.status === 401 || data.codigo === 'CONTA_DESATIVADA') && path !== '/login') {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('session-expired'));
  }
  if (!response.ok) throw Object.assign(new Error(data.erro || 'Não foi possível concluir a operação.'), { status: response.status });
  return data;
}

// Para arquivos protegidos (ex.: fotos de animais perdidos): a tag <img> não envia o token.
export async function apiBlob(path, options = {}) {
  const token = localStorage.getItem('token');
  const response = await fetch(`/api${path}`, { ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  if (response.status === 401) {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('session-expired'));
  }
  if (!response.ok) throw new Error('Não foi possível carregar o arquivo.');
  return response.blob();
}

export function hasSession() {
  try {
    const token = localStorage.getItem('token');
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp * 1000 > Date.now();
  } catch { return false; }
}
