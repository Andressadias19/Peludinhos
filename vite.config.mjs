import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Só variáveis com este prefixo entram no JavaScript do navegador (import.meta.env); todas ficam públicas.
const PUBLIC_PREFIX = 'VITE_';
const SECRET_NAME = /SECRET|SENHA|PASSWORD|TOKEN|KEY|DATABASE|JWT|SERVICE_ROLE/i;

// Interrompe o build se uma variável pública parecer um segredo ou se a URL da API estiver malformada.
export function validatePublicEnv(env) {
  const errors = [];
  for (const name of Object.keys(env).filter(key => key.startsWith(PUBLIC_PREFIX))) {
    if (SECRET_NAME.test(name)) errors.push(`${name} parece um segredo e seria publicado no frontend; use uma variável sem o prefixo ${PUBLIC_PREFIX}.`);
  }
  const apiUrl = String(env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
  if (apiUrl) {
    let url;
    try { url = new URL(apiUrl); } catch { errors.push('VITE_API_URL deve ser uma URL completa, como https://api.exemplo.com.'); }
    if (url && !['http:', 'https:'].includes(url.protocol)) errors.push('VITE_API_URL deve usar http:// ou https://.');
    if (url && /\/api$/i.test(url.pathname)) errors.push('VITE_API_URL é a URL do backend sem o /api final (o frontend acrescenta /api).');
    if (url && (url.search || url.hash)) errors.push('VITE_API_URL não pode ter parâmetros (?) nem âncora (#).');
  }
  if (errors.length) throw new Error(`Configuração do frontend inválida:\n- ${errors.join('\n- ')}`);
}

export default defineConfig(({ mode }) => {
  // Lido aqui só para configurar o build e o proxy; nada disso vai para o navegador, exceto VITE_*.
  const env = loadEnv(mode, process.cwd(), '');
  validatePublicEnv(env);
  // Proxy de desenvolvimento (npm run dev e npm run preview): usado quando VITE_API_URL está vazia.
  const backend = `http://127.0.0.1:${env.PORT || 3001}`;
  return {
    plugins: [react(), tailwindcss()],
    publicDir: 'public',
    envPrefix: PUBLIC_PREFIX,
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': backend, '/uploads': backend } },
  };
});
