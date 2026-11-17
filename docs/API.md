# API do Peludinhos — estado atual

Contrato atualizado em **12/11/2026**, a partir das rotas e controllers do projeto. Arquivo importável: [openapi.json](openapi.json), em OpenAPI 3.0.3 ([especificação oficial](https://spec.openapis.org/oas/v3.0.3.html)).

O projeto tem **uma API Express**, disponível por padrão em `http://localhost:3001`. As categorias abaixo representam módulos, não serviços independentes.

## Consultar o contrato

Importe `docs/openapi.json` em um visualizador compatível, como Swagger Editor, ou em um cliente com importação OpenAPI. O arquivo descreve 57 operações: 27 dos usuários e 30 do painel administrativo. Não contém senhas, tokens reais ou dados do `.env`.

As URLs na especificação incluem `/api`; o servidor é `http://localhost:3001`, sem duplicar esse prefixo. Se `PORT` for diferente, ajuste a URL do servidor no cliente.

## Autenticação e formatos

`POST /api/login` retorna um JWT válido por 8 horas. Nas operações protegidas, envie:

```http
Authorization: Bearer <token retornado pelo login>
```

Cadastro de usuário, login, diagnóstico e arquivos de `/uploads` são públicos. Os demais endpoints exigem token. A cada requisição autenticada, a conta é conferida no banco:

- token ausente, inválido, expirado ou de conta inexistente: **401**;
- conta desativada: **403** com `{"erro":"Esta conta está desativada.","codigo":"CONTA_DESATIVADA"}`. Vale também para tokens emitidos antes da desativação. O frontend encerra a sessão ao receber esse código.

O e-mail é tratado sem diferença entre maiúsculas e minúsculas: o cadastro grava `trim().toLowerCase()`, o login compara da mesma forma e `Ana@exemplo.com` e `ana@exemplo.com` são a mesma conta (409 no segundo cadastro).

IDs PostgreSQL `BIGINT` são retornados como **strings**, por exemplo `"12"`. O máximo é `9223372036854775807`. Coordenadas são números nas respostas. Datas de publicação são timestamps; `data_desaparecimento` é devolvida como `YYYY-MM-DD`.

## Erros

Todos os erros retornam JSON no formato `{"erro":"mensagem"}`, sem stack trace, caminhos do servidor ou nomes de bibliotecas. Um tratamento global no `server.js` cobre o que as rotas não tratam:

| Situação | Status |
| --- | --- |
| Corpo JSON malformado | 400 — `O corpo da requisição não é um JSON válido.` |
| Corpo JSON grande demais | 413 |
| Outros erros 4xx do Express (por exemplo, endereço malformado) | mesmo código, mensagem genérica |
| Erro inesperado | 500 — `Erro interno do servidor.` (o detalhe fica só no log do servidor) |

O cabeçalho `X-Powered-By` não é enviado.

## Operações dos usuários

| Módulo | Método e caminho | Resultado |
| --- | --- | --- |
| Diagnóstico | `GET /api` | Confirma que a API responde |
| Diagnóstico | `GET /api/teste-banco` | Testa PostgreSQL com `SELECT NOW()` |
| Autenticação | `POST /api/login` | Retorna token e usuário |
| Usuários | `POST /api/usuarios` | Cria usuário (sempre do tipo `usuario`) |
| Usuários | `GET /api/usuarios/me` | Consulta perfil autenticado |
| Usuários | `PATCH /api/usuarios/me` | Altera nome e/ou telefone |
| Usuários | `PATCH /api/usuarios/me/senha` | Altera senha |
| Usuários | `PUT /api/usuarios/me/foto` | Envia foto como corpo binário bruto |
| Usuários | `DELETE /api/usuarios/me/foto` | Remove foto |
| Animais | `GET /api/animais` | Busca cadastros com filtros e paginação |
| Animais | `POST /api/animais` | Cadastra animal (nasce Pendente), sem criar avistamento |
| Animais | `GET /api/animais/{id}/editar` | Carrega o cadastro próprio para edição |
| Animais | `PUT /api/animais/{id}` | Atualiza cadastro próprio e volta para Pendente |
| Animais | `GET /api/animais/{id}/avistamentos` | Retorna cadastro e histórico |
| Avistamentos | `GET /api/avistamentos` | Lista relatos vinculados e não identificados |
| Avistamentos | `GET /api/avistamentos/heatmap` | Agrega relatos em quadrículas por período |
| Avistamentos | `POST /api/avistamentos` | Publica relato; vínculo só com animal Validado |
| Avistamentos | `GET /api/avistamentos/{id}` | Consulta uma ocorrência e a decisão do próprio pedido de associação |
| Avistamentos | `POST /api/avistamentos/{id}/solicitacoes-associacao` | Pede vínculo a um animal Validado; fica Pendente |
| Perdidos | `GET /api/perdidos` | Lista publicações sem contato do tutor |
| Perdidos | `POST /api/perdidos` | Publica desaparecimento |
| Perdidos | `GET /api/perdidos/{id}` | Consulta detalhes e contato do tutor |
| Perdidos | `PUT /api/perdidos/{id}` | Substitui dados editáveis da própria publicação |
| Perdidos | `PATCH /api/perdidos/{id}/status` | Alterna `PERDIDO` e `ENCONTRADO` |
| Perdidos | `DELETE /api/perdidos/{id}` | Exclui publicação própria |
| Perdidos | `GET /api/perdidos/{id}/foto` | Entrega foto privada com token |
| Arquivos | `GET /uploads/{arquivo}` | Entrega fotos públicas de perfil, animais e avistamentos |

## Regras de validação e vínculos

`Animal.status_validacao` aceita `Pendente`, `Validado` e `Recusado`. Todo cadastro novo é `Pendente`, e toda edição pelo cadastrador volta o status para `Pendente`, limpando validador, data e observação da decisão anterior. Só a última decisão é guardada.

Só animais **Validados** recebem novos vínculos:

| Operação | Animal Pendente ou Recusado |
| --- | --- |
| `POST /api/avistamentos` com `id_animal` (e `POST /api/admin/avistamentos`) | 409 |
| `POST /api/avistamentos/{id}/solicitacoes-associacao` | 409 |
| `POST /api/admin/validacoes/associacoes/{id}/aprovar` | 409; o pedido continua `PENDENTE` |

O status é conferido dentro da transação, com o animal travado. Vínculos existentes não são desfeitos quando um animal deixa de estar Validado. Os seletores de animal usam `GET /api/animais?validacao=Validado`.

**Justificativas:**

- `GET /api/animais/{id}/avistamentos` devolve `animal.justificativa_recusa` apenas para quem cadastrou o animal e apenas quando ele está `Recusado`. Não informa quem decidiu.
- `GET /api/avistamentos/{id}` devolve `minha_ultima_decisao` com o último pedido de associação **do próprio usuário** já decidido (`id_animal_proposto`, `status_solicitacao`, `observacao_decisao`, `data_decisao`). Para quem não fez pedido, vem `null`.

## Fluxo: cadastrar animal e registrar avistamentos

1. Crie um usuário em `POST /api/usuarios`, se necessário, e entre por `POST /api/login`.
2. Envie `POST /api/animais` como `multipart/form-data`. `especie` é obrigatória; identificação, idade aproximada, características, situação atual, castração, vacinação, origem declarada e foto são opcionais ou têm valor padrão desconhecido.
3. Guarde `animal.id_animal` da resposta `201`. O cadastro começa `Pendente` e precisa ser validado por um administrador antes de receber avistamentos vinculados.
4. Com o animal Validado, publique por `POST /api/avistamentos`, também multipart, com `id_animal`, `latitude`, `longitude` e, opcionalmente, `observacao`, `estado_saude` e `foto`.
5. Consulte `GET /api/animais/{id}/avistamentos` para ver o cadastro e até 200 ocorrências, da mais recente para a mais antiga.

Exemplo de campos do avistamento vinculado, **não um corpo JSON**:

```text
id_animal: 12
latitude: -2.443
longitude: -54.7083
observacao: Perto da praça.
estado_saude: Aparentava estar bem.
foto: [arquivo opcional]
```

Não envie `nome`, `especie`, `raca`, `cor` ou `genero` nesse modo, nem com valor vazio: a API rejeita a tentativa. Ela copia as características do cadastro na ocorrência e não altera o animal.

## Fluxo: editar cadastro de animal

Somente o usuário que cadastrou o animal pode editá-lo. Consulte `GET /api/animais/{id}/editar` para carregar os campos; a operação retorna apenas cadastros próprios. Envie `PUT /api/animais/{id}` como `multipart/form-data`, com `especie` e os campos editáveis. Sem foto nova, a foto atual é mantida; use `remover_foto=true` para removê-la. Foto nova e remoção simultâneas são rejeitadas.

Os dados estruturados incluem `idade_aproximada` (`FILHOTE`, `ADULTO`, `IDOSO`, `DESCONHECIDA`), `situacao` (`EM_SITUACAO_DE_RUA`, `RESGATADO`, `EM_TRATAMENTO`, `ACOLHIDO`, `DISPONIVEL_PARA_ADOCAO`, `ADOTADO`, `FALECIDO`, `NAO_INFORMADA`), `status_castracao` (`CASTRADO`, `NAO_CASTRADO`, `DESCONHECIDO`) e `status_vacinacao` (`ATUALIZADA`, `INCOMPLETA`, `DESCONHECIDA`). `caracteristicas` aceita até 500 caracteres. `fonte_informacao` pode ser `OBSERVACAO_DIRETA`, `INFORMADO_POR_TERCEIRO`, `REGISTRO_VETERINARIO` ou `NAO_INFORMADA`; indica origem declarada, não verificada.

## Fluxo: publicar animal não identificado e pedir associação

Envie `POST /api/avistamentos` como multipart **omitindo `id_animal`**. Informe `especie`, `latitude` e `longitude`. As características observadas, foto, saúde e observação são opcionais. A resposta tem `avistamento.id_animal: null`; nenhum registro é criado em `Animal`.

Para propor um vínculo, envie `POST /api/avistamentos/{id}/solicitacoes-associacao` com JSON `{ "id_animal": "12", "justificativa": "..." }` (20 a 1000 caracteres). O animal precisa estar Validado. A solicitação fica `PENDENTE`, sem alterar o avistamento; há no máximo uma pendente por avistamento. Depois de uma recusa, um novo pedido pode ser enviado.

## Busca, paginação e fotos

- `GET /api/animais?q=Bob&especie=Cachorro&validacao=Validado&offset=0`: até 50 cadastros, ordenados pelo identificador decrescente. `has_more` indica se há outra página; avance `offset` em 50. A busca é literal, ignora maiúsculas e aceita até 100 caracteres. `validacao` aceita `Pendente`, `Validado` ou `Recusado`.
- `GET /api/avistamentos?limit=200` e `GET /api/perdidos?limit=200`: limite entre 1 e 500, ordenados pela data e pelo identificador decrescentes.
- `GET /api/avistamentos/heatmap?dias=30&metros=500`: agrega todos os relatos por quadrículas. `metros` aceita inteiros de `50` a `50000`; `dias` aceita `30`, `90`, `365` ou `0` para todo o período. Para datas específicas, envie `inicio=AAAA-MM-DD&fim=AAAA-MM-DD`; o dia final é incluído por inteiro. Cada valor conta avistamentos, não animais únicos.
- O histórico de um animal retorna no máximo 200 ocorrências.
- Espécies aceitas: `Cachorro`, `Gato`, `Outro`. Sexo: `Macho`, `Fêmea` ou vazio.
- Uploads: JPG, PNG ou WEBP (o tipo é conferido pelo conteúdo do arquivo); até 5 MiB, uma foto por requisição. Fotos de animais, avistamentos e perdidos usam multipart no campo `foto`. Foto de perfil usa **o arquivo inteiro como corpo**, com `Content-Type: image/jpeg`, `image/png` ou `image/webp`.
- Fotos de perdidos exigem `Authorization` em `GET /api/perdidos/{id}/foto`; use `fetch` autenticado e um Blob para exibir no navegador. Não ficam disponíveis por `/uploads`.

## Particularidades de perdidos e perfil

Perdidos usa `Publica_Perda`, sem vínculo com `Animal`. Para publicar, o usuário precisa ter telefone no perfil. A listagem não devolve contato; os detalhes retornam `tutor_nome`, `tutor_telefone` e `eh_autor`. Somente o autor pode editar, alterar status ou excluir. No `PUT`, campos opcionais ausentes ou vazios viram `null`. Status é alterado pelo endpoint próprio, não pelo `PUT`.

No perfil, `PATCH /api/usuarios/me` aceita apenas nome e telefone, com pelo menos um campo; rejeita outros, inclusive `tipo_usuario`. Na troca de senha, a nova deve ter pelo menos seis caracteres, e senha atual incorreta retorna `400`, não `401`. O cadastro de usuário ainda não aplica no servidor as mesmas validações do perfil (tamanho do nome, telefone e senha mínima ficam no formulário).

## Painel administrativo (`/api/admin`)

Todas as rotas exigem token de uma conta **ativa** com `tipo_usuario = 'administrador'`, conferido no banco a cada requisição (o tipo presente no JWT é ignorado). Usuário comum recebe 403, inclusive em rotas inexistentes do painel. Não existe rota para promover ou rebaixar usuários; isso é feito no banco (veja o README). Todas as exclusões exigem o corpo `{ "confirmar": true }`.

| Área | Método e caminho | Resultado |
| --- | --- | --- |
| Geral | `GET /api/admin/me` | Identifica o administrador (id, nome, tipo) |
| Geral | `GET /api/admin/resumo` | Contadores do dashboard |
| Animais | `GET /api/admin/animais` | Lista com `q`, `status`, `especie` e `offset` (20 por página) |
| Animais | `POST /api/admin/animais` | Cadastra; o administrador é o cadastrador; nasce Pendente |
| Animais | `GET /api/admin/animais/{id}` | Detalhes, dependências e `pode_excluir` |
| Animais | `PUT /api/admin/animais/{id}` | Edita qualquer cadastro; se algo mudar, volta para Pendente |
| Animais | `DELETE /api/admin/animais/{id}` | Exclui só sem avistamentos e solicitações (409 caso contrário) |
| Avistamentos | `GET /api/admin/avistamentos` | Lista com `q`, `associacao`, `especie`, `inicio`, `fim` e `offset` |
| Avistamentos | `POST /api/admin/avistamentos` | Mesmo registro do usuário; o administrador é o autor |
| Avistamentos | `GET /api/admin/avistamentos/{id}` | Detalhes, solicitações e `pode_excluir` |
| Avistamentos | `PUT /api/admin/avistamentos/{id}` | Edita mantendo o autor; recusa `id_animal` |
| Avistamentos | `DELETE /api/admin/avistamentos/{id}` | Exclui só sem solicitações de associação (409 caso contrário) |
| Desaparecimentos | `GET /api/admin/desaparecimentos` | Lista com `q`, `status`, `especie`, `inicio`, `fim` e `offset` |
| Desaparecimentos | `POST /api/admin/desaparecimentos` | Mesma publicação do tutor; exige telefone no perfil |
| Desaparecimentos | `GET /api/admin/desaparecimentos/{id}` | Detalhes com o tutor |
| Desaparecimentos | `PUT /api/admin/desaparecimentos/{id}` | Edita mantendo tutor e data; aceita `status_perda` |
| Desaparecimentos | `DELETE /api/admin/desaparecimentos/{id}` | Exclui a publicação e depois a foto |
| Usuários | `GET /api/admin/usuarios` | Lista com `q`, `tipo`, `situacao` e `offset` |
| Usuários | `GET /api/admin/usuarios/{id}` | Detalhes com 9 contagens de registros vinculados |
| Usuários | `PATCH /api/admin/usuarios/{id}` | Edita nome e telefone (outros campos: 400) |
| Usuários | `PATCH /api/admin/usuarios/{id}/situacao` | `{ "ativo": true \| false }`; 403 para a própria conta e administradores |
| Usuários | `DELETE /api/admin/usuarios/{id}` | Exclui só conta sem registros vinculados; 403 para a própria conta e administradores |
| Validações | `GET /api/admin/validacoes/animais` | Fila de animais com `q`, `status`, `offset` e contagens |
| Validações | `GET /api/admin/validacoes/animais/{id}` | Animal com última decisão e `versao` |
| Validações | `POST /api/admin/validacoes/animais/{id}/aprovar` | `{ versao, observacao? }` → Validado |
| Validações | `POST /api/admin/validacoes/animais/{id}/recusar` | `{ versao, observacao }` → Recusado (justificativa obrigatória) |
| Validações | `GET /api/admin/validacoes/associacoes` | Fila de solicitações com `q`, `status`, `offset` e contagens |
| Validações | `GET /api/admin/validacoes/associacoes/{id}` | Avistamento, animal, histórico, `pode_aprovar` e `motivo_bloqueio` |
| Validações | `POST /api/admin/validacoes/associacoes/{id}/aprovar` | `{ observacao? }`; grava o vínculo |
| Validações | `POST /api/admin/validacoes/associacoes/{id}/recusar` | `{ observacao }`; o avistamento não muda |

**Concorrência nas decisões:** as decisões rodam em transação com o registro travado. Decidir um animal que não está mais Pendente, ou cuja `versao` mudou desde a consulta (o dono editou), retorna 409. Decidir uma solicitação que não está mais `PENDENTE` retorna 409. Aprovar exige que o avistamento continue sem vínculo e que o animal esteja Validado.

**Preservação de histórico:** nenhuma exclusão apaga registros relacionados em cascata. Animais com avistamentos ou solicitações, avistamentos com solicitações de associação e contas com qualquer registro vinculado (inclusive como validador) não são excluídos; contas com histórico podem ser desativadas.

## Limites do que está implementado

- A origem das informações do animal é declarada pelo usuário e não é verificada.
- `CORRECAO_SOLICITADA` existe no banco, mas não há fluxo para o solicitante corrigir um pedido; o painel apenas exibe e filtra esse status.
- As tabelas `Solicitacao_adocao` e `Noticia` existem no banco, sem endpoints.
- Não há limite de tentativas de login.
- Perdidos não têm vínculo com `Animal`. Registrar avistamento não concede tutela ou autorização de edição.
