# Estado da entrega - 12/11/2026

## Projeto

O Peludinhos é uma aplicação web para mapear avistamentos de animais, manter o cadastro dos animais da cidade, divulgar desaparecimentos e apoiar a análise desses registros por administradores. Este documento descreve o estado identificado no código nesta data.

## Tecnologias

- Frontend: React 19, React Router 7, Vite 8, Tailwind CSS 4, Leaflet com OpenStreetMap.
- Backend: uma API Node.js/Express 5, com JWT, bcrypt e multer.
- Banco: PostgreSQL, com script inicial e sete migrações (`database/migrations/001` a `007`).
- Testes: `node:test` contra a API real em porta temporária.

## Implementado

**Usuários**
- Cadastro, login com JWT (8 horas), perfil (nome e telefone), troca de senha e foto de perfil.
- E-mail sem diferença entre maiúsculas e minúsculas no cadastro e no login.
- Contas desativadas não entram e perdem imediatamente as sessões já abertas, em todas as rotas autenticadas.

**Animais**
- Cadastro independente com foto e dados estruturados (idade aproximada, características, situação, castração, vacinação e origem declarada), busca e histórico de avistamentos.
- Edição pelo cadastrador; toda edição volta o cadastro para validação Pendente.

**Avistamentos**
- Registro em quatro etapas com foto, saúde e localização (mapa, coordenadas ou localização do navegador).
- Relatos vinculados a um animal Validado ou sem identificação, com as características observadas.
- Mapa com marcadores e mapa de calor por período e tamanho de área; lista com busca e filtro.
- Solicitação de associação de um relato sem identificação a um animal Validado, analisada por um administrador.

**Desaparecimentos**
- Publicação, edição, marcação como encontrado e exclusão pelo tutor, com foto privada e contato do tutor nos detalhes.

**Painel administrativo** (`/admin`, só para `tipo_usuario = 'administrador'`, conferido no banco a cada requisição)
- Visão geral com contadores reais.
- Validação de animais (aprovar ou recusar com justificativa) e de solicitações de associação (aprovar ou recusar), com proteção contra decisões simultâneas e contra decidir sobre um cadastro alterado durante a análise.
- Gerenciamento de animais, avistamentos e desaparecimentos de qualquer usuário: listagem, busca, filtros, detalhes, cadastro, edição e exclusão segura.
- Gerenciamento de usuários: listagem, detalhes com registros vinculados, edição de nome e telefone, desativação e reativação, exclusão de contas sem histórico.

**Regras de negócio**
- Só animais Validados recebem novos vínculos; Pendentes e Recusados são bloqueados no backend, inclusive nas rotas administrativas. Vínculos anteriores são preservados.
- Guarda-se apenas a última decisão de validação; a edição pelo cadastrador volta para Pendente e limpa a decisão.
- O cadastrador vê a justificativa da recusa do próprio animal; o solicitante vê a justificativa do próprio pedido de associação recusado.
- Nenhuma exclusão apaga registros relacionados em cascata; registros com histórico vinculado não são excluídos.
- Administradores não podem desativar ou excluir a própria conta nem a de outros administradores. A promoção a administrador é feita no banco.

**Segurança**
- Respostas de erro sempre em JSON, sem stack trace, caminhos do servidor ou nomes de bibliotecas; sem o cabeçalho `X-Powered-By`.
- Consultas SQL parametrizadas; textos exibidos pelo React (sem HTML injetado).
- Fotos validadas pelo conteúdo do arquivo, até 5 MB, com nomes gerados pelo servidor.

## Testes executados nesta data

| Comando | Resultado |
| --- | --- |
| `npm run test:admin` | 67 de 67 aprovados |
| `npm run test:animais` | 5 de 5 aprovados |
| `npm run test:avistamentos` | 11 de 11 aprovados |
| `npm run test:perdidos` | 23 de 23 aprovados |
| `npm run test:seguranca` | 6 de 6 aprovados |
| `npm run build` | concluído |

Os testes usam o banco configurado no `.env` e removem os dados que criam. A interface não é coberta por testes automatizados; a verificação visual (desktop e celular) precisa ser feita manualmente no navegador.

## Limitações atuais

- `CORRECAO_SOLICITADA` existe no banco, mas não há fluxo para o solicitante corrigir um pedido de associação.
- As tabelas `Solicitacao_adocao` e `Noticia` existem, sem funcionalidade.
- `Publica_Perda` não tem referência a `Animal`.
- O cadastro de usuário não aplica no servidor todas as validações do formulário (tamanho do nome, telefone e senha mínima), e não há limite de tentativas de login.
- Fotos de perfil, animais e avistamentos são públicas por `/uploads`; apenas as de desaparecimentos são privadas.
- Os testes automatizados usam o mesmo banco do desenvolvimento.
- O mapa atualiza os dados ao entrar na tela, voltar à aba ou solicitar atualização; não há sincronização em tempo real.

## Arquitetura atual

O navegador executa o frontend React, que acessa a API Express por HTTP com o token JWT. A API grava no PostgreSQL usando transações nas operações que alteram mais de um registro ou dependem de checagens. Fotos ficam no armazenamento local do servidor (`server/uploads` e, para desaparecimentos, a pasta privada `server/uploads-perdidos`), com referência no banco.

## Próximos marcos sugeridos

1. Validar no servidor todos os campos do cadastro de usuário e limitar tentativas de login.
2. Usar um banco separado para os testes automatizados.
3. Definir o fluxo de correção de pedidos de associação (`CORRECAO_SOLICITADA`).
4. Avaliar o vínculo dos desaparecimentos com o cadastro de animais e a privacidade das fotos de perfil.

Para instalação, migrações e o primeiro administrador, consulte o README na raiz. Para responsabilidades, consulte [Contribuições e planejamento](CONTRIBUICOES.md).
