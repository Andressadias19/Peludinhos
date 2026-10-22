# Estado da entrega - 22/10/2026

## Projeto

O Peludinhos é uma aplicação web para mapear avistamentos e apoiar o acompanhamento de animais. Esta atualização documenta o estado identificado no código; não representa a conclusão de todo o escopo planejado.

## Implementado

- Frontend em React/Vite, API Node.js/Express e banco PostgreSQL.
- Cadastro de usuários, login e autenticação; edição de perfil, senha e foto.
- Registro autenticado de avistamentos com características do animal, saúde observada, localização e foto opcional.
- Gravação de animal e avistamento na mesma transação, com validação no servidor.
- Consulta dos avistamentos, mapa Leaflet, marcadores com foto e detalhes.
- Lista de avistamentos com busca textual e filtro de espécie.
- Script de teste do fluxo de avistamentos em `tests/avistamentos.test.cjs`. Sua existência não significa que foi executado nesta atualização documental.

## Limitações atuais

- Cada novo avistamento cria um novo registro de animal. Ainda não é possível selecionar um animal existente.
- A tela de animais lista avistamentos; não é um catálogo independente de todos os animais cadastrados.
- Não há edição de cadastro de animal nem painel administrativo implementado.
- A tela de desaparecidos é demonstrativa, sem fluxo completo conectado à API.
- A tabela `Publica_Perda` ainda não tem referência a `Animal` e contém campos próprios de identificação do animal.
- O mapa atualiza os dados ao entrar na tela, voltar à aba ou solicitar atualização. Não há sincronização contínua por push implementada.

## Arquitetura atual

O navegador executa o frontend React. O frontend usa HTTP para acessar a API Express; os fluxos de usuários e avistamentos utilizam PostgreSQL. Os endpoints de avistamentos exigem autenticação. Fotos enviadas ficam no armazenamento local do servidor, com referência no banco.

## Próximos marcos

1. Definir o cadastro compartilhado de animal e as permissões de edição.
2. Permitir novos avistamentos vinculados a animais já cadastrados.
3. Implementar consulta, cadastro independente e edição de animais.
4. Implementar desaparecimentos vinculados ao mesmo cadastro de animal.
5. Testar os fluxos integrados e documentar resultados de comunicação, concorrência e falhas conforme o escopo da disciplina.

Para instalação e execução, consulte o README na raiz. Para responsabilidades, consulte [Contribuições e planejamento](CONTRIBUICOES.md).
