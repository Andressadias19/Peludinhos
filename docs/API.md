# API do Peludinhos — estado atual

Contrato revisado em **11/11/2026**, a partir das rotas e controllers do projeto. Arquivo importável: [openapi.json](openapi.json), em OpenAPI 3.0.3 ([especificação oficial](https://spec.openapis.org/oas/v3.0.3.html)).

O projeto continua com **uma API Express**, disponível por padrão em `http://localhost:3001`. As categorias abaixo representam módulos, não serviços independentes. A documentação não muda o comportamento da aplicação.

## Consultar o contrato

Importe `docs/openapi.json` em um visualizador compatível, como Swagger Editor, ou em um cliente com importação OpenAPI. O arquivo descreve 27 operações: campos, parâmetros, formatos, respostas, autenticação, exemplos fictícios e limitações. Não contém senhas, tokens reais ou dados do `.env`.

As URLs na especificação incluem `/api`; o servidor é `http://localhost:3001`, sem duplicar esse prefixo. Se `PORT` for diferente, ajuste a URL do servidor no cliente. Não foi adicionada uma página `/api/docs` à aplicação.

## Autenticação e formatos

`POST /api/login` retorna um JWT válido por 8 horas. Nas operações protegidas, envie:

```http
Authorization: Bearer <token retornado pelo login>
```

Cadastro de usuário, login, diagnóstico e arquivos de `/uploads` são públicos. Os demais endpoints exigem token. A verificação de conta ativa também acontece no login, nos métodos de perfil e na criação de animais e avistamentos. O middleware JWT, sozinho, não consulta o estado da conta no banco; não presumir essa checagem em todas as rotas de perdidos.

IDs PostgreSQL `BIGINT` são retornados como **strings**, por exemplo `"12"`. O máximo é `9223372036854775807`. Coordenadas são números nas respostas. Datas de publicação são timestamps; `data_desaparecimento` é devolvida como `YYYY-MM-DD`.

Erros tratados normalmente usam `{"erro":"mensagem"}`. Erros de parsing JSON e alguns erros do Express/arquivos podem retornar texto ou HTML: ainda não existe um tratamento global que padronize todas as falhas.

## Operações existentes

| Módulo | Método e caminho | Resultado |
| --- | --- | --- |
| Diagnóstico | `GET /api` | Confirma que a API responde |
| Diagnóstico | `GET /api/teste-banco` | Testa PostgreSQL com `SELECT NOW()` |
| Autenticação | `POST /api/login` | Retorna token e usuário |
| Usuários | `POST /api/usuarios` | Cria usuário |
| Usuários | `GET /api/usuarios/me` | Consulta perfil autenticado |
| Usuários | `PATCH /api/usuarios/me` | Altera nome e/ou telefone |
| Usuários | `PATCH /api/usuarios/me/senha` | Altera senha |
| Usuários | `PUT /api/usuarios/me/foto` | Envia foto como corpo binário bruto |
| Usuários | `DELETE /api/usuarios/me/foto` | Remove foto |
| Animais | `GET /api/animais` | Busca cadastros com filtros e paginação |
| Animais | `POST /api/animais` | Cadastra animal, sem criar avistamento |
| Animais | `GET /api/animais/{id}/editar` | Carrega o cadastro próprio para edição |
| Animais | `PUT /api/animais/{id}` | Atualiza cadastro próprio e reinicia validação |
| Animais | `GET /api/animais/{id}/avistamentos` | Retorna cadastro e histórico |
| Avistamentos | `GET /api/avistamentos` | Lista relatos vinculados e não identificados |
| Avistamentos | `GET /api/avistamentos/heatmap` | Agrega relatos em quadrículas por período |
| Avistamentos | `POST /api/avistamentos` | Publica relato, sem criar animal |
| Avistamentos | `GET /api/avistamentos/{id}` | Consulta uma ocorrência |
| Avistamentos | `POST /api/avistamentos/{id}/solicitacoes-associacao` | Solicita vínculo de relato não identificado a cadastro; fica Pendente |
| Perdidos | `GET /api/perdidos` | Lista publicações sem contato do tutor |
| Perdidos | `POST /api/perdidos` | Publica desaparecimento |
| Perdidos | `GET /api/perdidos/{id}` | Consulta detalhes e contato do tutor |
| Perdidos | `PUT /api/perdidos/{id}` | Substitui dados editáveis da própria publicação |
| Perdidos | `PATCH /api/perdidos/{id}/status` | Alterna `PERDIDO` e `ENCONTRADO` |
| Perdidos | `DELETE /api/perdidos/{id}` | Exclui publicação própria |
| Perdidos | `GET /api/perdidos/{id}/foto` | Entrega foto privada com token |
| Arquivos | `GET /uploads/{arquivo}` | Entrega fotos públicas de perfil, animais e avistamentos |

## Fluxo: cadastrar animal e registrar avistamentos

1. Crie um usuário em `POST /api/usuarios`, se necessário, e entre por `POST /api/login`.
2. Envie `POST /api/animais` como `multipart/form-data`. `especie` é obrigatória; identificação, idade aproximada, características, situação atual, castração, vacinação, origem declarada e foto são opcionais ou têm valor padrão desconhecido.
3. Guarde `animal.id_animal` da resposta `201`. O identificador é automático, e `status_validacao` começa como `Pendente`.
4. Publique por `POST /api/avistamentos`, também multipart, com `id_animal`, `latitude`, `longitude` e, opcionalmente, `observacao`, `estado_saude` e `foto`.
5. Consulte `GET /api/animais/{id}/avistamentos` para ver o cadastro e até 200 ocorrências, da mais recente para a mais antiga.

## Fluxo: editar cadastro de animal

Somente o usuário que cadastrou o animal pode editá-lo. Consulte `GET /api/animais/{id}/editar` para carregar os campos; a operação retorna apenas cadastros próprios. Envie `PUT /api/animais/{id}` como `multipart/form-data`, com `especie` e os campos editáveis do cadastro. Sem foto nova, a foto atual é mantida; use `remover_foto=true` para removê-la. Foto nova e remoção simultâneas são rejeitadas. Toda edição redefine `status_validacao` para `Pendente`, limpa o validador e atualiza `data_atualizacao`.

Os dados estruturados incluem `idade_aproximada` (`FILHOTE`, `ADULTO`, `IDOSO`, `DESCONHECIDA`), `situacao` (`EM_SITUACAO_DE_RUA`, `RESGATADO`, `EM_TRATAMENTO`, `ACOLHIDO`, `DISPONIVEL_PARA_ADOCAO`, `ADOTADO`, `FALECIDO`, `NAO_INFORMADA`), `status_castracao` (`CASTRADO`, `NAO_CASTRADO`, `DESCONHECIDO`) e `status_vacinacao` (`ATUALIZADA`, `INCOMPLETA`, `DESCONHECIDA`). `caracteristicas` aceita até 500 caracteres. `fonte_informacao` pode ser `OBSERVACAO_DIRETA`, `INFORMADO_POR_TERCEIRO`, `REGISTRO_VETERINARIO` ou `NAO_INFORMADA`; indica origem declarada, não verificada. `data_atualizacao` é gerada pelo servidor e permanece nula para cadastros anteriores à migração. Valores desconhecidos não devem ser tratados como “não castrado” ou “incompleto”.

Exemplo de campos do avistamento vinculado, **não um corpo JSON**:

```text
id_animal: 12
latitude: -2.443
longitude: -54.7083
observacao: Perto da praça.
estado_saude: Aparentava estar bem.
foto: [arquivo opcional]
```

Não envie `nome`, `especie`, `raca`, `cor` ou `genero` nesse modo, nem com valor vazio: a API rejeita a tentativa. Ela copia as características do cadastro na ocorrência e não altera o animal. Vários relatos podem usar o mesmo identificador, inclusive enquanto a validação está pendente.

## Fluxo: publicar animal não identificado

Envie `POST /api/avistamentos` como multipart **omitindo `id_animal`**. Informe `especie`, `latitude` e `longitude`. As características observadas, foto, saúde e observação são opcionais.

```text
especie: Cachorro
cor: Caramelo
latitude: -2.443
longitude: -54.7083
observacao: Animal sem identificação perto da praça.
estado_saude: Estava mancando.
```

A resposta tem `avistamento.id_animal: null`. Nenhum registro é criado em `Animal`. O relato aparece no mapa e na listagem. Não há união automática por características semelhantes. A associação pode ser solicitada e fica Pendente até a futura análise municipal.

## Solicitar associação de avistamento

Em `POST /api/avistamentos/{id}/solicitacoes-associacao`, envie JSON com `id_animal` e `justificativa` (20 a 1000 caracteres). A API salva uma solicitação Pendente, sem alterar `Avistamento.id_animal`. Há no máximo uma solicitação pendente por avistamento. O detalhe e a listagem de avistamentos podem indicar `associacao_pendente`; isso informa apenas que existe um pedido e não expõe uma caixa de entrada municipal com os pedidos e justificativas. Não há endpoint para listar, analisar, aprovar, recusar ou solicitar correção. O pedido fica persistido, mas só uma futura decisão municipal poderá aplicar o vínculo.

## Busca, paginação e fotos

- `GET /api/animais?q=Bob&especie=Cachorro&offset=0`: até 50 cadastros, ordenados pelo identificador decrescente. `has_more` indica se há outra página; avance `offset` em 50. A busca é literal, ignora maiúsculas e aceita até 100 caracteres.
- `GET /api/avistamentos?limit=200` e `GET /api/perdidos?limit=200`: limite entre 1 e 500. As listas são ordenadas pela data e pelo identificador decrescentes. Não possuem paginação por offset.
- `GET /api/avistamentos/heatmap?dias=30&metros=500`: agrega todos os relatos por quadrículas com dimensão aproximada. `metros` aceita qualquer valor inteiro entre `50` e `50000`; `dias` aceita `30`, `90`, `365` ou `0` para todo o período. Para consultar datas específicas, envie `inicio=AAAA-MM-DD&fim=AAAA-MM-DD`; ambas as datas são obrigatórias e o dia final é incluído por inteiro. A resposta não é limitada aos 200 itens da listagem; cada valor conta avistamentos, não animais únicos.
- O histórico de um animal retorna no máximo 200 ocorrências e não recebe `limit` ou `offset`.
- Espécies aceitas nos novos cadastros/relatos: `Cachorro`, `Gato`, `Outro`. Sexo: `Macho`, `Fêmea` ou vazio.
- Uploads: JPG, PNG ou WEBP; até 5 MiB, uma foto por requisição. Fotos de animais, avistamentos e perdidos usam multipart no campo `foto`. Foto de perfil usa **o arquivo inteiro como corpo**, com `Content-Type: image/jpeg`, `image/png` ou `image/webp`.
- Fotos de perdidos exigem `Authorization` em `GET /api/perdidos/{id}/foto`; use `fetch` autenticado e um Blob para exibir no navegador. Não ficam disponíveis por `/uploads`.

## Particularidades de perdidos e perfil

Perdidos usa `Publica_Perda`, sem vínculo com `Animal`. Para publicar, o usuário precisa ter telefone no perfil. A listagem não devolve contato; os detalhes retornam `tutor_nome`, `tutor_telefone` e `eh_autor`.

Somente o autor pode editar, alterar status ou excluir. No `PUT`, campos opcionais ausentes ou vazios viram `null`. Sem nova foto nem `remover_foto=true`, a foto atual é mantida. Enviar foto nova e solicitar remoção na mesma requisição é inválido. Status é alterado pelo endpoint próprio, não pelo `PUT`.

No perfil, `PATCH /api/usuarios/me` aceita apenas nome e telefone, com pelo menos um campo; rejeita outros. Na troca de senha, a nova deve ter pelo menos seis caracteres, e senha atual incorreta retorna `400`, não `401`. As validações de cadastro de usuário ainda não são iguais às de alteração de perfil e senha; o contrato não atribui ao cadastro restrições que o backend não aplica.

## Limites do que está implementado

Há um status de validação do cadastro, mas ainda não existe perfil municipal, painel ou endpoint para revisar e alterar esse status; portanto, a prefeitura ainda não consegue validar cadastros. A origem das informações é declarada pelo usuário e não é verificada pela API. As solicitações de associação são gravadas e podem aparecer como pendentes no avistamento, mas não existe uma interface municipal para consultar seus dados e tomar uma decisão. Não há documentos anexados ou vínculo dos perdidos com `Animal`. Registrar avistamento não concede tutela ou autorização de edição. A documentação inclui somente endpoints existentes, sem antecipar a separação futura em serviços.
