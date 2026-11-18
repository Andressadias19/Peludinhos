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

Requisitos: Node.js 24 LTS (o projeto declara `>=24.0.0 <25` no `package.json` e `24` no `.node-version`; use a versão 24 mais recente, com as correções de segurança) e PostgreSQL 17 ou superior.

1. Clone o repositório ou atualize a branch com `git pull`.
2. Na pasta do projeto, execute `npm ci`.
3. Copie `.env.example` para `.env`. Preencha `DB_PASSWORD` com a senha do PostgreSQL desse computador e ajuste host, porta e usuário se necessário.
4. Gere um segredo com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` e coloque o resultado em `JWT_SECRET` no `.env`.
5. Prepare o banco (veja a seção a seguir).
6. Execute `npm run start:full`: ele compila o React e inicia o Express servindo a API e o frontend. Abra http://localhost:3001 (ou a porta definida em `PORT`). Para outras formas de execução, veja **Executar o projeto**.
7. Clique em **Criar conta** e depois faça login. Para usar o painel administrativo, promova a conta (seção **Primeiro administrador**).

O `.env`, o `.env.test` e as fotos enviadas não são versionados. Cada computador usa suas credenciais e seu banco. Nunca coloque senhas em variáveis `VITE_`, pois elas são públicas no frontend.

## Executar com Docker Compose

O ambiente Docker local é independente da hospedagem: inicia frontend, API e PostgreSQL em três containers, usa armazenamento local para fotos e cria registros fictícios de demonstração. Ele não acessa o Supabase e não altera os dados do Render/Supabase. Consulte [docs/CONTAINERS.md](docs/CONTAINERS.md) para instalação, configuração, comandos e explicação da comunicação entre os serviços.

## Banco de dados

**Banco novo:** crie um banco vazio chamado `peludinhos` e execute `database/banco_peludinhos.sql` nele pelo Query Tool do pgAdmin, uma única vez. Esse script já contém a estrutura final, igual à de um banco atualizado por todas as migrações (as mesmas colunas, defaults, constraints e índices), e não insere registros; as migrações não precisam ser executadas. Esse é o procedimento único para qualquer banco vazio, inclusive o do Supabase (veja **Hospedagem**). A igualdade é conferida pelos testes (`tests/estrutura-banco.test.cjs`) contra `tests/fixtures/estrutura-esperada.json`.

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

## Executar o projeto

O backend (Express) e o frontend (React/Vite) podem rodar separados ou juntos.

| Script | O que faz |
| --- | --- |
| `npm start` | Inicia **somente o backend**: a API e as fotos, na porta `PORT`. Não compila nem serve o frontend. |
| `npm run dev:api` | Backend em desenvolvimento, reiniciando a cada alteração. |
| `npm run dev` | Frontend em desenvolvimento (Vite) em http://127.0.0.1:5173, com atualização automática. |
| `npm run build` | Compila o frontend na pasta `dist`. |
| `npm run preview` | Serve o frontend compilado em http://127.0.0.1:4173, para conferir o build localmente. |
| `npm run start:full` | Compila o frontend e inicia o Express servindo a API **e** o frontend, em uma única porta (comportamento antigo do `npm start`). |

**Desenvolvimento com atualização automática:** abra dois terminais na pasta do projeto.

```sh
# Terminal 1: API e PostgreSQL
npm run dev:api
```

```sh
# Terminal 2: frontend React
npm run dev
```

Acesse http://127.0.0.1:5173. O Vite encaminha `/api` e `/uploads` para o Express na porta configurada no `.env`. O `npm run preview` faz o mesmo encaminhamento, então também precisa do backend rodando.

**Tudo junto em uma porta:** `npm run start:full`. O frontend é compilado apenas ao iniciar; depois de alterá-lo, pare o servidor (`Ctrl + C`) e execute o comando de novo.

**Frontend e backend separados, sem proxy:** é como funcionará na hospedagem, com cada parte em um endereço.

1. No `.env`, defina `VITE_API_URL` com a URL do backend, **sem** `/api` no final (por exemplo, `VITE_API_URL=http://127.0.0.1:3001`).
2. Terminal 1: `npm start` (backend na porta `PORT`).
3. Terminal 2: `npm run build` e depois `npm run preview` (frontend em http://127.0.0.1:4173).
4. Acesse http://127.0.0.1:4173. O navegador chama a API e carrega as fotos públicas diretamente no backend; por isso, a origem do frontend precisa estar em `CORS_ORIGIN` (as portas 4173 e 5173 locais já são permitidas por padrão).

Para voltar ao modo com proxy, deixe `VITE_API_URL` vazia e rode `npm run build` de novo.

### Configuração do frontend

- `VITE_API_URL`: URL base do backend, sem o `/api` final. O frontend monta as chamadas como `<VITE_API_URL>/api/...` e as fotos públicas como `<VITE_API_URL>/uploads/...`. Vazia (padrão), usa caminhos relativos, atendidos pelo proxy do Vite (`npm run dev` e `npm run preview`) ou pelo próprio Express (`npm run start:full`).
- O valor é **gravado no JavaScript no momento do build**: depois de alterá-lo, é preciso compilar de novo.
- **Toda variável `VITE_*` é pública**: fica visível para qualquer pessoa que abra o site. Senhas, `JWT_SECRET`, URLs do banco e chaves privadas ficam só no backend. O build é interrompido se uma variável `VITE_*` tiver nome de segredo (`SECRET`, `PASSWORD`, `KEY`, `TOKEN`...) ou se `VITE_API_URL` for inválida ou terminar em `/api`.
- As fotos de perfil são privadas: são buscadas com o token pela rota autenticada `/api/usuarios/:id/foto`, nunca por um endereço público. As fotos de animais, avistamentos e desaparecimentos são públicas e usam `mediaUrl`.
- **Hospedagem futura como site estático (Render Static Site):** o servidor de arquivos estáticos não conhece as rotas do React. Será preciso configurar uma regra de reescrita de `/*` para `/index.html`; sem ela, abrir ou atualizar diretamente um endereço como `/mapa` ou `/admin/usuarios` resulta em 404. Essa configuração ainda não foi feita.

### Configurações do servidor

Definidas no `.env` (veja `.env.example`):

- `SERVE_FRONTEND`: `false` por padrão, o Express serve só a API e as fotos e funciona sem a pasta `dist`. Endereços fora da API (como `/` ou `/mapa`) respondem 404 em JSON. Com `true`, ele também entrega o frontend compilado e as rotas da SPA; se o build não existir, a API continua funcionando e as páginas respondem 503 até que se execute `npm run build`. O `npm run start:full` ativa esse modo pelo argumento `--serve-frontend`, sem depender da variável. Endereços inexistentes da API sempre respondem 404 em JSON.
- `CORS_ORIGIN`: endereços de frontend autorizados a chamar a API pelo navegador, separados por vírgula (por exemplo, `https://peludinhos.onrender.com,http://localhost:5173`). Sem valor, valem as origens locais do Vite (`localhost` e `127.0.0.1`, portas 5173 e 4173). Não aceita `*` nem endereços com caminho. Requisições sem o cabeçalho `Origin` (testes, `curl`, ferramentas de API) não são afetadas. O CORS não substitui o login nem as permissões, que continuam valendo em todas as rotas.
- `STORAGE_DRIVER`: onde as fotos ficam guardadas, `local` (padrão, as pastas abaixo) ou `supabase` (Supabase Storage, com as variáveis `SUPABASE_*`). Outros valores, ou o modo supabase com configuração incompleta, impedem o servidor de iniciar. Veja **Armazenamento das fotos**.
- `UPLOADS_DIR` e `UPLOADS_PRIVATE_DIR`: pastas das fotos públicas e privadas no disco (driver local). Sem valor, continuam `server/uploads` e `server/uploads-perdidos`. Precisam ser pastas diferentes, sem uma dentro da outra; caso contrário, o servidor não inicia, para que as fotos privadas não fiquem acessíveis em `/uploads`.
- `DIAGNOSTICO_BANCO`: `false` por padrão. Com `true`, ativa `GET /api/teste-banco`, que consulta o banco sem login e serve só para conferir a conexão em desenvolvimento. Desligada, a rota responde 404. Não ligue em produção; a rota de saúde é `GET /api`, que não consulta o banco.
- `JWT_SECRET`: obrigatório, com pelo menos 32 caracteres. O servidor não inicia sem ele, com um segredo curto ou com o texto de exemplo do `.env.example`, porque com um segredo fraco qualquer pessoa poderia forjar tokens.
- `DB_CONNECTION_TIMEOUT_MS`: tempo máximo para abrir uma conexão com o PostgreSQL, de 1000 a 120000 ms (padrão 10000). Se o banco não responder nesse prazo, a requisição recebe erro em vez de esperar indefinidamente.

O servidor não fixa o host: escuta em todas as interfaces de rede, na porta `PORT`. Valores inválidos nessas variáveis impedem o servidor de iniciar e mostram o que corrigir.

### Armazenamento das fotos

Os controllers não acessam o disco nem o Supabase diretamente: usam a camada `server/storage`, que separa as fotos em duas áreas.

| Área | Conteúdo | Valor gravado no banco | Como o navegador recebe |
|---|---|---|---|
| `publica` | fotos de animais, avistamentos e desaparecimentos | `/uploads/<nome>` | `GET /uploads/<nome>`, sem login |
| `privada` | fotos de perfil | `<nome>` | só `GET /api/usuarios/:id/foto`, com login (a própria conta ou um administrador) e `Cache-Control: private, no-store` |

O `/uploads` nunca entrega fotos de perfil (`usuario-*`), nem as antigas que ficaram na área pública. Registros antigos continuam funcionando: publicações de desaparecimento feitas quando essas fotos eram privadas guardam só `<nome>` e saem por `GET /api/perdidos/:id/foto` (com login); fotos de perfil antigas guardam `/uploads/<nome>` e saem pela rota autenticada do perfil.

- `server/storage/index.js`: lê `STORAGE_DRIVER`, valida área, nome e conteúdo antes de qualquer operação e converte nomes de arquivo nos valores do banco (e vice-versa). Os valores das colunas não dependem do driver.
- `server/storage/local.js`: driver local, nas pastas `UPLOADS_DIR` e `UPLOADS_PRIVATE_DIR`. Também confere que o caminho final fica dentro da pasta da área.
- `server/storage/supabase.js`: driver Supabase Storage (biblioteca oficial `@supabase/supabase-js`), com um bucket por área.
- `server/storage/regras.js` e `server/storage/erros.js`: formato dos nomes, tipos de arquivo e erros com códigos independentes do driver (`ARQUIVO_NAO_ENCONTRADO`, `ARQUIVO_JA_EXISTE`, `NOME_DE_ARQUIVO_INVALIDO`, `AREA_INVALIDA`, `CONTEUDO_INVALIDO`, `FALHA_NO_ARMAZENAMENTO`). Em `FALHA_NO_ARMAZENAMENTO`, o driver remoto informa também `motivo` (`PERMISSAO`, `INDISPONIVEL`, `TEMPO_ESGOTADO`, `CONFIGURACAO`, `RESPOSTA_INVALIDA` ou `DESCONHECIDO`) e, quando for o caso, `resultadoIncerto`.

Só são aceitos nomes gerados pelo servidor, no formato `prefixo-identificador.extensão` (por exemplo, `animal-<uuid>.png` ou `usuario-13-1700000000000.jpg`), com extensão `jpg`, `png` ou `webp`. Nomes com barras, `..`, `%`, maiúsculas ou outros caracteres são recusados. Nenhum arquivo é sobrescrito.

#### Alternar entre os drivers

| | `STORAGE_DRIVER=local` (padrão) | `STORAGE_DRIVER=supabase` |
|---|---|---|
| Variáveis usadas | `UPLOADS_DIR`, `UPLOADS_PRIVATE_DIR` (opcionais) | `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (obrigatórias); `SUPABASE_BUCKET_PUBLICO`, `SUPABASE_BUCKET_PRIVADO`, `SUPABASE_TIMEOUT_MS` (opcionais) |
| Fotos públicas (`/uploads/<nome>`) | entregues pelo Express, das pastas | o Express confere o nome e se o arquivo existe no bucket público e responde `302` para a URL pública dele |
| Fotos privadas | lidas da pasta privada pelo backend | baixadas do bucket privado pelo backend e entregues pela mesma rota da API |
| Na inicialização | nada a conferir | confere se os dois buckets existem, se a chave tem acesso, se o público é público e se o privado **não** é público |

Sem `STORAGE_DRIVER=supabase`, as variáveis `SUPABASE_*` não são lidas nem exigidas, e o SDK do Supabase nem é carregado. No modo supabase, a configuração incompleta ou inválida impede o servidor de iniciar, com a lista do que corrigir. A mensagem cita só nomes de variáveis. São recusados:

- URL sem `https` (http só para `localhost`), com caminho, parâmetros ou usuário e senha;
- chave ausente, com espaços, curta demais ou pública (anon ou publishable);
- buckets com nome inválido ou iguais entre si;
- tempo limite fora de 1 a 120 segundos.

Trocar de driver **não copia** as fotos: as fotos que ficaram no outro armazenamento deixam de aparecer (o registro continua no banco, e a foto responde 404). As imagens existentes não são migradas automaticamente.

#### Configuração futura dos buckets no Supabase

Ainda não feita. Quando o projeto existir:

1. Em **Storage**, crie o bucket `peludinhos-publico` com **Public bucket** ligado.
2. Crie o bucket `peludinhos-privado` com **Public bucket** desligado.
3. Não crie políticas (RLS) de acesso para usuários anônimos ou autenticados: o backend usa a chave service role, que não depende delas. O frontend nunca acessa o Supabase.
4. Opcional: limite cada bucket a 5 MB por arquivo e aos tipos `image/jpeg`, `image/png` e `image/webp`, as mesmas regras da API.

#### Segurança das credenciais

- A `SUPABASE_SERVICE_ROLE_KEY` dá acesso total ao Storage do projeto. Ela fica só nas variáveis do backend (`.env` local ou painel da hospedagem). Nunca pode ir para variáveis `VITE_*`, para o frontend, para commits ou para mensagens. O build do frontend já é interrompido se uma variável `VITE_*` tiver nome de segredo (`KEY`, `SERVICE_ROLE` etc.).
- O cliente do Supabase é criado só no servidor, sem sessão de usuário, sem renovação automática de token e sem leitura de URL de login. O login dos usuários continua sendo o JWT da própria API; o Supabase Auth não é usado.
- Erros e logs do driver não incluem a chave nem tokens: as causas são resumidas e limpas antes de serem registradas. A descrição da configuração (`descrever()`) também não traz a chave.
- O redirecionamento de `/uploads` monta o destino só com `SUPABASE_URL`, o bucket público e um nome no formato do sistema. Nada da requisição entra no endereço, e o bucket privado nunca é usado nessa rota.
- As fotos privadas nunca saem por URL pública ou assinada: os bytes passam sempre pela API, depois da autenticação.

#### Transações e limitações do armazenamento remoto

O PostgreSQL e o Storage são serviços separados: **não existe uma transação atômica entre os dois**. A ordem das operações reduz as inconsistências:

1. a foto nova é gravada antes do `COMMIT`;
2. se a transação falhar, a foto nova é apagada (compensação);
3. a foto antiga só é apagada depois do `COMMIT`.

Mesmo assim, podem sobrar **arquivos órfãos** (arquivos sem registro). Os registros, porém, nunca ficam apontando para uma foto que não foi gravada. Os órfãos aparecem quando:

- a compensação ou a remoção da foto antiga falha (Supabase fora do ar, tempo esgotado). O erro vai para o log;
- o envio termina com **resultado incerto** (a conexão caiu ou o tempo esgotou depois de o arquivo ser enviado). A operação falha e é desfeita no banco, mas o arquivo pode ter ficado no bucket. Ele não é apagado automaticamente, porque nesse caso não há como saber se pertence a esta operação. O log registra "O resultado é incerto";
- o processo é encerrado entre o envio e o `COMMIT`.

Outras características do modo supabase:

- uma colisão de nome (`ARQUIVO_JA_EXISTE`) nunca apaga o arquivo existente;
- cada operação tem tempo limite (`SUPABASE_TIMEOUT_MS`, padrão 15 s), também na leitura do corpo;
- as fotos privadas são baixadas inteiras para a memória do servidor antes de a resposta começar (até 10 MB por foto; os envios são limitados a 5 MB);
- o `/uploads` faz uma consulta ao Supabase por foto e guarda a confirmação de existência por 5 minutos. Uma foto apagada por outro meio pode continuar sendo redirecionada nesse intervalo, e o Supabase responde 404;
- falhas do Supabase na rota `/uploads` respondem `503` em JSON. Na rota privada, a resposta é `500` em JSON e nunca um `200` incompleto.

Hoje não há limpeza automática de órfãos. Ela pode ser feita comparando os arquivos do bucket com as colunas de foto do banco.

#### Interface de um driver

Todos os métodos são assíncronos e recebem área e nome já validados pela fachada:

| Método | Comportamento esperado |
|---|---|
| `salvar(area, nome, conteudo, { tipo })` | grava o `Buffer` com o Content-Type `tipo`; se o nome já existir, falha com `ARQUIVO_JA_EXISTE` sem alterar o arquivo; não pode deixar arquivo parcial |
| `existe(area, nome)` | `true` ou `false`; outras falhas lançam erro (nunca viram `false`) |
| `ler(area, nome)` | `Buffer`; `ARQUIVO_NAO_ENCONTRADO` se não existir |
| `abrirLeitura(area, nome)` | `{ stream, tamanho }`; o "não encontrado" e as falhas aparecem aqui, antes de a resposta começar |
| `excluir(area, nome)` | `true` se apagou, `false` se já não existia; outras falhas lançam `FALHA_NO_ARMAZENAMENTO` |
| `middlewarePublico()` | middleware Express montado em `/uploads` |
| `descrever()` | `{ driver, ... }` para diagnóstico, sem segredos |
| `verificar()` | opcional: confere a configuração remota na inicialização |

A fachada acrescenta `descartar(area, nome, contexto)`, uma exclusão que nunca lança erro e registra falhas no log, e as funções `referencia` e `nomeDaReferencia`.

#### O que ainda precisa ser validado num Supabase real

Os testes automáticos do driver usam só um Supabase simulado (`tests/armazenamento-supabase.test.cjs`), com o SDK oficial e sem acesso à rede. Os formatos de resposta seguem o SDK e a documentação. Quando houver um projeto real, confira:

- os códigos devolvidos para colisão (`409`/`Duplicate`), objeto inexistente, bucket inexistente e chave errada;
- o redirecionamento de `/uploads` e o carregamento das imagens no navegador, inclusive no mapa;
- o envio e a leitura das fotos privadas, e se o bucket privado recusa acesso direto pela URL pública;
- a verificação de inicialização (buckets, visibilidade e chave);
- o comportamento com o Supabase lento ou fora do ar;
- o tempo de resposta do `/uploads` em listas com muitas fotos.

## Hospedagem (planejada: Render + Supabase)

Ainda não configurada. Arquitetura: frontend no **Render Static Site**, API Express no **Render Web Service**, banco no **Supabase Database** (PostgreSQL) e fotos no **Supabase Storage**. O navegador só fala com a API; o banco e o Storage são acessados só pelo backend. Nenhum valor secreto vai para o repositório: todos ficam nos painéis do Render e do Supabase.

Ordem sugerida: 1) projeto Supabase e banco; 2) buckets; 3) backend no Render; 4) frontend no Render; 5) `CORS_ORIGIN` do backend com o endereço final do frontend; 6) primeiro administrador.

### Supabase Database

1. Crie o projeto (região mais próxima dos usuários, por exemplo São Paulo) com uma senha forte de banco, guardada num gerenciador de senhas.
2. No **SQL Editor**, com o banco vazio, execute **uma vez**:
   1. `database/banco_peludinhos.sql`: cria toda a estrutura atual, sem registros;
   2. `database/supabase/proteger_data_api.sql`: tira o acesso dos papéis da Data API (`anon`, `authenticated`, `service_role`) às tabelas, inclusive às criadas depois, e liga o RLS sem políticas. O script se recusa a rodar fora do Supabase e desfaz tudo se a conferência final falhar.
3. Em **Project Settings > Data API**, desligue a Data API (ou tire `public` dos schemas expostos). O Peludinhos não usa a Data API; o passo 2 já protege as tabelas mesmo que ela continue ligada.
4. O Supabase Auth não é usado: o login continua sendo o JWT da própria API.
5. Conexão do backend: em **Connect**, copie a URI do **Session pooler** (IPv4, porta 5432) para `DATABASE_URL`, sem `sslmode` nem outros parâmetros. Em **Database Settings > SSL Configuration**, baixe o certificado da CA para `DATABASE_SSL_CA` ou `DATABASE_SSL_CA_FILE` (veja a seção do backend). Se puder, ligue **Enforce SSL**.
6. Não rode as migrações de `database/migrations` num banco novo: elas são só para bancos criados antes de cada mudança. Também não rode os testes automatizados nesse banco: eles só aceitam um PostgreSQL local de testes.

No plano gratuito, o projeto é pausado depois de um período sem uso e precisa ser reativado no painel.

### Supabase Storage

Crie os buckets `peludinhos-publico` (Public bucket ligado) e `peludinhos-privado` (Public bucket desligado), sem políticas de acesso. Detalhes e limitações estão em **Armazenamento das fotos**. As fotos do ambiente de desenvolvimento não são copiadas.

### Render Web Service (backend)

| Configuração | Valor |
|---|---|
| Runtime | Node |
| Versão do Node | 24 (lida do arquivo `.node-version`; o `package.json` declara `"engines": { "node": ">=24.0.0 <25" }`) |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` (somente a API) |
| Health Check Path | `/api` (responde 200 sem consultar o banco) |

Variáveis de ambiente (os valores reais só no painel do Render):

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | segredo aleatório novo, diferente do de desenvolvimento; gere com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. O servidor não inicia com menos de 32 caracteres ou com o texto de exemplo |
| `DATABASE_URL` | URI do Session pooler do Supabase |
| `DATABASE_SSL` | `true` |
| `DATABASE_SSL_CA` ou `DATABASE_SSL_CA_FILE` | certificado da CA do Supabase. Opções: colar o PEM em `DATABASE_SSL_CA` (quebras de linha como `\n`), ou criar um **Secret File** `supabase-ca.crt` e usar `DATABASE_SSL_CA_FILE=/etc/secrets/supabase-ca.crt` |
| `DB_POOL_MAX` | `5` |
| `DB_CONNECTION_TIMEOUT_MS` | `10000` |
| `CORS_ORIGIN` | endereço do Static Site, por exemplo `https://peludinhos.onrender.com` (sem barra final) |
| `SERVE_FRONTEND` | `false` |
| `DIAGNOSTICO_BANCO` | `false` (ou não definir) |
| `STORAGE_DRIVER` | `supabase` (**obrigatório no Render**: o disco do serviço é apagado a cada deploy ou reinício, e o driver local perderia as fotos) |
| `SUPABASE_URL` | `https://<projeto>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave secreta service role (só aqui; nunca no Static Site) |
| `SUPABASE_BUCKET_PUBLICO` / `SUPABASE_BUCKET_PRIVADO` | `peludinhos-publico` / `peludinhos-privado` |
| `SUPABASE_TIMEOUT_MS` | opcional, padrão `15000` |

Não defina `PORT`: o Render informa a porta, e o servidor já a usa. Ao iniciar no modo supabase, o servidor confere os buckets, a visibilidade e a chave, e não sobe se algo estiver errado. No plano gratuito, o serviço hiberna sem uso, e a primeira requisição depois disso demora alguns segundos.

### Render Static Site (frontend)

| Configuração | Valor |
|---|---|
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist` |
| Versão do Node | 24 (arquivo `.node-version`) |
| Variável `VITE_API_URL` | endereço do Web Service, sem `/api` no final, por exemplo `https://peludinhos-api.onrender.com` |
| Redirects/Rewrites | Source `/*`, Destination `/index.html`, Action **Rewrite** (sem isso, abrir `/mapa` ou `/admin` diretamente dá 404) |

`VITE_API_URL` é fixada no build e fica pública no navegador. Nenhuma outra variável é necessária, e nenhuma credencial pode ser posta no Static Site. Ao mudar o endereço do backend, faça um novo deploy do frontend.

### Validação local com o Supabase real

Antes do Render, o backend pode rodar nesta máquina conectado ao banco e ao Storage reais do Supabase, sem mexer no ambiente de desenvolvimento.

- **Configuração:** copie `.env.supabase.local.example` para `.env.supabase.local` (ignorado pelo Git) e preencha nesta máquina. O certificado da CA vai em `certificados/supabase-ca.crt` (pasta ignorada pelo Git). Nunca envie esses valores por mensagem.
- **Isolamento:** `npm run start:supabase` inicia `server/server.js --arquivo-env=.env.supabase.local`. Com essa opção, o backend lê **só** esse arquivo: o `.env` não é aberto, então nenhum banco, senha ou `JWT_SECRET` de desenvolvimento é herdado. Os valores do arquivo prevalecem sobre variáveis do terminal. Os testes automatizados recusam essa opção.
- **Conferência sem rede:** `npm run supabase:verificar` (chamado também pelo `start:supabase`) confere que:
  - o arquivo e o certificado estão fora do Git e não sobrou nenhum texto de exemplo;
  - a conexão é pelo Session pooler (porta 5432) e o TLS verifica o certificado, que precisa ser de uma CA e estar válido;
  - o banco e o Storage são do mesmo projeto, com a chave service role e buckets diferentes;
  - o `JWT_SECRET` é forte e diferente do `.env` e do `.env.test`.

  Nunca mostra valores.
- **Portas:** o backend da validação usa a 3002, e o de desenvolvimento continua na 3001; os dois podem rodar juntos.
- **Limpeza:** as contas criadas na validação usam e-mails `@validacao-supabase.invalid`. `npm run supabase:limpar-validacao` só simula e mostra o que seria removido. Com `-- --confirmar`, remove apenas essas contas, os registros delas e as fotos que nenhum registro restante usa. Ele:
  - para sem remover nada se um registro de outra conta depender delas;
  - recusa bancos locais e o driver local;
  - não exclui buckets, tabelas nem outros recursos do projeto.

### Primeiro administrador de produção

O banco de produção começa vazio: o script não cria usuários, e nenhuma senha fica no código.

1. Abra o site publicado, clique em **Criar conta** e cadastre a conta do administrador com uma senha forte.
2. No **SQL Editor** do Supabase, confira e promova a conta, trocando o e-mail:

   ```sql
   SELECT id_usuario, nome, email, tipo_usuario, ativo FROM usuario WHERE email = lower('email-do-administrador@exemplo.com');

   UPDATE usuario SET tipo_usuario = 'administrador'
   WHERE email = lower('email-do-administrador@exemplo.com') AND ativo = TRUE AND tipo_usuario = 'usuario'
   RETURNING id_usuario, email, tipo_usuario;
   ```
3. Confira, entrando no site, se o painel administrativo aparece. Os demais administradores podem ser promovidos do mesmo jeito; não há promoção pela interface.

## Estrutura

- `src/pages`: telas dos usuários; `src/pages/admin`: telas do painel administrativo.
- `src/components`: componentes compartilhados (menu, mapas, seletor de animais, diálogos); `src/components/admin`: layout, proteção de rota e peças visuais do painel.
- `src/App.jsx`: rotas, compatibilidade com URLs antigas e proteção das telas.
- `src/api.js`: chamadas à API, sessão expirada e conta desativada.
- `server/routes` e `server/controllers`: rotas e regras da API; `server/middleware`: autenticação (`authMiddleware.js`) e autorização administrativa (`adminMiddleware.js`).
- `server/storage`: camada de armazenamento das fotos, drivers local e Supabase (veja **Armazenamento das fotos**); `server/config`: configuração do banco, do servidor e das pastas de fotos.
- `database`: script inicial e migrações.
- `tests`: testes automatizados da API.
- `public/assets`: imagens e ícones públicos. `dist`: build gerado, ignorado pelo Git.

Os HTMLs, CSS e scripts antigos ficam na pasta `legacy` apenas como referência visual e não são servidos.

## Funcionalidades para os usuários

- **Conta:** cadastro, login, perfil (nome e telefone), troca de senha e foto de perfil. O e-mail não diferencia maiúsculas e minúsculas. Contas desativadas não entram e perdem as sessões já abertas.
- **Animais** (`/animais`): busca, filtro por espécie e cadastro independente com foto, idade aproximada, características, situação, castração, vacinação e origem declarada. Todo cadastro começa **Pendente**. Só quem cadastrou pode editar, e toda edição volta o cadastro para Pendente.
- **Avistamentos:** formulário em quatro etapas (**Foto → Informações → Saúde → Localização**), mapa com mapa de calor e lista `/avistamentos`. O relato pode ser vinculado a um animal **Validado** ou publicado sem identificação, com as características observadas.
- **Solicitações de associação:** um relato sem identificação pode receber um pedido de vínculo a um animal **Validado**, com justificativa de 20 a 1000 caracteres. Há no máximo um pedido pendente por avistamento. O vínculo só é aplicado quando um administrador aprova.
- **Desaparecimentos** (`/perdidos`): publicar, editar, marcar como encontrado e excluir as próprias publicações. Exige telefone no perfil. As fotos são públicas, como as de animais e avistamentos.

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

Os testes de integração criam e apagam registros e fotos. Por isso rodam **somente** num banco PostgreSQL local exclusivo (`peludinhos_test`), com um usuário próprio e pastas de fotos próprias. Eles nunca usam o banco `peludinhos`, o `.env` de desenvolvimento nem um banco remoto.

### Preparar o ambiente de testes (uma vez por computador)

1. No pgAdmin (Query Tool conectado ao banco `postgres`, como administrador) ou no `psql -U postgres -d postgres`, crie o usuário e o banco. Troque a senha:

   ```sql
   CREATE ROLE peludinhos_test_user LOGIN PASSWORD 'troque-esta-senha'
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
   CREATE DATABASE peludinhos_test OWNER peludinhos_test_user ENCODING 'UTF8' TEMPLATE template0;
   COMMENT ON DATABASE peludinhos_test IS 'peludinhos:testes-automatizados';
   REVOKE ALL ON DATABASE peludinhos_test FROM PUBLIC;
   ```

   O comentário é o marcador que os testes conferem no banco conectado. Sem ele, nada é executado.
2. Copie `.env.test.example` para `.env.test` (não versionado). Preencha `DB_PASSWORD` com a senha acima e gere um `JWT_SECRET` diferente do `.env`.
3. Execute `npm run test:preparar`. Ele recria a estrutura do banco de testes com `database/banco_peludinhos.sql` e as migrações, sem nenhum registro, e esvazia as pastas de fotos de teste. Pode ser repetido a qualquer momento. Os dados do banco de desenvolvimento não são copiados: cada suíte cria e remove os próprios registros.

### Executar

```sh
npm test                 # prepara o banco de testes e executa todas as suítes, em sequência
npm run test:animais
npm run test:avistamentos
npm run test:perdidos
npm run test:admin
npm run test:seguranca
npm run test:servidor
npm run test:isolamento
npm run test:armazenamento
npm run test:supabase     # sem banco e sem rede
npm run test:estrutura
npm run test:ambiente      # --arquivo-env, verificador e limpeza da validação (sem Supabase)
npm run test:banco       # sem banco
npm run test:frontend    # sem banco
```

`test:banco` confere a configuração da conexão sem acessar o banco. `test:frontend` confere as URLs da API e das fotos (`VITE_API_URL` e `mediaUrl`), os cabeçalhos enviados pelo `src/api.js` e se o build não contém segredos do `.env`; também não acessa o banco. `test:servidor` confere os modos de execução (com e sem frontend), o 404 em JSON e o CORS. `test:isolamento` comprova as proteções descritas abaixo. `test:armazenamento` confere a camada de armazenamento (gravação, leitura, exclusão, sobrescrita, nomes inválidos, path traversal, separação das áreas, falhas do disco) e a compensação nos controllers, com falhas reais provocadas no banco de testes e no disco. `test:estrutura` confere que o script de banco novo e as migrações chegam à mesma estrutura, igual a `tests/fixtures/estrutura-esperada.json` (o `test:preparar` também faz essa conferência). `test:supabase` confere o driver Supabase com um Supabase simulado e um banco falso: não acessa a rede, o PostgreSQL nem as pastas de fotos, e não usa valores reais.

`test:admin` executa os arquivos `tests/admin*.test.cjs` em sequência, porque alguns comparam contagens globais. `test:avistamentos` também executa novamente as migrações 001 e 002 (no banco de testes) para confirmar que são repetíveis.

### Proteções

O arquivo `tests/helpers/bancoLocal.cjs` é carregado primeiro por toda suíte que usa o banco:

- **Antes de conectar:** lê apenas o `.env.test` e bloqueia a execução se o host não for local; se houver `DATABASE_URL`; se `DB_NAME` não terminar em `_test`, for `peludinhos` ou for o banco do `.env`; se `DB_USER` for `postgres` ou o usuário do `.env`; se o `JWT_SECRET` for o mesmo do `.env`; ou se as pastas de fotos forem, contiverem ou estiverem dentro de `server/uploads` ou `server/uploads-perdidos`. Uma `DATABASE_URL` definida no terminal é anulada.
- **Depois de conectar, antes da primeira consulta:** confere o banco realmente conectado (nome, marcador e usuário sem privilégio de superusuário). Se algo não conferir, nenhuma consulta é executada.
- **Armazenamento:** sempre o driver local (`STORAGE_DRIVER=local`) nas pastas de teste. Outro valor no `.env.test` ou no servidor iniciado pelos testes bloqueia a execução; `STORAGE_DRIVER` e variáveis `SUPABASE_*` vindas do terminal ou do `.env` são anuladas.
- **Servidores iniciados pelos testes:** herdam as mesmas regras (o bloqueio é carregado neles pelo `NODE_OPTIONS`) e usam as pastas `tests/tmp/uploads` (públicas) e `tests/tmp/uploads-perdidos` (privadas), não versionadas.

## Organização das branches

- `perdidos`: contribuição do Matheus.
- `cadastro_animais`: cadastro independente, listagem de animais e consulta de cadastro/histórico.
- `avistamentos`: relatos vinculados ou não identificados, saúde e características por ocorrência.
- `feature/painel-admin`: painel administrativo, validações, regras de vínculo e correções da auditoria.

As três primeiras foram integradas à `main`, preservando as branches de origem.
