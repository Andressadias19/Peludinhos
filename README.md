# Peludinhos

O Peludinhos é uma aplicação web que ajuda cidadãos e poder público a registrar e acompanhar animais em situação de rua em Santarém. A plataforma também inclui um módulo para divulgar animais domésticos desaparecidos.

**[Acessar o sistema publicado](https://peludinhos-frontend.onrender.com/)**

## Principais recursos

- Cadastro independente de animais, com informações de identificação e análise administrativa.
- Publicação de avistamentos com foto, localização e condições de saúde observadas, vinculados a um animal ou sem identificação.
- Mapa com registros e análise da concentração de avistamentos por período e tamanho de área.
- Publicações de animais desaparecidos e contato com quem registrou o desaparecimento.
- Painel administrativo para analisar cadastros e solicitações de associação e gerenciar registros.

## Tecnologias

- **Frontend:** React, Vite, React Router e Leaflet com OpenStreetMap.
- **API:** Node.js e Express, com autenticação JWT.
- **Dados e imagens na hospedagem:** PostgreSQL e Supabase Storage.
- **Demonstração local:** Docker Compose com frontend, API e PostgreSQL em três containers.

## Executar a demonstração local

É necessário ter o Docker Desktop instalado e em execução. Na raiz do repositório, crie o arquivo de configuração:

```powershell
Copy-Item .env.docker.example .env.docker
```

Preencha as variáveis indicadas em `.env.docker` e inicie os serviços:

```powershell
docker compose --env-file .env.docker up --build
```

Acesse http://localhost:8080. A demonstração Docker usa dados fictícios, banco e imagens locais; ela é independente da versão hospedada. Para configuração, conta de demonstração e demais comandos, consulte o [guia de containers](docs/CONTAINERS.md).

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [Estado da entrega](docs/ESTADO-DA-ENTREGA.md) | Funcionalidades implementadas, limitações e arquitetura atual. |
| [Contribuições e planejamento](docs/CONTRIBUICOES.md) | Participação no projeto e próximos trabalhos. |
| [Guia técnico](docs/GUIA-TECNICO.md) | Desenvolvimento local, banco de dados, administração e testes. |
| [Documentação da API](docs/API.md) | Rotas e comportamento da API. |
| [Contrato OpenAPI](docs/openapi.json) | Especificação da API em formato OpenAPI. |
| [Containers](docs/CONTAINERS.md) | Configuração e operação do Docker Compose. |

Credenciais e arquivos `.env` são locais e não devem ser enviados ao GitHub. Chaves privadas do Supabase ficam somente nas configurações do backend.
