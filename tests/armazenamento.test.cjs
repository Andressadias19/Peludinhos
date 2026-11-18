const { pastasDeUpload, bancoDeTeste } = require('./helpers/bancoLocal.cjs');
// Camada de armazenamento das fotos (server/storage): interface, driver local e compensação nos controllers.
// Os testes da interface usam pastas temporárias próprias. Os de compensação sobem um servidor real com pastas
// próprias dentro de tests/tmp e provocam falhas reais: no banco de testes (triggers temporários) e no disco.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../server/config/database');
const storage = require('../server/storage');
const { criarDriverLocal } = require('../server/storage/local');

const { criarArmazenamento, lerDriver, AREAS } = storage;
const raiz = path.join(__dirname, '..');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJkAAAAASUVORK5CYII=', 'base64');
const outroPng = Buffer.concat([png, Buffer.from('outro conteúdo')]);
const temporarias = [];
const marcador = `falha-simulada-${randomUUID()}`;
const usuarios = [];
let servidor, base;
let pastasDoServidor;

function pastaTemporaria(prefixo = 'peludinhos-armazenamento-') {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
    temporarias.push(pasta);
    return pasta;
}
// Armazenamento com driver local em pastas temporárias; sistemaDeArquivos permite simular falhas do disco.
function novoArmazenamento(sistemaDeArquivos) {
    const pasta = pastaTemporaria();
    const pastas = { publica: path.join(pasta, 'publica'), privada: path.join(pasta, 'privada') };
    const driver = criarDriverLocal(pastas, sistemaDeArquivos ? { sistemaDeArquivos } : {});
    return { armazenamento: criarArmazenamento({}, { driver }), pastas, pasta };
}
const codigo = esperado => erro => { assert.equal(erro.codigo, esperado, erro.message); return true; };
const nome = (prefixo = 'animal') => `${prefixo}-${randomUUID()}.png`;
const lerStream = async stream => { const partes = []; for await (const parte of stream) partes.push(parte); return Buffer.concat(partes); };
const listar = pasta => (fs.existsSync(pasta) ? fs.readdirSync(pasta).sort() : []);
function capturarErros() {
    const original = console.error;
    const registros = [];
    console.error = (...args) => registros.push(args.map(String).join(' '));
    return { registros, restaurar: () => { console.error = original; } };
}

after(async () => {
    servidor?.kill();
    for (const pasta of temporarias) fs.rmSync(pasta, { recursive: true, force: true });
    if (pastasDoServidor) fs.rmSync(pastasDoServidor.raiz, { recursive: true, force: true });
    await pool.query('DROP TRIGGER IF EXISTS falha_simulada_armazenamento ON animal').catch(() => {});
    await pool.query('DROP TRIGGER IF EXISTS falha_simulada_armazenamento ON publica_perda').catch(() => {});
    await pool.query('DROP TRIGGER IF EXISTS falha_simulada_armazenamento ON usuario').catch(() => {});
    await pool.query('DROP FUNCTION IF EXISTS falha_simulada_armazenamento()').catch(() => {});
    if (usuarios.length) {
        const ids = usuarios.map(usuario => usuario.id);
        await pool.query('DELETE FROM publica_perda WHERE id_usuario_tutor = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM animal WHERE id_usuario_cadastrador = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM usuario WHERE id_usuario = ANY($1::bigint[])', [ids]);
    }
    await pool.end();
});

// ---------------------------------------------------------------- seleção do driver

test('STORAGE_DRIVER: local é o padrão; supabase exige configuração; valores inválidos são recusados', () => {
    for (const valor of [undefined, '', '  ', 'local', ' LOCAL ']) assert.equal(lerDriver({ STORAGE_DRIVER: valor }), 'local', String(valor));
    for (const valor of ['supabase', ' SUPABASE ']) assert.equal(lerDriver({ STORAGE_DRIVER: valor }), 'supabase', valor);
    for (const valor of ['s3', 'disco', 'local,supabase', '*']) {
        assert.throws(() => lerDriver({ STORAGE_DRIVER: valor }), /Configuração do armazenamento inválida: STORAGE_DRIVER deve ser local ou supabase/, valor);
    }
    // Sem as variáveis SUPABASE_*, o modo supabase é recusado (os detalhes estão em tests/armazenamento-supabase.test.cjs).
    assert.throws(() => criarArmazenamento({ STORAGE_DRIVER: 'supabase' }), /Configuração do armazenamento inválida: Defina SUPABASE_URL/);
    const local = criarArmazenamento({ UPLOADS_DIR: 'fotos-a', UPLOADS_PRIVATE_DIR: 'fotos-b' });
    assert.equal(local.driver, 'local');
    assert.deepEqual(local.descrever(), { driver: 'local', publica: path.join(raiz, 'fotos-a'), privada: path.join(raiz, 'fotos-b') });
    // Reaproveita uploadsConfig: padrões e recusa de pastas sobrepostas.
    assert.deepEqual(criarArmazenamento({}).descrever(), { driver: 'local', publica: path.join(raiz, 'server', 'uploads'), privada: path.join(raiz, 'server', 'uploads-perdidos') });
    assert.throws(() => criarArmazenamento({ UPLOADS_DIR: 'fotos', UPLOADS_PRIVATE_DIR: 'fotos/privadas' }), /Configuração das pastas de fotos inválida/);
});

