# Peludinhos — React + Express + PostgreSQL

Aplicação web para mapear avistamentos de animais, manter o cadastro dos animais da cidade, divulgar desaparecimentos e apoiar a análise desses registros por administradores.

## Tecnologias

- **Frontend:** React 19, React Router 7, Vite 8 e Tailwind CSS 4. Mapas com Leaflet e OpenStreetMap; ícones Remix Icon.
- **Backend:** Node.js com Express 5, uma única API em `/api`. Autenticação com JWT (`jsonwebtoken`) e senhas com `bcrypt`. Uploads com `multer`.
- **Banco de dados:** PostgreSQL, acessado com `pg`.
- **Testes:** `node:test`, executando a API real em uma porta temporária.

## Acompanhamento acadêmico

O estado atual está descrito em [Estado da entrega](docs/ESTADO-DA-ENTREGA.md). A divisão de responsabilidades está em [Contribuições e planejamento](docs/CONTRIBUICOES.md). O contrato da API está em [docs/API.md](docs/API.md) e [docs/openapi.json](docs/openapi.json).

## Configurar em outro computador

Requisitos: Node.js 24 ou superior e PostgreSQL 17 ou superior.

1. Clone o repositório ou atualize a branch com `git pull`.
2. Na pasta do projeto, execute `npm ci`.
3. Copie `.env.example` para `.env`. Preencha `DB_PASSWORD` com a senha do PostgreSQL desse computador e ajuste host, porta e usuário se necessário.
4. Gere um segredo com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` e coloque o resultado em `JWT_SECRET` no `.env`.
5. Prepare o banco (veja a seção a seguir).
6. Execute `npm start`: ele compila o React e inicia o Express. Abra http://localhost:3001 (ou a porta definida em `PORT`).
7. Clique em **Criar conta** e depois faça login. Para usar o painel administrativo, promova a conta (seção **Primeiro administrador**).

O `.env` e as fotos enviadas não são versionados. Cada computador usa suas credenciais e seu banco. Nunca coloque senhas em variáveis `VITE_`, pois elas são públicas no frontend.

## Banco de dados

**Banco novo:** crie um banco vazio chamado `peludinhos` e execute `database/banco_peludinhos.sql` nele pelo Query Tool do pgAdmin, uma única vez. Esse script já contém a estrutura final; as migrações não precisam ser executadas.

**Banco já existente:** não execute novamente o SQL inicial. Execute pelo Query Tool do pgAdmin, no banco `peludinhos`, as migrações que ainda não foram aplicadas, **nesta ordem**:

1. `001_saude_avistamento.sql`: saúde por ocorrência e índice para o histórico.
2. `002_avistamento_sem_cadastro.sql`: permite `id_animal` nulo e guarda as características observadas no próprio avistamento.
3. `003_dados_cadastro_animal.sql`: idade aproximada, características, situação, castração, vacinação, origem declarada e data de atualização. A situação genérica `CADASTRADO` passa para `NAO_INFORMADA`.
4. `004_solicitacao_associacao_avistamento.sql`: tabela das solicitações de associação.
5. `005_painel_administrativo.sql`: papel `administrador` em `Usuario.tipo_usuario` e os campos da decisão de validação (`data_validacao`, `observacao_validacao`). Padroniza `status_validacao` em `Pendente`, `Validado` e `Recusado`.
6. `006_preservar_historico_animal.sql`: a exclusão de um animal deixa de apagar em cascata seus avistamentos e solicitações de adoção.
7. `007_email_sem_diferenca_maiusculas.sql`: grava os e-mails em minúsculas e impede contas com o mesmo e-mail em grafias diferentes.

Os arquivos ficam em `database/migrations`. Todos rodam em transação e podem ser repetidos sem efeito. Nenhum apaga registros. As migrações 005 e 007 param com uma mensagem se encontrarem dados fora do padrão (tipo de usuário ou status inválido, ou e-mails repetidos em grafias diferentes), sem alterar nada.

**Importante:** a versão atual do código depende das migrações 005 e 006. Sem a 005, editar um animal e usar o painel administrativo retornam erro 500.

## Primeiro administrador

Não existe promoção pela interface. Depois de criar a conta pelo site, execute no pgAdmin, trocando o e-mail:

```sql
-- 1. Confira a conta
SELECT id_usuario, nome, email, tipo_usuario, ativo FROM Usuario WHERE email = 'seu-email@exemplo.com';

