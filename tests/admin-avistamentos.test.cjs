const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const pool = require('../server/config/database');

const uploads = path.join(__dirname, '..', 'server', 'uploads');
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJkAAAAASUVORK5CYII=', 'base64');
const tag = randomUUID().slice(0, 8);
let server, base, animal;
const users = {};

function form(fields = {}, photo) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    if (photo) body.append('foto', new Blob([photo], { type: 'image/png' }), 'foto.png');
    return body;
}
const unidentified = (extra = {}) => ({ especie: 'Gato', latitude: '-2.44', longitude: '-54.70', observacao: `Relato ${tag}`, ...extra });
const call = (user, url, options = {}) => fetch(base + url, { ...options, headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...options.headers } });
const admin = (url, options) => call(users.admin, '/api/admin/avistamentos' + url, options);
const json = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const confirmDelete = id => admin(`/${id}`, { method: 'DELETE', ...json({ confirmar: true }) });
const row = async id => (await pool.query('SELECT * FROM avistamento WHERE id_avistamento = $1', [id])).rows[0];
const fileExists = foto => fs.access(path.join(uploads, path.basename(foto))).then(() => true, () => false);
async function createAs(user, fields, photo, url = '/api/avistamentos') {
    const response = await call(user, url, { method: 'POST', body: form(fields, photo) });
    assert.equal(response.status, 201);
    return (await response.json()).avistamento;
}
const adminCreate = (fields, photo) => createAs(users.admin, fields, photo, '/api/admin/avistamentos');
async function requestAssociation(sightingId) {
    const response = await call(users.comum, `/api/avistamentos/${sightingId}/solicitacoes-associacao`, {
        method: 'POST', ...json({ id_animal: String(animal.id_animal), justificativa: 'Mesma pelagem e mesma região do cadastro.' }) });
    assert.equal(response.status, 201);
}

before(async () => {
    const socket = net.createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['server/server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Servidor não iniciou.')), 15000);
        server.stdout.on('data', chunk => { if (String(chunk).includes('Servidor rodando')) { clearTimeout(timeout); resolve(); } });
        server.on('error', error => { clearTimeout(timeout); reject(error); });
        server.on('exit', code => { clearTimeout(timeout); reject(new Error(`Servidor encerrou: ${code}`)); });
    });
    for (const [key, tipo] of [['admin', 'administrador'], ['comum', 'usuario']]) {
        const result = await pool.query(`INSERT INTO usuario (nome,email,senha_hash,tipo_usuario) VALUES ($1,$2,$3,$4) RETURNING id_usuario`,
            [`Teste ${key} ${tag}`, `${randomUUID()}@example.invalid`, 'conta-apenas-para-teste', tipo]);
        const id = result.rows[0].id_usuario;
        users[key] = { id, token: jwt.sign({ id_usuario: id, tipo_usuario: tipo }, process.env.JWT_SECRET, { expiresIn: '10m' }) };
    }
    const created = await call(users.comum, '/api/animais', { method: 'POST', body: form({ nome: `Animal ${tag}`, especie: 'Cachorro', raca: 'SRD', cor: 'Caramelo' }) });
    animal = (await created.json()).animal;
    // Só animais validados recebem vínculos; a validação é simulada no banco.
    await pool.query(`UPDATE animal SET status_validacao = 'Validado' WHERE id_animal = $1`, [animal.id_animal]);
});

after(async () => {
    const ids = Object.values(users).map(user => user.id);
    if (ids.length) {
        const photos = await pool.query(`SELECT foto FROM avistamento WHERE id_usuario_autor = ANY($1::bigint[])
            UNION SELECT foto FROM animal WHERE id_usuario_cadastrador = ANY($1::bigint[])`, [ids]);
        await pool.query('DELETE FROM solicitacao_associacao_avistamento WHERE id_usuario_solicitante = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM avistamento WHERE id_usuario_autor = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM animal WHERE id_usuario_cadastrador = ANY($1::bigint[])', [ids]);
        await pool.query('DELETE FROM usuario WHERE id_usuario = ANY($1::bigint[])', [ids]);
        for (const { foto } of photos.rows) if (foto) await fs.unlink(path.join(uploads, path.basename(foto))).catch(() => {});
    }
    server?.kill();
    await pool.end();
});

