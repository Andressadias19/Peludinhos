// Testa src/api.js como o Vite o entrega (import.meta.env resolvido), com e sem VITE_API_URL.
// Não acessa banco nem backend: fetch, localStorage e window são substituídos por versões de teste.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, build } from 'vite';
import dotenv from 'dotenv';
import { validatePublicEnv } from '../vite.config.mjs';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = 'https://peludinhos-api.example.com';
const servidores = [];

// Carrega o módulo real com uma VITE_API_URL específica (o Vite lê VITE_* de process.env).
async function carregarApi(apiUrl) {
    const anterior = process.env.VITE_API_URL;
    if (apiUrl === undefined) delete process.env.VITE_API_URL; else process.env.VITE_API_URL = apiUrl;
    try {
        const servidor = await createServer({ root: raiz, configFile: path.join(raiz, 'vite.config.mjs'), logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } });
        servidores.push(servidor);
        return await servidor.ssrLoadModule('/src/api.js');
    } finally {
        if (anterior === undefined) delete process.env.VITE_API_URL; else process.env.VITE_API_URL = anterior;
    }
}

// Ambiente de navegador mínimo: registra as chamadas a fetch e os eventos disparados.
function navegador({ token, resposta = () => Response.json({ ok: true }) } = {}) {
    const armazenamento = new Map(token ? [['token', token]] : []);
    const chamadas = [];
    const eventos = [];
    globalThis.localStorage = { getItem: k => armazenamento.get(k) ?? null, setItem: (k, v) => armazenamento.set(k, v), removeItem: k => armazenamento.delete(k) };
    globalThis.window = { dispatchEvent: evento => eventos.push(evento.type) };
    globalThis.fetch = async (url, opcoes) => { chamadas.push({ url, opcoes }); return resposta(url, opcoes); };
    return { chamadas, eventos, armazenamento };
}

after(async () => {
    for (const servidor of servidores) await servidor.close();
    delete globalThis.localStorage; delete globalThis.window;
});

test('normalizeBaseUrl, apiUrl e mediaUrl resolvem URLs relativas, absolutas e barras finais', async () => {
    const { normalizeBaseUrl, apiUrl, mediaUrl } = await carregarApi(undefined);
    for (const vazio of [undefined, null, '', '   ']) assert.equal(normalizeBaseUrl(vazio), '');
    assert.equal(normalizeBaseUrl(`${backend}/`), backend);
    assert.equal(normalizeBaseUrl(` ${backend}/// `), backend);
    assert.equal(normalizeBaseUrl('https://exemplo.com/servicos/peludinhos/'), 'https://exemplo.com/servicos/peludinhos');

    assert.equal(apiUrl('/animais', ''), '/api/animais');
    assert.equal(apiUrl('/animais?q=bob&offset=0', backend), `${backend}/api/animais?q=bob&offset=0`);
    assert.equal(apiUrl('/login', 'https://exemplo.com/servicos/peludinhos'), 'https://exemplo.com/servicos/peludinhos/api/login');

    // Imagens públicas do backend.
    assert.equal(mediaUrl('/uploads/animal-1.png', ''), '/uploads/animal-1.png');
    assert.equal(mediaUrl('/uploads/animal-1.png', backend), `${backend}/uploads/animal-1.png`);
    // Ausentes continuam ausentes, para o placeholder das telas (valor || '/assets/...').
    for (const ausente of [null, undefined, '']) assert.equal(mediaUrl(ausente, backend), ausente);
    // Outros valores não mudam: absolutos, blob: das pré-visualizações, data:, /assets do frontend e caminhos parecidos.
    for (const valor of ['https://cdn.exemplo.com/a.png', 'http://localhost:3001/uploads/a.png', 'blob:http://127.0.0.1:4173/1f2e3d', 'data:image/png;base64,AAAA',
        '/assets/icons/peludinhos.svg', 'uploads/a.png', '/uploadsx/a.png', '/api/perdidos/55/foto']) {
        assert.equal(mediaUrl(valor, backend), valor, valor);
    }
});

test('sem VITE_API_URL: caminhos relativos, como antes (proxy do Vite ou npm run start:full)', async () => {
    const modulo = await carregarApi(undefined);
    assert.equal(modulo.API_BASE_URL, '');
    assert.equal(modulo.mediaUrl('/uploads/usuario-13-1.png'), '/uploads/usuario-13-1.png');
    const { chamadas } = navegador({ token: 'token-teste' });
    await modulo.api('/usuarios/me');
    await modulo.apiBlob('/perdidos/55/foto', { cache: 'no-store' });
    assert.deepEqual(chamadas.map(c => c.url), ['/api/usuarios/me', '/api/perdidos/55/foto']);
});