test('a aplicação não inicia com STORAGE_DRIVER inválido ou com o modo supabase sem configuração', () => {
    // Processo sem o ambiente de testes (env mínimo): é a aplicação, não o bloqueio dos testes, que recusa.
    const banco = { DB_HOST: 'localhost', DB_PORT: '5432', DB_USER: 'qualquer', DB_PASSWORD: 'qualquer', DB_NAME: 'nenhum_test' };
    for (const [valor, mensagem] of [['supabase', /Defina SUPABASE_URL.*Defina SUPABASE_SERVICE_ROLE_KEY/], ['nuvem', /deve ser local ou supabase/]]) {
        const resultado = spawnSync(process.execPath, ['-e', "require('./server/app')"], { cwd: raiz, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...banco, STORAGE_DRIVER: valor }, encoding: 'utf8' });
        assert.notEqual(resultado.status, 0);
        assert.match(resultado.stderr, /Configuração do armazenamento inválida/);
        assert.match(resultado.stderr, mensagem);
    }
});

// ---------------------------------------------------------------- interface e driver local

test('grava, confere, lê (inteiro e por stream) e exclui arquivos públicos e privados', async () => {
    const { armazenamento, pastas } = novoArmazenamento();
    const publico = nome('animal');
    const privado = nome('perda');

    assert.deepEqual(await armazenamento.salvar(AREAS.PUBLICA, publico, png), { area: 'publica', nome: publico, referencia: `/uploads/${publico}` });
    assert.deepEqual(await armazenamento.salvar(AREAS.PRIVADA, privado, outroPng), { area: 'privada', nome: privado, referencia: privado });

    assert.equal(await armazenamento.existe(AREAS.PUBLICA, publico), true);
    assert.deepEqual(await armazenamento.ler(AREAS.PUBLICA, publico), png);
    const arquivo = await armazenamento.abrirLeitura(AREAS.PRIVADA, privado);
    assert.equal(arquivo.tamanho, outroPng.length);
    assert.equal(arquivo.tipo, 'image/png');
    assert.deepEqual(await lerStream(arquivo.stream), outroPng);
    assert.equal(armazenamento.referencia(AREAS.PUBLICA, publico), `/uploads/${publico}`);

    // Separação: cada arquivo só existe na pasta da sua área.
    assert.deepEqual(listar(pastas.publica), [publico]);
    assert.deepEqual(listar(pastas.privada), [privado]);
    assert.equal(await armazenamento.existe(AREAS.PRIVADA, publico), false);
    assert.equal(await armazenamento.existe(AREAS.PUBLICA, privado), false);
    await assert.rejects(armazenamento.ler(AREAS.PUBLICA, privado), codigo('ARQUIVO_NAO_ENCONTRADO'));

    assert.equal(await armazenamento.excluir(AREAS.PUBLICA, publico), true);
    assert.equal(await armazenamento.excluir(AREAS.PRIVADA, privado), true);
    assert.deepEqual([listar(pastas.publica), listar(pastas.privada)], [[], []]);
});

test('arquivo inexistente: existe é false, leitura falha com ARQUIVO_NAO_ENCONTRADO e exclusão devolve false', async () => {
    const { armazenamento } = novoArmazenamento();
    const ausente = nome();
    assert.equal(await armazenamento.existe(AREAS.PUBLICA, ausente), false);
    await assert.rejects(armazenamento.ler(AREAS.PUBLICA, ausente), codigo('ARQUIVO_NAO_ENCONTRADO'));
    await assert.rejects(armazenamento.abrirLeitura(AREAS.PRIVADA, ausente), codigo('ARQUIVO_NAO_ENCONTRADO'));
    assert.equal(await armazenamento.excluir(AREAS.PUBLICA, ausente), false);
    const erros = capturarErros();
    try { assert.equal(await armazenamento.descartar(AREAS.PUBLICA, ausente), false); } finally { erros.restaurar(); }
    assert.deepEqual(erros.registros, [], 'arquivo que já não existe não é erro');
});