test('rotas de avistamentos exigem token e conta administradora', async () => {
    for (const [url, method] of [['', 'GET'], ['/1', 'GET'], ['', 'POST'], ['/1', 'PUT'], ['/1', 'DELETE']]) {
        assert.equal((await call(null, '/api/admin/avistamentos' + url, { method })).status, 401);
        assert.equal((await call(users.comum, '/api/admin/avistamentos' + url, { method })).status, 403);
    }
});

test('administrador registra sem identificação, com foto, como autor', async () => {
    const sighting = await adminCreate(unidentified({ id_usuario_autor: String(users.comum.id) }), image);
    const saved = await row(sighting.id_avistamento);
    assert.equal(String(saved.id_usuario_autor), String(users.admin.id));
    assert.equal(saved.id_animal, null);
    assert.match(saved.foto, /^\/uploads\/avistamento-[0-9a-f-]{36}\.png$/);
    assert.ok(await fileExists(saved.foto));
});

test('registro vinculado segue as regras de associação do cadastro comum', async () => {
    const linked = await adminCreate({ id_animal: String(animal.id_animal), latitude: '-2.44', longitude: '-54.70' });
    const saved = await row(linked.id_avistamento);
    assert.equal(String(saved.id_animal), String(animal.id_animal));
    assert.equal(saved.especie_observada, 'Cachorro');
    assert.equal(saved.cor_observada, 'Caramelo');
    const mixed = await admin('', { method: 'POST', body: form({ id_animal: String(animal.id_animal), nome: 'Outro', latitude: '1', longitude: '1' }) });
    assert.equal(mixed.status, 400);
    assert.equal((await admin('', { method: 'POST', body: form({ id_animal: '999999999999', latitude: '1', longitude: '1' }) })).status, 404);
});

test('dados inválidos são recusados sem gravar nada', async () => {
    const before = (await pool.query('SELECT count(*)::int AS n FROM avistamento')).rows[0].n;
    for (const fields of [unidentified({ latitude: '91' }), unidentified({ longitude: 'abc' }), { especie: 'Gato' }, unidentified({ especie: 'Dragão' }),
        unidentified({ genero: 'Outro' }), unidentified({ observacao: 'x'.repeat(301) }), unidentified({ id_animal: 'abc' })]) {
        assert.equal((await admin('', { method: 'POST', body: form(fields) })).status, 400);
    }
    const fake = form(unidentified()); fake.append('foto', new Blob(['não é imagem'], { type: 'image/png' }), 'x.png');
    assert.equal((await admin('', { method: 'POST', body: fake })).status, 400);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM avistamento')).rows[0].n, before);
    for (const query of ['?associacao=talvez', '?especie=Peixe', '?inicio=2026-02-30', '?inicio=2026-05-02&fim=2026-05-01', '?offset=x', `?q=${'x'.repeat(101)}`]) {
        assert.equal((await admin(query)).status, 400, query);
    }
    for (const id of ['abc', '0']) assert.equal((await admin(`/${id}`)).status, 400);
    assert.equal((await admin('/999999999999')).status, 404);
    assert.equal((await admin('/999999999999', { method: 'PUT', body: form(unidentified()) })).status, 404);
});