test('com VITE_API_URL: chamadas e fotos públicas vão para o backend, com Authorization e os demais cabeçalhos', async () => {
    const modulo = await carregarApi(`${backend}/`);
    assert.equal(modulo.API_BASE_URL, backend);
    assert.equal(modulo.mediaUrl('/uploads/animal-1.png'), `${backend}/uploads/animal-1.png`);
    const { chamadas } = navegador({ token: 'token-teste' });

    await modulo.api('/usuarios/me');
    await modulo.api('/usuarios/me', { method: 'PATCH', body: JSON.stringify({ nome: 'Ana' }) });
    const formulario = new FormData(); formulario.append('especie', 'Gato');
    await modulo.api('/animais', { method: 'POST', body: formulario });
    const foto = new Blob(['png'], { type: 'image/png' });
    await modulo.api('/usuarios/me/foto', { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: foto });
    await modulo.api('/admin/animais/7', { method: 'DELETE', body: JSON.stringify({ confirmar: true }) });

    assert.deepEqual(chamadas.map(c => [c.opcoes.method ?? 'GET', c.url]), [
        ['GET', `${backend}/api/usuarios/me`], ['PATCH', `${backend}/api/usuarios/me`], ['POST', `${backend}/api/animais`],
        ['PUT', `${backend}/api/usuarios/me/foto`], ['DELETE', `${backend}/api/admin/animais/7`],
    ]);
    for (const { opcoes } of chamadas) assert.equal(opcoes.headers.Authorization, 'Bearer token-teste');
    assert.equal(chamadas[0].opcoes.headers['Content-Type'], undefined);
    assert.equal(chamadas[1].opcoes.headers['Content-Type'], 'application/json');
    assert.equal(chamadas[1].opcoes.body, JSON.stringify({ nome: 'Ana' }));
    // FormData: o navegador define multipart com o boundary; o api.js não pode sobrescrever.
    assert.equal(chamadas[2].opcoes.headers['Content-Type'], undefined);
    assert.equal(chamadas[2].opcoes.body, formulario);
    assert.equal(chamadas[3].opcoes.headers['Content-Type'], 'image/png');
    assert.equal(chamadas[3].opcoes.body, foto);
    assert.equal(chamadas[4].opcoes.headers['Content-Type'], 'application/json');
});