test('nunca sobrescreve: o segundo salvar com o mesmo nome falha e o conteúdo original fica intacto', async () => {
    const { armazenamento, pastas } = novoArmazenamento();
    const repetido = nome();
    await armazenamento.salvar(AREAS.PUBLICA, repetido, png);
    await assert.rejects(armazenamento.salvar(AREAS.PUBLICA, repetido, outroPng), codigo('ARQUIVO_JA_EXISTE'));
    assert.deepEqual(fs.readFileSync(path.join(pastas.publica, repetido)), png);
    // O mesmo nome na outra área é outro arquivo.
    await armazenamento.salvar(AREAS.PRIVADA, repetido, outroPng);
    assert.deepEqual(await armazenamento.ler(AREAS.PUBLICA, repetido), png);
    assert.deepEqual(await armazenamento.ler(AREAS.PRIVADA, repetido), outroPng);
});

test('nomes inválidos e tentativas de path traversal são recusados em todas as operações, sem tocar no disco', async () => {
    const { armazenamento, pastas, pasta } = novoArmazenamento();
    // Arquivo fora das áreas que um path traversal tentaria alcançar.
    const alvo = path.join(pasta, 'animal-alvo.png');
    fs.writeFileSync(alvo, png);
    const invalidos = ['../animal-alvo.png', '..\\animal-alvo.png', '../../animal-alvo.png', 'publica/../animal-alvo.png', '%2e%2e%2fanimal-alvo.png',
        'sub/animal-1.png', 'sub\\animal-1.png', '/etc/animal-1.png', 'C:\\animal-1.png', alvo, '.animal-1.png', 'animal-1.png\0', 'animal-1.png ',
        'Animal-1.png', 'animal-1.PNG', 'animal-1.js', 'animal-1.png.js', 'animal-1.svg', 'animal.png', 'animal-1', '-1.png', 'animal--1.png',
        `animal-${'a'.repeat(200)}.png`, '', null, undefined, 42, {}, ['animal-1.png']];
    for (const invalido of invalidos) {
        for (const operacao of [
            () => armazenamento.salvar(AREAS.PUBLICA, invalido, png), () => armazenamento.existe(AREAS.PUBLICA, invalido),
            () => armazenamento.ler(AREAS.PRIVADA, invalido), () => armazenamento.abrirLeitura(AREAS.PRIVADA, invalido),
            () => armazenamento.excluir(AREAS.PUBLICA, invalido)
        ]) await assert.rejects(operacao(), codigo('NOME_DE_ARQUIVO_INVALIDO'), String(invalido));
        assert.throws(() => armazenamento.referencia(AREAS.PUBLICA, invalido), codigo('NOME_DE_ARQUIVO_INVALIDO'));
    }
    // descartar nunca lança: com nome inválido, não apaga nada, devolve false e registra no log.
    const erros = capturarErros();
    try { assert.equal(await armazenamento.descartar(AREAS.PUBLICA, '../animal-alvo.png'), false); } finally { erros.restaurar(); }
    assert.equal(erros.registros.length, 1);
    for (const area of ['uploads', '../publica', 'PUBLICA', '', undefined]) {
        await assert.rejects(armazenamento.salvar(area, nome(), png), codigo('AREA_INVALIDA'), String(area));
        await assert.rejects(armazenamento.excluir(area, nome()), codigo('AREA_INVALIDA'), String(area));
    }
    assert.deepEqual(fs.readFileSync(alvo), png, 'o arquivo fora das áreas continua intacto');
    assert.deepEqual([listar(pastas.publica), listar(pastas.privada)], [[], []]);
    // Defesa em profundidade: o próprio driver também recusa caminhos que saem da pasta.
    const driver = criarDriverLocal(pastas);
    await assert.rejects(driver.excluir('publica', '../animal-alvo.png'), codigo('NOME_DE_ARQUIVO_INVALIDO'));
    await assert.rejects(driver.salvar('privada', '../../animal-alvo.png', png), codigo('NOME_DE_ARQUIVO_INVALIDO'));
    assert.ok(fs.existsSync(alvo));
});

