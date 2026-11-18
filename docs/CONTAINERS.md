# Ambiente Docker local

O Docker Compose monta uma versão independente do Peludinhos com três serviços: frontend React/Vite servido pelo Nginx, API Node/Express e PostgreSQL. O Nginx encaminha `/api` e `/uploads` para a API. A API se conecta ao serviço `db` pela rede interna do Compose e grava fotos em volumes locais.

Este ambiente **não usa Render nem Supabase**. Os dados e as imagens são próprios do Docker local e não aparecem no site hospedado. Na primeira inicialização, o banco recebe a estrutura SQL, as migrações e dados fictícios de demonstração; nenhum registro do Supabase é copiado.

## Requisitos

- Docker Desktop instalado e aberto, com o mecanismo de containers Linux ativo.
- Windows com WSL 2 habilitado (backend recomendado pelo Docker Desktop).

## Preparar credenciais locais

Na raiz do repositório, copie o exemplo:

```powershell
Copy-Item .env.docker.example .env.docker
```

Edite `.env.docker` e preencha `POSTGRES_PASSWORD`, `JWT_SECRET` e `DEMO_ADMIN_PASSWORD`. Gere valores fortes com:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Execute o comando três vezes, usando um valor diferente para cada variável. O formato hexadecimal evita caracteres que precisariam ser codificados na URL do banco. Use uma senha de demonstração com pelo menos 12 caracteres. O arquivo `.env.docker` é ignorado pelo Git; nunca o envie ao repositório.

## Iniciar e acessar

```powershell
docker compose --env-file .env.docker up --build
```

Na primeira execução, o Compose constrói as imagens, cria o banco, executa `database/banco_peludinhos.sql` e as migrações em ordem, prepara a conta e os registros fictícios e só então libera API e frontend. Abra <http://localhost:8080>.

Entre com o e-mail configurado em `DEMO_ADMIN_EMAIL` (por padrão, `demo@peludinhos.local`) e a senha que você definiu em `DEMO_ADMIN_PASSWORD`. Essa conta administrativa existe somente no banco local do Compose.

## Serviços e persistência

- `web`: entrega os arquivos compilados do frontend e encaminha as rotas da API e fotos para `api`.
- `api`: valida as requisições, aplica as regras do sistema, consulta `db` e armazena fotos localmente.
- `db`: PostgreSQL 17, disponível para os outros containers pelo hostname `db`; a porta do banco não é publicada no computador.
- `postgres-data`, `uploads-public` e `uploads-private`: volumes Docker que preservam banco, fotos públicas e fotos privadas após parar ou recriar containers.

Os dados de demonstração incluem animais e avistamentos fictícios em Santarém, sem fotos nem dados pessoais reais. A carga é idempotente: reiniciar o Compose não duplica os animais ou avistamentos de demonstração.

Para parar os serviços, pressione `Ctrl+C` ou use:

```powershell
docker compose --env-file .env.docker down
```

Esse comando mantém os volumes. **O comando abaixo apaga o banco e as fotos locais de forma permanente:**

```powershell
docker compose --env-file .env.docker down --volumes
```

Use-o somente quando quiser começar a demonstração do zero. O PostgreSQL executa os scripts de inicialização apenas quando o volume do banco está vazio; alterações posteriores nas migrações não são aplicadas automaticamente a um volume já criado.
