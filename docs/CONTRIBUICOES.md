# Contribuições e planejamento

Atualizado em 19/11/2026. A branch `main` reúne os módulos de cadastro de animais, avistamentos, mapa de calor, painel administrativo, hospedagem com Render e Supabase e ambiente local com Docker Compose. As contribuições abaixo são descritas por atividade, sem depender de códigos de commits de históricos antigos.

## Participação no projeto

| Pessoa | Atividades registradas |
| --- | --- |
| Andressa Dias | Modelagem inicial do banco de dados; migração da interface para React/Vite; integração de telas com a API; cadastro independente de animais; publicação de avistamentos com foto, saúde e localização; visualização geográfica e mapa de calor; configuração do ambiente local com Docker Compose. |
| Matheus | Módulo de animais perdidos; painel administrativo e fluxos de análise de cadastros e solicitações de associação; publicação inicial da aplicação no Render, com PostgreSQL e armazenamento de imagens no Supabase. |
| Andressa e Matheus | Estrutura inicial das telas, ajustes de layout, integração dos módulos e preparação da versão atual do projeto. |

## Estado e próximos trabalhos

As tarefas abaixo são continuidade planejada, não funcionalidades concluídas:

- **Validação municipal:** o painel administrativo e a análise de cadastros de animais e solicitações de associação estão implementados. O administrador pode aprovar ou recusar as solicitações; a recusa de um cadastro pode incluir justificativa. Ainda é necessário definir com a prefeitura os critérios e as informações que serão considerados na validação. O acesso administrativo é feito por papel de administrador, promovido diretamente no banco; ainda não há um perfil municipal separado.
- **Mapa:** a concentração de avistamentos por quadrículas, período e tamanho configurável já está implementada. Permanecem planejadas análises de regiões com maior concentração de animais cadastrados, áreas com mais novos registros e incidência de animais não castrados.
- **Perdidos:** o módulo de animais desaparecidos está implementado. O chat de mensagens está planejado para ser desenvolvido por Matheus. A integração entre publicações de perdidos e o cadastro de animais ainda precisa ser discutida em conjunto.
- **Mobile:** planejar um aplicativo mobile como outro cliente da API existente.
- **Comunicação em tempo real:** avaliar WebSocket ou Server-Sent Events. Atualmente, as telas atualizam por requisições HTTP quando abertas, revisitadas ou atualizadas manualmente.

Antes de registrar uma nova entrega, atualizar este documento com as tarefas efetivamente concluídas e as contribuições confirmadas, sem antecipar atribuições.