test('referências do banco: só /uploads/<nome> na área pública e <nome> na privada viram nomes de arquivo', () => {
    const { nomeDaReferencia, referencia } = storage;
    assert.equal(nomeDaReferencia(AREAS.PUBLICA, '/uploads/animal-1.png'), 'animal-1.png');
    assert.equal(nomeDaReferencia(AREAS.PUBLICA, '/uploads/usuario-13-1700000000000.jpg'), 'usuario-13-1700000000000.jpg');
    assert.equal(nomeDaReferencia(AREAS.PRIVADA, 'perda-1.webp'), 'perda-1.webp');
    for (const valor of ['/uploads/../server.js', '/uploads/../uploads-perdidos/perda-1.png', '/uploads/sub/animal-1.png', '/uploads/%2e%2e/animal-1.png',
        'animal-1.png', 'uploads/animal-1.png', 'http://exemplo.com/uploads/animal-1.png', '/uploads/', '', null, undefined, 7]) {
        assert.equal(nomeDaReferencia(AREAS.PUBLICA, valor), null, String(valor));
    }
    for (const valor of ['/uploads/perda-1.png', '../perda-1.png', 'perda-1.png/', '', null]) assert.equal(nomeDaReferencia(AREAS.PRIVADA, valor), null, String(valor));
    assert.equal(referencia(AREAS.PRIVADA, 'perda-1.png'), 'perda-1.png');
    assert.throws(() => nomeDaReferencia('outra', '/uploads/animal-1.png'), codigo('AREA_INVALIDA'));
});

test('conteúdo inválido é recusado antes de criar qualquer arquivo', async () => {
    const { armazenamento, pastas } = novoArmazenamento();
    for (const conteudo of [Buffer.alloc(0), 'texto', null, undefined, new Uint8Array([1, 2])]) {
        await assert.rejects(armazenamento.salvar(AREAS.PUBLICA, nome(), conteudo), codigo('CONTEUDO_INVALIDO'));
    }
    assert.deepEqual(listar(pastas.publica), []);
});

test('falhas do disco: gravação interrompida não deixa arquivo pela metade; erros viram FALHA_NO_ARMAZENAMENTO', async () => {
    // Disco que aceita abrir o arquivo, mas falha ao escrever (como um disco cheio).
    const discoCheio = {
        ...fsp,
        open: async (arquivo, flags) => {
            const handle = await fsp.open(arquivo, flags);
            if (flags !== 'wx') return handle;
            return { writeFile: async () => { await handle.write(Buffer.from('meio')); throw Object.assign(new Error('sem espaço'), { code: 'ENOSPC' }); }, close: () => handle.close() };
        }
    };
    const cheio = novoArmazenamento(discoCheio);
    await assert.rejects(cheio.armazenamento.salvar(AREAS.PUBLICA, nome(), png), erro => erro.codigo === 'FALHA_NO_ARMAZENAMENTO' && erro.cause.code === 'ENOSPC');
    assert.deepEqual(listar(cheio.pastas.publica), [], 'o arquivo parcial foi removido');

    // Pasta da área ocupada por um arquivo: não é colisão de nomes, é falha do armazenamento.
    const bloqueado = novoArmazenamento();
    fs.mkdirSync(path.dirname(bloqueado.pastas.publica), { recursive: true });
    fs.writeFileSync(bloqueado.pastas.publica, 'não é uma pasta');
    await assert.rejects(bloqueado.armazenamento.salvar(AREAS.PUBLICA, nome(), png), codigo('FALHA_NO_ARMAZENAMENTO'));

    // Exclusão que falha: excluir lança; descartar registra no log e não interrompe.
    const semPermissao = novoArmazenamento({ ...fsp, unlink: async () => { throw Object.assign(new Error('acesso negado'), { code: 'EACCES' }); } });
    const protegido = nome();
    await semPermissao.armazenamento.salvar(AREAS.PUBLICA, protegido, png);
    await assert.rejects(semPermissao.armazenamento.excluir(AREAS.PUBLICA, protegido), erro => erro.codigo === 'FALHA_NO_ARMAZENAMENTO' && erro.cause.code === 'EACCES');
    const erros = capturarErros();
    try { assert.equal(await semPermissao.armazenamento.descartar(AREAS.PUBLICA, protegido, 'Contexto do teste:'), false); } finally { erros.restaurar(); }
    assert.equal(erros.registros.length, 1);
    assert.match(erros.registros[0], /^Contexto do teste:/);
    assert.ok(fs.existsSync(path.join(semPermissao.pastas.publica, protegido)));

    // Leitura de algo que não é arquivo (uma pasta com nome de foto) não vira resposta: é "não encontrado".
    const pastaComNome = novoArmazenamento();
    fs.mkdirSync(path.join(pastaComNome.pastas.privada, 'perda-1.png'), { recursive: true });
    await assert.rejects(pastaComNome.armazenamento.abrirLeitura(AREAS.PRIVADA, 'perda-1.png'), codigo('ARQUIVO_NAO_ENCONTRADO'));
});

