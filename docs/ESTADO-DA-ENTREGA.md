# Estado da entrega — 11/11/2026

## Resumo

O Peludinhos é uma aplicação web que reúne avistamentos comunitários de animais em situação de rua para consulta e apoio ao planejamento de ações públicas. A área de animais perdidos atende outro cenário — animais domésticos desaparecidos — e ainda usa uma estrutura de dados própria.

## Implementado

- Frontend em React e Vite, API REST em Node.js e Express e persistência em PostgreSQL.
- Cadastro, autenticação e edição do perfil de usuário.
- Cadastro independente de animais. Cada cadastro tem identificador do banco, informações gerais e status inicial de validação **Pendente**. O usuário que criou pode editar o cadastro; a edição volta o status para Pendente.
- Publicação de avistamentos vinculados a um cadastro ou sem identificação. Fotos, localização, data, observação e saúde observada são dados da ocorrência. Um relato sem identificação não cria automaticamente um registro em `Animal`.
- Histórico de ocorrências por animal e solicitação cidadã para propor a associação entre um avistamento não identificado e um cadastro existente.
- Mapa Leaflet/OpenStreetMap, obtenção opcional da localização atual mediante permissão do navegador e agregação de avistamentos em quadrículas por período e dimensão escolhida.
- Módulo de animais perdidos com publicação, edição, atualização de status e exclusão pelo autor. Esse módulo ainda não está ligado aos cadastros de `Animal`.
- Testes automatizados dos módulos de animais, avistamentos e perdidos estão presentes em `tests/`. A existência desses testes não significa que foram executados nesta atualização documental.

## Validação de cadastros e solicitações de associação

O sistema persiste e exibe o status **Pendente** do cadastro, mas ainda não existe perfil municipal, autorização por papel, painel ou endpoint para a prefeitura revisar e alterar esse status. Portanto, nenhum cadastro pode ser validado pela prefeitura no estado atual.

Quando uma pessoa solicita a associação de um avistamento sem identificação, a API grava o pedido com status **PENDENTE** e mantém `id_animal` vazio no avistamento. A pessoa recebe a confirmação do envio; o avistamento pode indicar que há uma solicitação pendente. Ainda não há uma caixa de entrada municipal para consultar a lista dos pedidos e suas justificativas, nem ações para aprovar, recusar ou solicitar correções. Assim, o pedido fica armazenado, mas não pode ser analisado ou concluído pela prefeitura.

## Dados, comunicação e operação

O frontend consulta a API por HTTP. O mapa e as listas atualizam ao abrir ou retornar às telas ou quando a pessoa solicita atualização; ainda não há WebSocket ou Server-Sent Events. O PostgreSQL é configurado localmente por variáveis de ambiente, e fotos ficam no armazenamento local do servidor. Para uso compartilhado remoto, ainda é necessário implantar a API e o banco em um ambiente acessível.

## Próximos passos

1. Definir com a prefeitura os critérios e as informações que serão avaliados.
2. Implementar perfil municipal, permissões, listagem de cadastros e solicitações e as ações de aprovação, recusa e pedido de correção.
3. Planejar os anexos privados necessários para a análise municipal.
4. Implementar análises planejadas no mapa: regiões com maior concentração de animais, áreas com mais novos registros e incidência de animais não castrados.
5. Integrar os dados de animais perdidos aos cadastros quando os requisitos estiverem definidos; o chat de mensagens do módulo de perdidos também está planejado.
6. Planejar a versão mobile como outro cliente da mesma API.
7. Implantar API e banco em ambiente compartilhado e avaliar uma forma de atualização em tempo real.

Para detalhes de rotas e campos, consulte [API](API.md) e [OpenAPI](openapi.json). Para o histórico de contribuições e o planejamento de responsabilidades, consulte [Contribuições e planejamento](CONTRIBUICOES.md).