test('foto de perfil (privada) passa pelo apiBlob autenticado, nunca por mediaUrl; desaparecimentos usam o endereço público', async () => {
    const modulo = await carregarApi(backend);
    const { chamadas } = navegador({ token: 'token-teste', resposta: () => new Response(new Blob(['img'], { type: 'image/png' })) });
    const blob = await modulo.apiBlob('/usuarios/13/foto', { cache: 'no-store' });
    assert.equal(blob.type, 'image/png');
    assert.equal(chamadas[0].url, `${backend}/api/usuarios/13/foto`);
    assert.equal(chamadas[0].opcoes.headers.Authorization, 'Bearer token-teste');
    assert.equal(chamadas[0].opcoes.cache, 'no-store');
    // O endereço privado não é tratado como imagem pública; o público recebe o endereço do backend.
    assert.equal(modulo.mediaUrl('/api/usuarios/13/foto'), '/api/usuarios/13/foto');
    assert.equal(modulo.mediaUrl('/uploads/perda-1.png'), `${backend}/uploads/perda-1.png`);
    const fonte = arquivo => fs.readFileSync(path.join(raiz, 'src', ...arquivo.split('/')), 'utf8');
    const protegida = fonte('components/FotoProtegida.jsx');
    assert.match(protegida, /apiBlob\(caminho/);
    assert.match(protegida, /URL\.createObjectURL\(blob\)/);
    assert.match(protegida, /URL\.revokeObjectURL\(url\)/);
    for (const arquivo of ['pages/Profile.jsx', 'components/admin/AdminUI.jsx']) {
        assert.match(fonte(arquivo), /<FotoProtegida caminho=\{`\/usuarios\/\$\{user\.id_usuario\}\/foto`\}/, arquivo);
        assert.doesNotMatch(fonte(arquivo), /mediaUrl\(user\.foto_perfil\)/, arquivo);
    }
    const perdido = fonte('components/FotoPerdido.jsx');
    assert.match(perdido, /mediaUrl\(foto\)/);
    assert.match(perdido, /caminho=\{`\/perdidos\/\$\{id\}\/foto`\}/, 'publicações antigas continuam pela API');
});

test('sem token não envia Authorization; erros e sessão expirada continuam tratados como antes', async () => {
    const modulo = await carregarApi(backend);
    let ambiente = navegador();
    await modulo.api('/animais');
    assert.equal(ambiente.chamadas[0].opcoes.headers.Authorization, undefined);

    ambiente = navegador({ token: 'velho', resposta: () => Response.json({ erro: 'Token inválido ou expirado.' }, { status: 401 }) });
    await assert.rejects(modulo.api('/usuarios/me'), error => error.status === 401 && error.message === 'Token inválido ou expirado.');
    assert.equal(ambiente.armazenamento.has('token'), false);
    assert.deepEqual(ambiente.eventos, ['session-expired']);

    ambiente = navegador({ token: 'desativada', resposta: () => Response.json({ erro: 'Esta conta está desativada.', codigo: 'CONTA_DESATIVADA' }, { status: 403 }) });
    await assert.rejects(modulo.api('/animais'), error => error.status === 403);
    assert.equal(ambiente.armazenamento.has('token'), false);
    assert.deepEqual(ambiente.eventos, ['session-expired']);

    // Login errado não encerra sessão nem dispara o evento.
    ambiente = navegador({ resposta: () => Response.json({ erro: 'E-mail ou senha incorretos.' }, { status: 401 }) });
    await assert.rejects(modulo.api('/login', { method: 'POST', body: '{}' }), /E-mail ou senha incorretos/);
    assert.deepEqual(ambiente.eventos, []);

    ambiente = navegador({ token: 'velho', resposta: () => new Response('', { status: 401 }) });
    await assert.rejects(modulo.apiBlob('/perdidos/55/foto'), /Não foi possível carregar o arquivo/);
    assert.deepEqual(ambiente.eventos, ['session-expired']);
});

test('o build recusa variáveis públicas com nome de segredo e VITE_API_URL malformada', () => {
    for (const [env, mensagem] of [
        [{ VITE_JWT_SECRET: 'x' }, /VITE_JWT_SECRET parece um segredo/],
        [{ VITE_DB_PASSWORD: 'x' }, /VITE_DB_PASSWORD parece um segredo/],
        [{ VITE_SUPABASE_SERVICE_ROLE_KEY: 'x' }, /VITE_SUPABASE_SERVICE_ROLE_KEY parece um segredo/],
        [{ VITE_DATABASE_URL: 'x' }, /VITE_DATABASE_URL parece um segredo/],
        [{ VITE_API_URL: `${backend}/api` }, /sem o \/api final/],
        [{ VITE_API_URL: `${backend}/api/` }, /sem o \/api final/],
        [{ VITE_API_URL: 'api.exemplo.com' }, /URL completa/],
        [{ VITE_API_URL: 'ftp://exemplo.com' }, /http:\/\/ ou https:\/\//],
        [{ VITE_API_URL: `${backend}?x=1` }, /parâmetros/],
    ]) assert.throws(() => validatePublicEnv(env), mensagem, JSON.stringify(env));
    for (const env of [{}, { VITE_API_URL: '' }, { VITE_API_URL: backend }, { VITE_API_URL: 'http://127.0.0.1:3001/' }, { DB_PASSWORD: 'fica-no-backend', JWT_SECRET: 'idem' }]) {
        assert.doesNotThrow(() => validatePublicEnv(env), JSON.stringify(env));
    }
});

test('frontend compilado com VITE_API_URL contém a URL do backend e nenhum segredo do .env', async () => {
    const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'peludinhos-build-'));
    const anterior = process.env.VITE_API_URL;
    process.env.VITE_API_URL = backend;
    try {
        await build({ root: raiz, configFile: path.join(raiz, 'vite.config.mjs'), logLevel: 'silent', build: { outDir: saida, emptyOutDir: true } });
    } finally {
        if (anterior === undefined) delete process.env.VITE_API_URL; else process.env.VITE_API_URL = anterior;
    }
    try {
        // Todo o código entregue ao navegador, inclusive subpastas (public/assets é copiado para assets/icons e assets/images).
        const arquivos = fs.readdirSync(saida, { recursive: true, withFileTypes: true })
            .filter(item => item.isFile() && /\.(html|js|css|map|json)$/.test(item.name))
            .map(item => path.join(item.parentPath, item.name));
        assert.ok(arquivos.some(arquivo => arquivo.endsWith('.js')) && arquivos.some(arquivo => arquivo.endsWith('index.html')));
        const conteudo = arquivos.map(arquivo => fs.readFileSync(arquivo, 'utf8')).join('\n');
        assert.ok(conteudo.includes(backend), 'a URL do backend deve estar no build');
        // Valores secretos do .env local (comparados aqui, nunca exibidos) e nomes das variáveis do backend.
        const envLocal = fs.existsSync(path.join(raiz, '.env')) ? dotenv.parse(fs.readFileSync(path.join(raiz, '.env'))) : {};
        for (const nome of ['DB_PASSWORD', 'JWT_SECRET', 'DATABASE_URL', 'DATABASE_SSL_CA']) {
            const valor = envLocal[nome];
            if (valor && valor.length >= 6) assert.equal(conteudo.includes(valor), false, `o valor de ${nome} não pode estar no build`);
            assert.equal(conteudo.includes(nome), false, `${nome} não pode estar no build`);
        }
        assert.equal(/BEGIN CERTIFICATE|postgres(ql)?:\/\//.test(conteudo), false);
    } finally { fs.rmSync(saida, { recursive: true, force: true }); }
});