test('middleware público entrega só a área pública, com nosniff; a área privada não é alcançável por ele', async () => {
    const { armazenamento } = novoArmazenamento();
    const publico = nome('animal');
    const privado = nome('perda');
    await armazenamento.salvar(AREAS.PUBLICA, publico, png);
    await armazenamento.salvar(AREAS.PRIVADA, privado, png);
    const app = express();
    app.use('/uploads', armazenamento.middlewarePublico());
    app.use('/uploads', (req, res) => res.status(404).json({ erro: 'Arquivo não encontrado.' }));
    const http = app.listen(0, '127.0.0.1');
    await new Promise(resolve => http.once('listening', resolve));
    const url = caminho => fetch(`http://127.0.0.1:${http.address().port}${caminho}`);
    try {
        const foto = await url(`/uploads/${publico}`);
        assert.equal(foto.status, 200);
        assert.equal(foto.headers.get('content-type'), 'image/png');
        assert.equal(foto.headers.get('x-content-type-options'), 'nosniff');
        for (const caminho of [`/uploads/${privado}`, `/uploads/../privada/${privado}`, `/uploads/%2e%2e/privada/${privado}`, `/uploads/..%2fprivada%2f${privado}`]) {
            assert.equal((await url(caminho)).status, 404, caminho);
        }
    } finally { http.close(); }
});

test('isolamento preservado: a aplicação de teste usa o driver local nas pastas de teste, também no servidor filho', () => {
    assert.equal(storage.armazenamento.driver, 'local');
    assert.deepEqual(storage.armazenamento.descrever(), { driver: 'local', publica: pastasDeUpload.publica, privada: pastasDeUpload.privada });
    assert.equal(process.env.STORAGE_DRIVER, 'local');
    const filho = spawnSync(process.execPath, ['-e', "console.log(JSON.stringify(require('./server/storage').armazenamento.descrever()))"], { cwd: raiz, env: process.env, encoding: 'utf8' });
    assert.equal(filho.status, 0, filho.stderr);
    assert.deepEqual(JSON.parse(filho.stdout.trim().split('\n').at(-1)), { driver: 'local', publica: pastasDeUpload.publica, privada: pastasDeUpload.privada });
    // Variáveis conflitantes no servidor iniciado pelos testes: bloqueado antes de usar qualquer armazenamento.
    for (const [variaveis, motivo] of [[{ STORAGE_DRIVER: 'supabase' }, /STORAGE_DRIVER de testes precisa ser local/], [{ SUPABASE_URL: 'https://exemplo.supabase.co' }, /SUPABASE_URL/]]) {
        const bloqueado = spawnSync(process.execPath, ['server/server.js'], { cwd: raiz, env: { ...process.env, PORT: '0', ...variaveis }, encoding: 'utf8', timeout: 15000 });
        assert.notEqual(bloqueado.status, 0);
        assert.match(bloqueado.stderr, /Testes bloqueados/);
        assert.match(bloqueado.stderr, motivo);
    }
    // Shell com STORAGE_DRIVER e SUPABASE_* conflitantes: o carregamento do .env.test vence e anula.
    const conflito = spawnSync(process.execPath, ['-e', "require('./tests/helpers/bancoLocal.cjs'); console.log(JSON.stringify({ d: require('./server/storage').armazenamento.driver, s: process.env.SUPABASE_SERVICE_ROLE_KEY }))"],
        { cwd: raiz, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, STORAGE_DRIVER: 'supabase', SUPABASE_SERVICE_ROLE_KEY: 'chave-de-mentira' }, encoding: 'utf8' });
    assert.equal(conflito.status, 0, conflito.stderr);
    assert.deepEqual(JSON.parse(conflito.stdout.trim().split('\n').at(-1)), { d: 'local', s: '' });
});

// ---------------------------------------------------------------- compensação nos controllers (servidor real)

async function criarUsuario(rotulo) {
    const result = await pool.query(`INSERT INTO usuario (nome, email, senha_hash, telefone, tipo_usuario) VALUES ($1, $2, 'apenas-teste', '93991234567', 'usuario') RETURNING id_usuario`,
        [`Teste armazenamento ${rotulo}`, `${randomUUID()}@example.invalid`]);
    const usuario = { id: result.rows[0].id_usuario };
    usuario.token = jwt.sign({ id_usuario: usuario.id, tipo_usuario: 'usuario' }, process.env.JWT_SECRET, { expiresIn: '10m' });
    usuarios.push(usuario);
    return usuario;
}
const chamar = (usuario, url, opcoes = {}) => fetch(base + url, { ...opcoes, headers: { ...(usuario ? { Authorization: `Bearer ${usuario.token}` } : {}), ...opcoes.headers } });
function formulario(campos, foto) {
    const corpo = new FormData();
    for (const [chave, valor] of Object.entries(campos)) corpo.append(chave, valor);
    if (foto) corpo.append('foto', new Blob([foto], { type: 'image/png' }), 'foto.png');
    return corpo;
}
const animal = (campos = {}) => ({ nome: 'Animal armazenamento', especie: 'Gato', ...campos });
const perdido = (campos = {}) => ({ nome_animal: 'Perdido armazenamento', especie: 'Cachorro', local_desaparecimento: 'Praça', data_desaparecimento: '2025-01-15', ...campos });

