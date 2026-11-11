# Peludinhos

Aplicação web comunitária para registrar e consultar avistamentos de animais em situação de rua e apoiar ações públicas. O sistema usa React/Vite no frontend, uma API Node.js/Express e PostgreSQL. O módulo **Perdidos** atende animais domésticos desaparecidos e continua separado dos cadastros de animais de rua.

## O que está implementado

- Cadastro e login de usuários.
- Cadastros independentes de animais, com busca, filtros, histórico de avistamentos e edição pelo usuário que cadastrou.
- Publicação de avistamentos vinculados a um cadastro ou sem identificação, com foto opcional, localização e informações observadas.
- Solicitação de associação de um avistamento sem identificação a um cadastro existente. O pedido é armazenado como **Pendente**, sem alterar o avistamento.
- Mapa com geolocalização opcional e agregação de avistamentos por área e período.
- Publicações de animais perdidos, com gerenciamento pelo autor.

**Limitações atuais:** a prefeitura ainda não tem perfil, permissões ou painel. Portanto, não é possível analisar solicitações nem validar, aprovar, recusar ou pedir correção de cadastros. O status **Pendente** é armazenado e exibido, mas ainda não passa por uma análise municipal. A API grava as solicitações e informa que há uma pendência no avistamento; ainda não existe uma caixa de entrada municipal para consultar os pedidos e suas justificativas. Os dados de perdidos ainda não estão associados à tabela `Animal`. O mapa atualiza por requisições HTTP, sem sincronização instantânea entre usuários. O banco está configurado localmente.

## Executar localmente

Requisitos: Node.js 24 ou superior e PostgreSQL 17 ou superior.

1. Instale as dependências com `npm ci`.
2. Copie `.env.example` para `.env` e configure as credenciais locais do PostgreSQL e `JWT_SECRET`.
3. Crie um banco chamado `peludinhos` e execute `database/banco_peludinhos.sql` uma única vez. Para um banco já existente, aplique somente as migrações ainda não executadas, em ordem. Não rode o script inicial sobre um banco já configurado.
4. Inicie com `npm start` e abra [http://localhost:3001](http://localhost:3001).

No PowerShell do Windows, se a política de execução bloquear `npm`, use `npm.cmd` no lugar, por exemplo `npm.cmd start`.

Para desenvolver com atualização automática, use dois terminais:

```sh
npm run dev:api
```

```sh
npm run dev
```

Abra [http://127.0.0.1:5173](http://127.0.0.1:5173). O Vite encaminha as chamadas `/api` e `/uploads` para a API local.

## Documentação

- [Estado atual e próximos passos](docs/ESTADO-DA-ENTREGA.md)
- [Contrato da API](docs/API.md) e [especificação OpenAPI](docs/openapi.json)
- [Contribuições e planejamento](docs/CONTRIBUICOES.md)

O arquivo `.env`, fotos enviadas e a pasta `dist` não devem ser publicados no Git. Nunca use variáveis `VITE_` para segredos: elas ficam acessíveis no frontend.
