# Contribuições e planejamento

Atualização: 22/10/2026.

Este documento separa contribuições anteriores de responsabilidades planejadas. Os identificadores abaixo se referem ao histórico do repositório de origem, que não foi importado neste novo repositório de acompanhamento. O commit inicial importa uma base já existente. Alterações futuras devem manter a autoria de quem efetivamente as realizou.

## Contribuições registradas

| Pessoa | Evidências no histórico de origem |
| --- | --- |
| Andressa Dias | Integração das telas com autenticação e configuração local (`3ddf664`, `ae7a2e4`); migração do frontend para React/Vite (`d68cd84`); cadastro de avistamentos com foto, saúde, localização e mapa (`6cd6a8c`); foto no marcador do mapa (`c2aa361`). |
| Matheus | Telas iniciais de login e protótipo de mapa (`9a9ddc8`, `8b06b1b`); implementação inicial de autenticação, cadastro e perfil de usuário (`91720dc`). |
| Ryani | Estrutura inicial das telas (`f10bb0a`) e correções de layout/telas (`0d1691a`, `2fffde3`). |

Andressa também informou ter realizado a modelagem inicial do banco, MER, modelo lógico e DDL, conforme o documento de metodologia entregue anteriormente. Os diagramas não foram adicionados nesta atualização.

A API recebeu contribuições em momentos e módulos diferentes: a implementação inicial de usuários/autenticação e as alterações posteriores de integração e avistamentos devem ser descritas separadamente, sem atribuir toda a API a uma única pessoa.

## Divisão proposta para as próximas entregas

Esta divisão foi organizada a partir da conversa de planejamento e precisa ser alinhada entre Andressa e Matheus. Não representa funcionalidades já concluídas nem aceite confirmado do Matheus.

### Andressa - mapa e avistamentos

- Adaptar o formulário e a API para selecionar um animal já cadastrado.
- Preservar a opção de registrar um animal ainda não identificado.
- Reaproveitar o cadastro atual e criar animal somente quando necessário.
- Separar os dados do animal dos dados de cada avistamento, incluindo saúde observada.
- Exibir histórico de avistamentos de um mesmo animal.
- Verificar que um novo avistamento vinculado não duplica o animal.

### Matheus - usuários, gerenciamento de animais e desaparecimentos

- Dar continuidade ao módulo de usuários e autenticação quando necessário.
- Reaproveitar a estrutura existente de animal para cadastro independente, consulta e edição.
- Implementar a área de animais do usuário, definindo quem pode editar cada registro. O cadastrador de um avistamento não deve ser tratado automaticamente como tutor.
- Implementar publicação de desaparecimento vinculada a um animal.
- Integrar a listagem de desaparecidos ao banco e permitir atualização da situação da busca.
- Preparar a alteração do banco para relacionar desaparecimentos e animais preservando os dados existentes.

### Em conjunto - integração

- Definir campos, identificadores, rotas e respostas usados pelos módulos.
- Usar o mesmo identificador de animal em cadastro, avistamento e desaparecimento.
- Definir permissões; avistar um animal não concede direito de editar seu cadastro.
- Não unir animais automaticamente apenas por semelhança de nome, espécie ou cor.
- Testar cadastro, desaparecimento e novo avistamento do mesmo animal, incluindo erros de comunicação.
- Registrar resultados e contribuições efetivas de cada pessoa na próxima atualização.

Um painel administrativo permanece como possibilidade de etapa posterior, sujeito aos requisitos. Ele não é pré-requisito para permitir consulta e edição pelo usuário autorizado.
