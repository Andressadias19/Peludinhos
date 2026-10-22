# Peludinhos — React + Express + PostgreSQL

O frontend usa React, React Router, Vite e Tailwind CSS. A API continua em Node.js/Express e os dados de usuários ficam no PostgreSQL.

## Acompanhamento acadêmico

Sistema para mapeamento de avistamentos e acompanhamento de animais em Santarém. A atualização de 22/10/2026 está descrita em [Estado da entrega](docs/ESTADO-DA-ENTREGA.md). A divisão de responsabilidades e os próximos passos estão em [Contribuições e planejamento](docs/CONTRIBUICOES.md).

Este novo repositório foi organizado para o professor acompanhar o desenvolvimento. Ele começa com uma cópia da versão existente em 22/10/2026, sem importar o histórico de commits anterior. As próximas atualizações serão registradas por aqui. O primeiro commit representa a importação da base existente, não a autoria individual de todo o código.

Os documentos distinguem funcionalidades implementadas de atividades planejadas e descrevem as contribuições anteriores.

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

Cadastro, login, edição do perfil, alteração de senha e foto de perfil usam a API. A foto de perfil pode ser enviada depois do cadastro. A tela de perdidos ainda é demonstrativa.

## Registrar e consultar avistamentos

O formulário **Novo avistamento** tem quatro etapas: **Foto → Informações → Saúde → Localização**. Aceita uma foto JPG, PNG ou WEBP de até 5 MB (opcional). O local é escolhido tocando no mapa, arrastando o ponto, informando coordenadas ou usando a localização do navegador com a permissão do usuário.

Ao publicar, a API cria o animal e o avistamento em uma única transação nas tabelas existentes. Não é necessário recriar o banco ou executar novamente o SQL. O autor vem do token de login; as coordenadas e os campos são validados no servidor. A foto fica em `server/uploads` e seu caminho é salvo no banco. Se a gravação falhar, a API desfaz a transação e remove a foto enviada.

O registro aparece no mapa Leaflet/OpenStreetMap, nos avistamentos recentes e na lista de animais avistados. O cartão e o marcador abrem os detalhes daquele avistamento, incluindo sua saúde. Ao publicar, o ponto novo é destacado. A lista busca até 200 avistamentos mais recentes; é atualizada ao entrar na tela, voltar à aba ou acionar **Atualizar**. As duas telas usam os mesmos dados da API e não têm pontos de exemplo fixos.

Rotas autenticadas:

- `POST /api/avistamentos`: formulário multipart com `especie`, `latitude`, `longitude` e, opcionalmente, `nome`, `raca`, `cor`, `genero`, `estado_saude`, `observacao` e o arquivo `foto`.
- `GET /api/avistamentos`: listagem por data decrescente; `?limit=1..500` limita os resultados (padrão 200).
- `GET /api/avistamentos/:id`: dados de um avistamento específico.

Para testar com o PostgreSQL configurado no `.env`: `npm run test:avistamentos`. O teste inicia um servidor em uma porta temporária e cria e remove somente seus próprios dados de teste. Verifica autenticação, validação, upload, persistência, detalhes, ordenação e conta desativada.