-- 2. Promova somente se a consulta acima retornou a conta esperada
UPDATE Usuario SET tipo_usuario = 'administrador'
WHERE email = 'seu-email@exemplo.com' AND ativo = TRUE
RETURNING id_usuario, nome, email, tipo_usuario;
```

Não é preciso fazer login de novo: o papel é conferido no banco a cada requisição. Para rebaixar, troque `'administrador'` por `'usuario'`; o acesso ao painel termina na requisição seguinte.

## Desenvolver com atualização automática

Abra dois terminais na pasta do projeto:

```sh
# Terminal 1: API e PostgreSQL
npm run dev:api
```

```sh
# Terminal 2: frontend React
npm run dev
```

Acesse http://127.0.0.1:5173. O Vite encaminha `/api` e `/uploads` para o Express na porta configurada no `.env`.

Com `npm start`, o frontend é compilado apenas ao iniciar. Depois de alterar o frontend, pare o servidor (`Ctrl + C`) e execute `npm start` de novo.

## Estrutura

- `src/pages`: telas dos usuários; `src/pages/admin`: telas do painel administrativo.
- `src/components`: componentes compartilhados (menu, mapas, seletor de animais, diálogos); `src/components/admin`: layout, proteção de rota e peças visuais do painel.
- `src/App.jsx`: rotas, compatibilidade com URLs antigas e proteção das telas.
- `src/api.js`: chamadas à API, sessão expirada e conta desativada.
- `server/routes` e `server/controllers`: rotas e regras da API; `server/middleware`: autenticação (`authMiddleware.js`) e autorização administrativa (`adminMiddleware.js`).
- `database`: script inicial e migrações.
- `tests`: testes automatizados da API.
- `public/assets`: imagens e ícones públicos. `dist`: build gerado, ignorado pelo Git.

Os HTMLs, CSS e scripts antigos ficam na pasta `legacy` apenas como referência visual e não são servidos.

## Funcionalidades para os usuários

- **Conta:** cadastro, login, perfil (nome e telefone), troca de senha e foto de perfil. O e-mail não diferencia maiúsculas e minúsculas. Contas desativadas não entram e perdem as sessões já abertas.
- **Animais** (`/animais`): busca, filtro por espécie e cadastro independente com foto, idade aproximada, características, situação, castração, vacinação e origem declarada. Todo cadastro começa **Pendente**. Só quem cadastrou pode editar, e toda edição volta o cadastro para Pendente.
- **Avistamentos:** formulário em quatro etapas (**Foto → Informações → Saúde → Localização**), mapa com mapa de calor e lista `/avistamentos`. O relato pode ser vinculado a um animal **Validado** ou publicado sem identificação, com as características observadas.
- **Solicitações de associação:** um relato sem identificação pode receber um pedido de vínculo a um animal **Validado**, com justificativa de 20 a 1000 caracteres. Há no máximo um pedido pendente por avistamento. O vínculo só é aplicado quando um administrador aprova.
- **Desaparecimentos** (`/perdidos`): publicar, editar, marcar como encontrado e excluir as próprias publicações. Exige telefone no perfil. As fotos são privadas e só aparecem para usuários autenticados.

## Regras de validação

- Só animais com status **Validado** recebem novos vínculos: avistamentos vinculados, pedidos de associação e aprovação de associações. A regra é aplicada no backend, também nas rotas administrativas. Os seletores de animal mostram apenas cadastros validados.
- Animais **Pendentes** e **Recusados** não recebem novos vínculos. Os vínculos existentes são preservados.
- Fica guardada apenas a última decisão de validação de cada animal. A edição pelo cadastrador volta o status para Pendente e limpa a decisão anterior: é assim que um cadastro recusado é corrigido e reenviado.
- Quem cadastrou um animal recusado vê a justificativa na página do animal. Quem fez um pedido de associação recusado vê a justificativa na página do avistamento.

## Painel administrativo

Acesse em **Perfil → Painel Administrativo** ou em `/admin`. O botão só aparece para administradores; o acesso é conferido pelo backend em todas as rotas `/api/admin`.

- **Visão geral:** contadores reais de usuários, animais, avistamentos, desaparecimentos e pendências.
- **Validações:** duas abas, animais e solicitações de associação, com busca, filtros, histórico da última decisão e aprovação ou recusa (justificativa obrigatória na recusa). Decisões simultâneas e cadastros alterados durante a análise são recusados.
- **Animais, Avistamentos e Desaparecimentos:** listagem com busca, filtros e paginação, detalhes, cadastro e edição de registros de qualquer usuário. O vínculo de um avistamento com um animal não muda pela edição.
- **Usuários:** listagem, detalhes com os registros vinculados, edição de nome e telefone, desativação e reativação.
- **Exclusões:** exigem confirmação e são bloqueadas quando há histórico vinculado (por exemplo, animal com avistamentos, avistamento com solicitações ou conta com registros). Contas com histórico devem ser desativadas. Nenhum administrador pode desativar ou excluir a própria conta ou a de outro administrador.

## Testes

Os testes usam o PostgreSQL configurado no `.env`, iniciam a API em uma porta temporária e criam e removem apenas os próprios dados. O banco precisa estar com todas as migrações aplicadas.

```sh
npm run test:animais
npm run test:avistamentos
npm run test:perdidos
npm run test:admin
npm run test:seguranca
```

`test:admin` executa os arquivos `tests/admin*.test.cjs` em sequência, porque alguns comparam contagens globais. `test:avistamentos` também executa novamente as migrações 001 e 002 para confirmar que são repetíveis.

## Organização das branches

- `perdidos`: contribuição do Matheus.
- `cadastro_animais`: cadastro independente, listagem de animais e consulta de cadastro/histórico.
- `avistamentos`: relatos vinculados ou não identificados, saúde e características por ocorrência.
- `feature/painel-admin`: painel administrativo, validações, regras de vínculo e correções da auditoria.

As três primeiras foram integradas à `main`, preservando as branches de origem.
