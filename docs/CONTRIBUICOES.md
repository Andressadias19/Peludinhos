# Contribuições e planejamento

Atualizado em 11/11/2026. A branch `main` contém as alterações integradas de cadastro de animais, avistamentos e mapa de calor. Os commits preservam a autoria registrada no Git. A tabela abaixo registra contribuições anteriores documentadas no histórico do repositório de origem; ela não atribui automaticamente as alterações recentes.

## Contribuições anteriores registradas

| Pessoa | Evidência no histórico de origem |
| --- | --- |
| Andressa Dias | Integração das telas com autenticação e configuração local (`3ddf664`, `ae7a2e4`); migração para React/Vite (`d68cd84`); fluxo de avistamentos com foto, saúde, localização e mapa (`6cd6a8c`); foto nos marcadores (`c2aa361`). |
| Matheus | Telas iniciais de login e protótipo de mapa (`9a9ddc8`, `8b06b1b`); implementação inicial de autenticação, cadastro e perfil de usuário (`91720dc`). |
| Andressa e Matheus | Estrutura inicial das telas (`f10bb0a`) e correções de layout (`0d1691a`, `2fffde3`). |

Andressa também realizou a modelagem inicial do banco, incluindo MER, modelo lógico e DDL, conforme o material de metodologia entregue anteriormente. Os identificadores da tabela pertencem ao histórico de origem e podem não existir no histórico Git deste repositório de acompanhamento.

## Estado e próximos trabalhos

As tarefas abaixo são continuidade planejada, não funcionalidades concluídas:

- **Validação municipal:** definir critérios com a prefeitura e implementar perfil e permissões municipais, uma caixa de entrada para cadastros e solicitações de associação, consulta dos dados necessários e ações para aprovar, recusar ou pedir correção. Atualmente, o status Pendente é persistido, e as solicitações de associação são armazenadas, mas não há painel nem fluxo de análise municipal.
- **Mapa:** desenvolver análises para regiões com maior concentração de animais, áreas com mais novos registros e incidência de animais não castrados. A concentração de avistamentos por quadrículas, período e tamanho configurável já está implementada.
- **Perdidos:** continuar o módulo de animais domésticos desaparecidos; o chat de mensagens está planejado para ser desenvolvido por Matheus. A integração entre publicações de perdidos e cadastro de `Animal` ainda precisa ser planejada em conjunto.
- **Mobile e implantação:** planejar um aplicativo mobile como cliente da API existente e disponibilizar API e PostgreSQL em ambiente compartilhado para uso remoto.
- **Comunicação em tempo real:** avaliar WebSocket ou Server-Sent Events. Atualmente, as telas atualizam por requisições HTTP quando abertas, revisitadas ou atualizadas manualmente.

Antes de registrar uma nova entrega, atualizar este documento com as tarefas efetivamente concluídas e as contribuições confirmadas no histórico, sem antecipar atribuições.
