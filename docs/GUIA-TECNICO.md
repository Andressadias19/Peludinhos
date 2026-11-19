# Guia técnico de configuração

Este guia reúne a configuração de desenvolvimento, o acesso administrativo e a execução dos testes. Para a demonstração containerizada, consulte [Containers](CONTAINERS.md). Para consultar as rotas da API, veja [API](API.md).

## Requisitos

- Node.js 24.
- PostgreSQL 17 ou superior para desenvolvimento e testes locais, ou Docker Desktop para a demonstração.
- Git para clonar e atualizar o repositório.

## Desenvolvimento local com Node.js e PostgreSQL

1. Clone o repositório e instale as dependências:

   ```powershell
   npm ci
   ```

2. Copie `.env.example` para `.env` e configure as variáveis do banco local, principalmente `DB_PASSWORD`. Gere um `JWT_SECRET` próprio para esse ambiente:

   ```powershell
   Copy-Item .env.example .env
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

3. Crie um banco vazio chamado `peludinhos` e execute [database/banco_peludinhos.sql](../database/banco_peludinhos.sql) uma vez. O script contém a estrutura final para um banco novo e não cria registros de demonstração.

   Para um banco existente, não execute novamente o script inicial. Aplique apenas as migrações ainda pendentes, na ordem indicada em [database/migrations](../database/migrations).

4. Inicie frontend e API em terminais separados:

   ```powershell
   # Terminal 1
   npm run dev:api
   ```

   ```powershell
   # Terminal 2
   npm run dev
   ```

   Acesse http://localhost:5173. O Vite encaminha as requisições da API para o Express.

Para compilar o frontend e servir frontend e API em uma porta, use `npm run start:full` e acesse http://localhost:3001. O comando `npm start` inicia somente a API.

## Primeiro administrador

A promoção é feita diretamente no banco. Depois de criar uma conta pelo sistema, confira o e-mail e promova somente a conta desejada:

```sql
SELECT id_usuario, nome, email, tipo_usuario, ativo
FROM usuario
WHERE email = lower('email-do-administrador@exemplo.com');

UPDATE usuario
SET tipo_usuario = 'administrador'
WHERE email = lower('email-do-administrador@exemplo.com')
  AND ativo = TRUE
  AND tipo_usuario = 'usuario'
RETURNING id_usuario, email, tipo_usuario;
```

O backend confere o papel administrativo no banco nas rotas protegidas.

## Hospedagem e armazenamento

A versão publicada usa o Render para frontend e API, PostgreSQL hospedado no Supabase e Supabase Storage para imagens. O ambiente local do Docker Compose é independente: usa um PostgreSQL em container e volumes locais para as imagens.

As credenciais de banco, JWT e Supabase devem ficar nas variáveis privadas do serviço backend, nunca no frontend nem no Git. Toda variável `VITE_*` é incorporada ao JavaScript público do navegador. As instruções para configurar os containers estão em [docs/CONTAINERS.md](CONTAINERS.md).

## Testes automatizados

Os testes de integração usam um banco PostgreSQL local exclusivo chamado `peludinhos_test`; não usam o banco de desenvolvimento, o Supabase ou o banco do Render.

1. Crie um usuário e banco dedicados, conectando ao banco `postgres` como administrador:

   ```sql
   CREATE ROLE peludinhos_test_user LOGIN PASSWORD 'troque-esta-senha'
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
   CREATE DATABASE peludinhos_test OWNER peludinhos_test_user
       ENCODING 'UTF8' TEMPLATE template0;
   COMMENT ON DATABASE peludinhos_test IS 'peludinhos:testes-automatizados';
   REVOKE ALL ON DATABASE peludinhos_test FROM PUBLIC;
   ```

2. Copie `.env.test.example` para `.env.test`, preencha a senha do usuário de testes e gere um `JWT_SECRET` diferente dos outros ambientes:

   ```powershell
   Copy-Item .env.test.example .env.test
   ```

3. Prepare o banco e rode as suítes:

   ```powershell
   npm run test:preparar
   npm test
   ```

Os testes bloqueiam a execução se a conexão não for local ou se o banco não tiver o marcador de testes. Não configure credenciais do Supabase em `.env.test`.

## Documentação relacionada

- [Estado da entrega](ESTADO-DA-ENTREGA.md)
- [Contribuições e planejamento](CONTRIBUICOES.md)
- [Contrato da API](openapi.json)
- [Containers e Docker Compose](CONTAINERS.md)
