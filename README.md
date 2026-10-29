# Peludinhos — React + Express + PostgreSQL

O frontend usa React, React Router, Vite e Tailwind CSS. A API continua em Node.js/Express e os dados de usuários ficam no PostgreSQL.

## Configurar em outro computador

Requisitos: Node.js 24 ou superior e PostgreSQL 17 ou superior.

1. Clone o repositório ou atualize a branch com `git pull`.
2. Na pasta do projeto, execute `npm ci`.
3. Copie `.env.example` para `.env`. Preencha `DB_PASSWORD` com a senha do PostgreSQL desse computador e ajuste host, porta e usuário se necessário.
4. Gere um segredo com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` e coloque o resultado em `JWT_SECRET` no `.env`.
5. Crie um banco vazio chamado `peludinhos` no PostgreSQL. Execute `database/banco_peludinhos.sql` nele pelo Query Tool do pgAdmin, uma única vez. Se o banco já foi configurado, não execute o script novamente.
6. Execute `npm start`: ele compila o React e inicia o Express. Abra http://localhost:3001 (ou a porta definida em `PORT`).
7. Clique em **Criar conta** e depois faça login.

O `.env` e as fotos enviadas não são versionados. Cada computador usa suas credenciais e seu banco. Nunca coloque senhas em variáveis `VITE_`, pois elas são públicas no frontend.

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

Acesse http://127.0.0.1:5173. O Vite encaminha `/api` e `/uploads` para o Express na porta configurada no `.env`. O CSS é recompilado automaticamente pelo Vite.

Para gerar os arquivos finais: `npm run build`. Para servir a versão compilada: `npm start`.

## Estrutura

- `src/pages`: telas em componentes React/JSX.
- `src/components`: menu compartilhado e mapa Leaflet com limpeza ao sair da tela.
- `src/App.jsx`: rotas, compatibilidade com URLs antigas e proteção das telas.
- `src/api.js`: chamadas à API e tratamento de sessão expirada.
- `src/styles.css`: Tailwind e estilos do frontend.
- `public/assets`: imagens e ícones públicos.
- `server`: API Express e conexão com PostgreSQL.
- `database`: script SQL.
- `dist`: build gerado, ignorado pelo Git.

Os HTMLs, CSS e scripts antigos foram mantidos na pasta `legacy` apenas como referência visual. Eles não são servidos pela aplicação. O único HTML de entrada é `index.html`, que carrega o React; não o abra diretamente no navegador.

Cadastro, login, edição do perfil, alteração de senha e foto de perfil usam a API. A foto de perfil pode ser enviada depois do cadastro. O módulo de perdidos permite publicar, editar, excluir e marcar como encontrado, com dados em `Publica_Perda`; ainda não está vinculado a `Animal`.

## Registrar e consultar avistamentos

O formulário **Novo avistamento** tem quatro etapas: **Foto → Informações → Saúde → Localização**. Aceita uma foto JPG, PNG ou WEBP de até 5 MB (opcional). O local é escolhido tocando no mapa, arrastando o ponto, informando coordenadas ou usando a localização do navegador com a permissão do usuário.

Na etapa **Informações**, selecione um animal existente ou escolha **Não reconheço: publicar sem cadastro de animal**. Um animal existente recebe apenas outro avistamento ligado ao seu `id_animal`; seu cadastro não é alterado. Um relato não identificado salva as características observadas no próprio avistamento, com `id_animal` nulo, sem criar um registro em `Animal`. Não há união automática de animais semelhantes nem concessão de tutela ou permissão de edição ao registrar um avistamento. A associação posterior de um relato sem identificação ainda não está implementada.

Foto, observação, coordenadas, data de publicação e saúde pertencem a cada avistamento. As características também são preservadas na ocorrência: quando há vínculo, a API copia os dados do animal no momento da publicação. Em **Detalhes do avistamento**, use **Ver cadastro e histórico** para consultar até 200 ocorrências ou **Vi este animal novamente** para iniciar outro registro vinculado ao mesmo animal. Relatos não identificados aparecem no mapa e na lista `/avistamentos`, com indicação de que não têm cadastro vinculado.

**Banco já existente:** antes de iniciar esta versão da API, execute pelo Query Tool do pgAdmin no banco `peludinhos`, nesta ordem:

1. `database/migrations/001_saude_avistamento.sql`: adiciona saúde por ocorrência e índice para o histórico. Recupera a saúde antiga apenas de animais com exatamente um avistamento; quando há vários, o valor histórico fica desconhecido.
2. `database/migrations/002_avistamento_sem_cadastro.sql`: permite `id_animal` nulo e adiciona características observadas, preservando as informações dos registros já existentes.

Não execute novamente o SQL inicial. As migrações podem ser repetidas sem sobrescrever ocorrências novas. Não removem ou unem cadastros antigos. A coluna antiga `Animal.estado_saude` fica por compatibilidade, mas não é usada pela API de avistamentos. Bancos novos usam o SQL inicial atualizado.

## Cadastro independente de animais

A aba **Animais** (`/animais`) lista um cartão por cadastro, com busca, filtro por espécie e páginas de 50 registros. **Cadastrar animal** abre `/animais/novo`, com nome, espécie, raça, cor, sexo e foto opcional. O PostgreSQL gera o identificador. Esse fluxo cria apenas `Animal`, sem localização ou avistamento. O cadastro começa como `Pendente`, inclusive se o cliente tentar enviar outro status. A foto de identificação é independente das fotos das ocorrências.

A página de cadastro e histórico mostra o cadastro, o estado de validação e os avistamentos vinculados. Cadastro não comprova tutela nem validação municipal. Edição independente, documentos, painel da prefeitura e integração dos perdidos com `Animal` ficam para etapas posteriores. O módulo de perdidos existente continua usando `Publica_Perda`.

O autor vem do token de login; as coordenadas e os campos são validados no servidor. A foto fica em `server/uploads` e seu caminho é salvo no banco. Se a gravação falhar, a API desfaz a transação e remove a foto enviada.

O registro aparece no mapa Leaflet/OpenStreetMap, nos avistamentos recentes e na lista de animais avistados. O cartão e o marcador abrem os detalhes daquele avistamento, incluindo sua saúde. Ao publicar, o ponto novo é destacado. A lista busca até 200 avistamentos mais recentes; é atualizada ao entrar na tela, voltar à aba ou acionar **Atualizar**. As duas telas usam os mesmos dados da API e não têm pontos de exemplo fixos.

Rotas autenticadas:

- `POST /api/avistamentos`: para animal existente, multipart com `id_animal`, `latitude`, `longitude` e, opcionalmente, `estado_saude`, `observacao` e `foto`. Não envie características do animal nesse modo. Para relato não identificado, omita `id_animal` e envie `especie` e, opcionalmente, `nome`, `raca`, `cor` e `genero`, além dos dados da ocorrência. Esse endpoint nunca cria animais.
- `GET /api/avistamentos`: listagem por data decrescente; `?limit=1..500` limita os resultados (padrão 200).
- `GET /api/avistamentos/:id`: dados de um avistamento específico.
- `POST /api/animais`: cadastro independente multipart com `especie` e campos opcionais `nome`, `raca`, `cor`, `genero` e `foto`. Exige conta ativa, usa o autor do token e força validação pendente.
- `GET /api/animais?q=texto&especie=Gato&offset=0`: consulta até 50 cadastros para seleção explícita por identificação, nome ou características. Retorna `has_more` para paginação. Não retorna dados do usuário cadastrador.
- `GET /api/animais/:id/avistamentos`: dados básicos do animal e seus até 200 avistamentos mais recentes.

Para testar com o PostgreSQL configurado no `.env`: `npm run test:avistamentos`. O teste inicia um servidor em uma porta temporária e cria e remove somente seus próprios dados de teste. Verifica autenticação, validação, upload, persistência, detalhes, ordenação e conta desativada.

## Organização das branches

- `perdidos`: contribuição do Matheus, mantida sem alterações por este trabalho.
- `cadastro_animais`: cadastro independente, listagem de animais e consulta de cadastro/histórico, a partir de `perdidos`.
- `avistamentos`: depende de `cadastro_animais` e acrescenta relatos vinculados ou não identificados, saúde e características por ocorrência e migrações do banco.

Para integrar por etapas, primeiro revise `cadastro_animais` em relação a `perdidos`; depois revise `avistamentos` em relação a `cadastro_animais`. Não aplicar apenas o commit de avistamentos sem o cadastro. Não houve merge em `main` ou `perdidos`.

Testes: `npm run test:animais`, `npm run test:avistamentos` e `npm run test:perdidos`. O teste de cadastro pode ser executado independentemente; os testes de avistamentos desta branch exigem as duas migrações já descritas.
