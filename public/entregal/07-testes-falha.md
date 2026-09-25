# Relatório de Testes de Falha

## Caso 1: Retorno sem cookie temporário
* **Preparação:** Login iniciado pelo botão "Entrar com Google" em uma aba de navegação padrão. Cópia da URL de autorização da barra de endereços (tela de escolha de conta do Google) para a área de transferência.
* **Pedido enviado:** Abertura de uma nova janela privativa (sem o cookie `__Host-oauth-tx`) e colagem da URL copiada. Conclusão da autenticação na conta do Google, disparando a requisição GET de retorno (`/oauth/callback/google?state=...&code=...`).
* **Resultado esperado:** A rota de retorno deve recusar a resposta antes de prosseguir, não criar a sessão final e exibir um erro devido à ausência do cookie temporário de transação.
* **Resultado observado:** O servidor retornou o erro HTTP 400 com a mensagem "Missing cookie". Nenhuma sessão foi criada no banco D1.

## Caso 2: State alterado
* **Preparação:** Início de um novo fluxo de login pelo GitHub até a tela de permissão da OAuth App.
* **Pedido enviado:** Antes de autorizar a aplicação, alteração de um caractere aleatório (substituindo uma letra por outra) no meio do parâmetro `state` diretamente na barra de endereço do navegador, seguido de um "Enter" para enviar o código de volta à rota de callback com o state falsificado.
* **Resultado esperado:** A rota de retorno deve recusar a operação e barrar a troca de tokens, pois o hash do state alterado recebido na URL não coincidirá com o hash conservado no D1.
* **Resultado observado:** A aplicação bloqueou o processo retornando erro HTTP 400 com a mensagem "Invalid state". A transação original foi apagada do banco.

## Caso 3: Reutilização da transação
* **Preparação:** Conclusão de um ciclo de login completo e bem-sucedido. Localização da requisição de callback do provedor (ex: `/oauth/callback/google?code=...`) na aba Network das ferramentas de desenvolvimento do navegador.
* **Pedido enviado:** Cópia da URL da requisição de callback já processada e envio de uma nova requisição GET colando essa mesma URL em uma nova aba do navegador.
* **Resultado esperado:** A repetição deve falhar, uma vez que a transação correspondente (PKCE) já foi apagada do banco D1 pelo sistema durante o primeiro processamento bem-sucedido.
* **Resultado observado:** A aplicação rejeitou o pedido com o erro HTTP 400 "Transaction not found", não permitindo o reuso do código.

## Caso 4: Sessão expirada
* **Preparação:** Abertura de uma sessão válida na aplicação. Acesso ao painel da Cloudflare e navegação até o Console do banco D1 do projeto.
* **Pedido enviado:** Execução do comando SQL de expiração forçada: `UPDATE sessions SET expires_at = 0;`. Após a confirmação da query, a página da aplicação no navegador foi recarregada, forçando uma requisição GET para `/api/me`.
* **Resultado esperado:** A rota `/api/me` deve rejeitar o acesso, responder com erro de autorização e o front-end deve exibir que nenhuma sessão foi encontrada.
* **Resultado observado:** O endpoint `/api/me` retornou HTTP 401 Unauthorized e a página inicial atualizou o status para "Nenhuma sessão neste navegador."

## Caso 5: Origem inválida na saída
* **Preparação:** Login bem-sucedido mantendo a página base da aplicação (URL_BASE) aberta. Abertura de uma nova aba no navegador acessando uma origem distinta (ex: `https://example.com`).
* **Pedido enviado:** Execução de um comando fetch forjado no console do navegador (F12) da origem distinta: `fetch("https://pedromoraes7.pages.dev/oauth/logout", { method: "POST", credentials: "include" });`
* **Resultado esperado:** A rota `/oauth/logout` deve recusar a operação para prevenir ataques CSRF (falsificação de solicitação entre sites), mantendo a sessão do usuário intacta.
* **Resultado observado:** A requisição POST foi bloqueada com erro HTTP 403 "Invalid Origin". A sessão na aba original continuou válida.

## Caso 6: Reutilização do cookie revogado
* **Preparação:** Com a sessão logada, cópia manual do valor longo do cookie `__Host-session` pela aba "Application/Armazenamento" do navegador. Em seguida, clique no botão "Sair" na página para executar a rota normal de logout.
* **Pedido enviado:** Recriação manual do cookie `__Host-session` no navegador, colando o valor copiado anteriormente. Recarregamento da página para enviar o cookie forjado à API.
* **Resultado esperado:** O acesso deve ser negado (401), uma vez que o logout anterior removeu efetivamente o registro da sessão na tabela `sessions` do banco de dados D1, tornando o cookie revogado inútil.
* **Resultado observado:** A API `/api/me` retornou HTTP 401 e a sessão não foi restaurada, provando a revogação efetiva no servidor.