before(async () => {
    // Pastas próprias deste servidor (dentro de tests/tmp, validadas pelo mesmo bloqueio dos testes).
    const raizDasPastas = path.join(path.dirname(pastasDeUpload.publica), `armazenamento-${randomUUID()}`);
    pastasDoServidor = { raiz: raizDasPastas, publica: path.join(raizDasPastas, 'publica'), privada: path.join(raizDasPastas, 'privada') };
    fs.mkdirSync(pastasDoServidor.publica, { recursive: true });
    fs.mkdirSync(pastasDoServidor.privada, { recursive: true });
    // Falha simulada no banco de testes, só para registros com o marcador: a transação falha depois de a foto ser gravada.
    await pool.query(`CREATE OR REPLACE FUNCTION falha_simulada_armazenamento() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'falha simulada pelo teste de armazenamento'; END $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER falha_simulada_armazenamento BEFORE INSERT OR UPDATE ON animal FOR EACH ROW
        WHEN (NEW.caracteristicas = '${marcador}') EXECUTE FUNCTION falha_simulada_armazenamento()`);
    await pool.query(`CREATE TRIGGER falha_simulada_armazenamento BEFORE INSERT ON publica_perda FOR EACH ROW
        WHEN (NEW.descricao = '${marcador}') EXECUTE FUNCTION falha_simulada_armazenamento()`);
    await pool.query(`CREATE TRIGGER falha_simulada_armazenamento BEFORE UPDATE OF foto_perfil ON usuario FOR EACH ROW
        WHEN (OLD.nome = '${marcador}') EXECUTE FUNCTION falha_simulada_armazenamento()`);

    const porta = await new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    base = `http://127.0.0.1:${porta}`;
    servidor = spawn(process.execPath, ['server/server.js'], { cwd: raiz, env: { ...process.env, PORT: String(porta), UPLOADS_DIR: pastasDoServidor.publica, UPLOADS_PRIVATE_DIR: pastasDoServidor.privada }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    servidor.log = '';
    servidor.stderr.on('data', parte => { servidor.log += parte; });
    await new Promise((resolve, reject) => {
        const limite = setTimeout(() => reject(new Error('Servidor não iniciou.')), 15000);
        servidor.stdout.on('data', parte => { if (String(parte).includes('Servidor rodando')) { clearTimeout(limite); resolve(); } });
        servidor.on('exit', codigoDeSaida => { clearTimeout(limite); reject(new Error(`Servidor encerrou: ${codigoDeSaida} ${servidor.log}`)); });
    });
});

test('o servidor de teste grava nas pastas configuradas, e o banco é o de testes', async () => {
    assert.equal((await pool.query('SELECT current_database() AS banco')).rows[0].banco, bancoDeTeste);
    const usuario = await criarUsuario('pastas');
    const criado = await chamar(usuario, '/api/animais', { method: 'POST', body: formulario(animal(), png) });
    assert.equal(criado.status, 201);
    const foto = (await criado.json()).animal.foto;
    assert.match(foto, /^\/uploads\/animal-[0-9a-f-]{36}\.png$/);
    assert.deepEqual(listar(pastasDoServidor.publica), [foto.slice('/uploads/'.length)]);
    assert.equal((await fetch(base + foto)).status, 200);
});

test('compensação: transação desfeita depois de gravar a foto remove a foto nova (animal, edição e perdido)', async () => {
    const usuario = await criarUsuario('compensacao');
    const antesPublica = listar(pastasDoServidor.publica);
    const antesPrivada = listar(pastasDoServidor.privada);

    const criar = await chamar(usuario, '/api/animais', { method: 'POST', body: formulario(animal({ caracteristicas: marcador }), png) });
    assert.equal(criar.status, 500);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM animal WHERE id_usuario_cadastrador = $1', [usuario.id])).rows[0].n, 0);
    assert.deepEqual(listar(pastasDoServidor.publica), antesPublica, 'a foto gravada antes da falha foi removida');

    // Edição: a foto antiga continua no disco e no banco; a nova é removida.
    const original = await (await chamar(usuario, '/api/animais', { method: 'POST', body: formulario(animal(), png) })).json();
    const fotoAntiga = original.animal.foto;
    const comFotoAntiga = listar(pastasDoServidor.publica);
    const editar = await chamar(usuario, `/api/animais/${original.animal.id_animal}`, { method: 'PUT', body: formulario(animal({ caracteristicas: marcador }), outroPng) });
    assert.equal(editar.status, 500);
    assert.equal((await pool.query('SELECT foto FROM animal WHERE id_animal = $1', [original.animal.id_animal])).rows[0].foto, fotoAntiga);
    assert.deepEqual(listar(pastasDoServidor.publica), comFotoAntiga);
    assert.equal((await fetch(base + fotoAntiga)).status, 200);

    // Desaparecimento (área pública, como animais e avistamentos).
    const antesDoPerdido = listar(pastasDoServidor.publica);
    const publicar = await chamar(usuario, '/api/perdidos', { method: 'POST', body: formulario(perdido({ descricao: marcador }), png) });
    assert.equal(publicar.status, 500);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM publica_perda WHERE id_usuario_tutor = $1', [usuario.id])).rows[0].n, 0);
    assert.deepEqual(listar(pastasDoServidor.publica), antesDoPerdido);
    assert.deepEqual(listar(pastasDoServidor.privada), antesPrivada);
});

test('compensação na foto de perfil: UPDATE que falha remove a foto nova e preserva a antiga', async () => {
    const usuario = await criarUsuario('perfil');
    const enviar = corpo => chamar(usuario, '/api/usuarios/me/foto', { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: corpo });
    const primeira = await enviar(png);
    assert.equal(primeira.status, 200);
    const fotoAntiga = (await primeira.json()).usuario.foto_perfil;
    // Foto de perfil é privada.
    assert.ok(listar(pastasDoServidor.privada).includes(fotoAntiga));
    const comFotoAntiga = listar(pastasDoServidor.privada);
    await pool.query('UPDATE usuario SET nome = $1 WHERE id_usuario = $2', [marcador, usuario.id]);
    assert.equal((await enviar(outroPng)).status, 500);
    assert.equal((await pool.query('SELECT foto_perfil FROM usuario WHERE id_usuario = $1', [usuario.id])).rows[0].foto_perfil, fotoAntiga);
    assert.deepEqual(listar(pastasDoServidor.privada), comFotoAntiga);
});

test('sem sobrescrita na foto de perfil: nome já ocupado faz a operação falhar sem alterar o arquivo existente nem o banco', async () => {
    // O nome da foto de perfil é previsível (usuario-<id>-<horário em ms>): ocupa todos os nomes de uma janela
    // de 300 ms um pouco no futuro, espera a janela começar e só então envia.
    const usuario = await criarUsuario('colisao');
    const inicio = Date.now() + 2000;
    const fim = inicio + 300;
    const ocupados = [];
    for (let instante = inicio; instante < fim; instante++) {
        const ocupado = `usuario-${usuario.id}-${instante}.png`;
        fs.writeFileSync(path.join(pastasDoServidor.privada, ocupado), 'arquivo existente');
        ocupados.push(ocupado);
    }
    assert.ok(Date.now() < inicio, 'os arquivos precisam estar prontos antes da janela começar');
    await new Promise(resolve => setTimeout(resolve, inicio - Date.now() + 5));
    const resposta = await chamar(usuario, '/api/usuarios/me/foto', { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png });
    assert.ok(Date.now() < fim, 'o envio precisa acontecer dentro da janela ocupada');
    assert.equal(resposta.status, 500);
    assert.equal((await pool.query('SELECT foto_perfil FROM usuario WHERE id_usuario = $1', [usuario.id])).rows[0].foto_perfil, null);
    assert.ok(ocupados.every(ocupado => fs.readFileSync(path.join(pastasDoServidor.privada, ocupado), 'utf8') === 'arquivo existente'), 'nenhum arquivo existente foi sobrescrito ou removido');
    for (const ocupado of ocupados) fs.rmSync(path.join(pastasDoServidor.privada, ocupado));
});

test('falha do armazenamento antes do banco: a transação é desfeita e nada é gravado', async () => {
    const usuario = await criarUsuario('disco');
    // A pasta privada deste servidor vira um arquivo: gravar a foto de perfil (privada) falha.
    fs.rmSync(pastasDoServidor.privada, { recursive: true, force: true });
    fs.writeFileSync(pastasDoServidor.privada, 'não é uma pasta');
    try {
        const enviar = await chamar(usuario, '/api/usuarios/me/foto', { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png });
        assert.equal(enviar.status, 500);
        assert.equal((await pool.query('SELECT foto_perfil FROM usuario WHERE id_usuario = $1', [usuario.id])).rows[0].foto_perfil, null);
        // A área pública não é afetada: um desaparecimento com foto continua sendo publicado.
        const publicar = await chamar(usuario, '/api/perdidos', { method: 'POST', body: formulario(perdido(), png) });
        assert.equal(publicar.status, 201);
    } finally {
        fs.rmSync(pastasDoServidor.privada, { force: true });
        fs.mkdirSync(pastasDoServidor.privada, { recursive: true });
    }
});

test('foto antiga que não pode ser apagada depois do COMMIT não desfaz a operação: o banco fica certo e o erro vai para o log', async () => {
    const usuario = await criarUsuario('pos-commit');
    const original = await (await chamar(usuario, '/api/animais', { method: 'POST', body: formulario(animal(), png) })).json();
    const nomeAntigo = original.animal.foto.slice('/uploads/'.length);
    // Troca o arquivo antigo por uma pasta com o mesmo nome: a exclusão falha de verdade.
    fs.rmSync(path.join(pastasDoServidor.publica, nomeAntigo));
    fs.mkdirSync(path.join(pastasDoServidor.publica, nomeAntigo));
    const logAntes = servidor.log.length;
    const editar = await chamar(usuario, `/api/animais/${original.animal.id_animal}`, { method: 'PUT', body: formulario(animal(), outroPng) });
    assert.equal(editar.status, 200);
    const novaFoto = (await editar.json()).animal.foto;
    assert.notEqual(novaFoto, original.animal.foto);
    assert.equal((await pool.query('SELECT foto FROM animal WHERE id_animal = $1', [original.animal.id_animal])).rows[0].foto, novaFoto);
    assert.equal((await fetch(base + novaFoto)).status, 200);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.match(servidor.log.slice(logAntes), /Foto antiga do animal não pôde ser removida/);
    fs.rmSync(path.join(pastasDoServidor.publica, nomeAntigo), { recursive: true });
});

test('política das áreas: desaparecimento na pública, sem login; foto de perfil na privada, só pela API autenticada', async () => {
    const tutor = await criarUsuario('privada');
    const outro = await criarUsuario('outro');
    // Desaparecimento: área pública, endereço /uploads, sem login.
    const publicado = await (await chamar(tutor, '/api/perdidos', { method: 'POST', body: formulario(perdido(), png) })).json();
    const [fotoPerdido] = (await pool.query('SELECT foto FROM publica_perda WHERE id_perda = $1', [publicado.perdido.id_perda])).rows.map(linha => linha.foto);
    assert.match(fotoPerdido, /^\/uploads\/perda-[0-9a-f-]{36}\.png$/);
    assert.ok(listar(pastasDoServidor.publica).includes(path.basename(fotoPerdido)));
    assert.ok(!listar(pastasDoServidor.privada).includes(path.basename(fotoPerdido)));
    assert.equal((await fetch(base + fotoPerdido)).status, 200);
    // Perfil: área privada, nunca em /uploads, só pela rota autenticada.
    const enviada = await (await chamar(tutor, '/api/usuarios/me/foto', { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png })).json();
    const arquivo = enviada.usuario.foto_perfil;
    assert.match(arquivo, /^usuario-\d+-\d+\.png$/);
    assert.ok(listar(pastasDoServidor.privada).includes(arquivo));
    assert.ok(!listar(pastasDoServidor.publica).includes(arquivo));
    for (const caminho of [`/uploads/${arquivo}`, `/uploads/../${path.basename(pastasDoServidor.privada)}/${arquivo}`]) assert.equal((await fetch(base + caminho)).status, 404);
    const rota = `/api/usuarios/${tutor.id}/foto`;
    assert.equal((await chamar(null, rota)).status, 401);
    assert.equal((await chamar(outro, rota)).status, 403);
    const foto = await chamar(tutor, rota);
    assert.equal(foto.status, 200);
    assert.equal(foto.headers.get('content-type'), 'image/png');
    assert.equal(foto.headers.get('cache-control'), 'private, no-store');
    assert.equal(foto.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(foto.headers.get('content-length'), String(png.length));
    assert.deepEqual(Buffer.from(await foto.arrayBuffer()), png);
    // Arquivo que sumiu do disco: 404 em JSON, ainda sem cache.
    fs.rmSync(path.join(pastasDoServidor.privada, arquivo));
    const sumiu = await chamar(tutor, rota);
    assert.equal(sumiu.status, 404);
    assert.match(sumiu.headers.get('content-type'), /application\/json/);
    assert.equal(sumiu.headers.get('cache-control'), 'private, no-store');
    assert.equal((await sumiu.json()).erro, 'Foto não encontrada.');
});