test('lista com busca, filtros de associação, espécie e data, e paginação', async () => {
    const unique = `Unico${tag}`;
    const free = await createAs(users.comum, unidentified({ observacao: `${unique} livre` }));
    const pending = await createAs(users.comum, unidentified({ observacao: `${unique} pendente` }));
    await requestAssociation(pending.id_avistamento);
    await createAs(users.comum, { id_animal: String(animal.id_animal), latitude: '-2.44', longitude: '-54.70', observacao: `${unique} vinculado` });
    const list = async query => (await (await admin(`?q=${unique}${query}`)).json());
    const all = await list('');
    assert.equal(all.total, 3);
    assert.equal(all.avistamentos[0].autor_nome, `Teste comum ${tag}`);
    assert.equal((await list('&associacao=vinculado')).avistamentos[0].animal_nome, `Animal ${tag}`);
    assert.equal((await list('&associacao=sem_cadastro')).total, 2);
    const pendingList = await list('&associacao=pendente');
    assert.deepEqual(pendingList.avistamentos.map(item => item.id_avistamento), [pending.id_avistamento]);
    assert.equal(pendingList.avistamentos[0].associacao_pendente, true);
    assert.equal((await list('&especie=Cachorro')).total, 1);
    const today = (await pool.query(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d`)).rows[0].d;
    assert.equal((await list(`&inicio=${today}&fim=${today}`)).total, 3);
    assert.equal((await list('&inicio=2000-01-01&fim=2000-12-31')).total, 0);
    const byAuthor = await (await admin(`?q=${encodeURIComponent(`Teste comum ${tag}`)}`)).json();
    assert.ok(byAuthor.total >= 3);
    assert.ok(byAuthor.avistamentos.every(item => item.autor_nome === `Teste comum ${tag}`));
    // Parâmetro repetido vira lista na query string e é recusado.
    assert.equal((await admin(`?q=a&q=b`)).status, 400);
    assert.ok(all.avistamentos.some(item => item.id_avistamento === free.id_avistamento));
    const page = await (await admin('')).json();
    assert.equal(page.limite, 20);
    assert.equal(page.total, (await pool.query('SELECT count(*)::int AS n FROM avistamento')).rows[0].n);
});

test('edita avistamento sem identificação de outro usuário, trocando a foto e preservando o autor', async () => {
    const sighting = await createAs(users.comum, unidentified(), image);
    const response = await admin(`/${sighting.id_avistamento}`, { method: 'PUT', body: form(unidentified({ nome: 'Pretinha', cor: 'Preta', latitude: '-2.5', estado_saude: 'Mancando', id_usuario_autor: String(users.admin.id) }), image) });
    assert.equal(response.status, 200);
    const saved = await row(sighting.id_avistamento);
    assert.equal(saved.nome_observado, 'Pretinha');
    assert.equal(saved.cor_observada, 'Preta');
    assert.equal(Number(saved.latitude), -2.5);
    assert.equal(saved.estado_saude, 'Mancando');
    assert.equal(String(saved.id_usuario_autor), String(users.comum.id));
    assert.equal(saved.id_animal, null);
    assert.notEqual(saved.foto, sighting.foto);
    assert.equal(await fileExists(sighting.foto), false);
    assert.ok(await fileExists(saved.foto));

    const removed = await admin(`/${sighting.id_avistamento}`, { method: 'PUT', body: form({ ...unidentified(), remover_foto: 'true' }) });
    assert.equal(removed.status, 200);
    assert.equal((await row(sighting.id_avistamento)).foto, null);
    assert.equal(await fileExists(saved.foto), false);
});

test('não altera o vínculo com animal pela edição', async () => {
    const free = await createAs(users.comum, unidentified());
    const linkAttempt = await admin(`/${free.id_avistamento}`, { method: 'PUT', body: form(unidentified({ id_animal: String(animal.id_animal) })) });
    assert.equal(linkAttempt.status, 400);
    assert.equal((await row(free.id_avistamento)).id_animal, null);

    const linked = await createAs(users.comum, { id_animal: String(animal.id_animal), latitude: '-2.44', longitude: '-54.70' });
    const ok = await admin(`/${linked.id_avistamento}`, { method: 'PUT', body: form({ latitude: '-2.45', longitude: '-54.71', observacao: 'Corrigido' }) });
    assert.equal(ok.status, 200);
    const saved = await row(linked.id_avistamento);
    assert.equal(String(saved.id_animal), String(animal.id_animal));
    assert.equal(saved.observacao, 'Corrigido');
    assert.equal(saved.cor_observada, 'Caramelo');
    for (const fields of [{ latitude: '1', longitude: '1', cor: 'Azul' }, { latitude: '1', longitude: '1', id_animal: '' }]) {
        assert.equal((await admin(`/${linked.id_avistamento}`, { method: 'PUT', body: form(fields) })).status, 400);
    }
    assert.equal((await row(linked.id_avistamento)).cor_observada, 'Caramelo');
});

test('editar avistamento com solicitação pendente preserva a solicitação', async () => {
    const sighting = await createAs(users.comum, unidentified());
    await requestAssociation(sighting.id_avistamento);
    assert.equal((await admin(`/${sighting.id_avistamento}`, { method: 'PUT', body: form(unidentified({ observacao: 'Editado com pedido' })) })).status, 200);
    const request = (await pool.query('SELECT status_solicitacao, id_animal_proposto FROM solicitacao_associacao_avistamento WHERE id_avistamento = $1', [sighting.id_avistamento])).rows;
    assert.equal(request.length, 1);
    assert.equal(request[0].status_solicitacao, 'PENDENTE');
    assert.equal((await row(sighting.id_avistamento)).id_animal, null);
});

test('exclusão exige confirmação, é bloqueada por solicitações e remove a foto só depois do banco', async () => {
    const withRequest = await createAs(users.comum, unidentified(), image);
    await requestAssociation(withRequest.id_avistamento);
    const details = await (await admin(`/${withRequest.id_avistamento}`)).json();
    assert.equal(details.pode_excluir, false);
    assert.equal(details.solicitacoes.length, 1);
    const blocked = await confirmDelete(withRequest.id_avistamento);
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).dependencias.solicitacoes_associacao, 1);
    assert.ok(await row(withRequest.id_avistamento));
    assert.ok(await fileExists(withRequest.foto));
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM solicitacao_associacao_avistamento WHERE id_avistamento = $1', [withRequest.id_avistamento])).rows[0].n, 1);

    const free = await createAs(users.comum, unidentified(), image);
    assert.equal((await admin(`/${free.id_avistamento}`, { method: 'DELETE' })).status, 400);
    assert.ok(await row(free.id_avistamento));
    assert.equal((await confirmDelete(free.id_avistamento)).status, 200);
    assert.equal(await row(free.id_avistamento), undefined);
    assert.equal(await fileExists(free.foto), false);
    assert.equal((await confirmDelete(free.id_avistamento)).status, 404);
});

test('excluir avistamento vinculado mantém o cadastro do animal', async () => {
    const linked = await createAs(users.comum, { id_animal: String(animal.id_animal), latitude: '-2.44', longitude: '-54.70' });
    assert.equal((await confirmDelete(linked.id_avistamento)).status, 200);
    assert.ok((await pool.query('SELECT 1 FROM animal WHERE id_animal = $1', [animal.id_animal])).rowCount);
});

test('permissões dos usuários comuns continuam as mesmas', async () => {
    const own = await createAs(users.comum, unidentified());
    assert.equal(String((await row(own.id_avistamento)).id_usuario_autor), String(users.comum.id));
    assert.equal((await call(users.comum, `/api/admin/avistamentos/${own.id_avistamento}`, { method: 'PUT', body: form(unidentified()) })).status, 403);
    assert.equal((await call(users.comum, `/api/admin/avistamentos/${own.id_avistamento}`, { method: 'DELETE', ...json({ confirmar: true }) })).status, 403);
    assert.ok(await row(own.id_avistamento));
});
