# Avaliação: GitHub Actions com IA

Repositório: https://github.com/PedroMoraes7/pj2-auth

---

## Tarefa 1: CI a cada commit

- Execução verde: https://github.com/PedroMoraes7/pj2-auth/actions/runs/38478407729
- Execução vermelha: https://github.com/PedroMoraes7/pj2-auth/actions/runs/38482634386
- Linha do log que mostra o erro:

```
Run for f in migrations/*.sql; do sqlite3 teste.db < "$f"; done
Parse error near line 1: near "TABELAAAAAA": syntax error
  CREATE TABELAAAAAA notas (     id INTEGER PRIMARY KEY AUTOINCREMENT,     aluno
         ^--- error here
```

- Por que a migração é testada em SQLite antes de chegar ao D1: para pegar erros de sintaxe e de ordem das migrações antes que elas alterem o banco de produção, onde um erro é difícil de desfazer.

---

## Tarefa 2: proteger a main com o CI

Ok

---

## Tarefa 3: revisão de PR por IA

- PR com os dois comentários da IA (um sobre o SQL vulnerável e outro depois da correção com `prepare().bind()`): https://github.com/PedroMoraes7/pj2-auth/pull/3
- Erro de permissão ao remover `pull-requests: write`

```
0s
Run if [ -z "/tmp/modelResponse--2347-k6DTEVFgGk5h-.txt" ]; then
GraphQL: Resource not accessible by integration (addComment)
Error: Process completed with exit code 1.
```

### Crítica à IA

Na primeira revisão, a IA apontou falta de autenticação na rota `/api` como problema de severidade MEDIUM. Essa afirmação está errada, mas o diff mostrava apenas o arquivo `api.js` e a IA não via o restante do projeto. Isso mostra que a IA julga só o que está no diff e pode inventar falhas por falta de contexto.

---

## Tarefa 4: migrações D1 depois do merge

- Execução do `migrar` no merge da migração `0002_adiciona_coluna.sql`: https://github.com/PedroMoraes7/pj2-auth/actions/runs/38802586457
- Saída do `PRAGMA table_info(notas)` (obtida pelo Console do D1 no painel da Cloudflare):

```
cid  name        type     notnull  dflt_value  pk
0    id          INTEGER  0        <null>      1
1    aluno       TEXT     1        <null>      0
2    valor       REAL     0        <null>      0
3    comentario  TEXT     0        <null>      0
```

- Merge que não alterou `migrations/` (adicionou apenas `docs/tarefa4-sem-migracao.md`): https://github.com/PedroMoraes7/pj2-auth/pull/8 . Na aba Actions, esse commit gerou apenas o `ci`, e o workflow `migrar` não foi executado, por causa do filtro `paths: ['migrations/**']`.

---

## Perguntas

**1. O `ci.yml` roda duas vezes quando você faz push numa ramificação com PR aberto. Por quê, e qual das duas execuções o status check da main considera?**

O `ci.yml` tem o gatilho `push` sem filtro de ramificação e também `pull_request` para a main. Ao dar push numa ramificação com PR aberto, os dois eventos acontecem ao mesmo tempo e geram duas execuções. A regra da main exige o check chamado `verificar`, então o PR mostra as duas execuções e o merge só é liberado se o check passar; uma falha em qualquer uma delas bloqueia. A execução do `pull_request` é a mais representativa, porque testa o resultado da combinação da ramificação com a main.

**2. Por que um PR vindo de um fork não consegue usar `secrets.COPILOT_PAT`? Qual ataque essa regra impede?**

Em PRs de fork, o GitHub não entrega os segredos do repositório de destino ao workflow (e o `GITHUB_TOKEN` fica somente leitura), porque o workflow executa o código que veio no PR. Sem essa regra, qualquer pessoa poderia abrir um PR com um código alterado que lê o `COPILOT_PAT` e o envia para fora, roubando o segredo.

**3. Por que o workflow da Tarefa 3 declara `permissions` em vez de usar as permissões padrão do `GITHUB_TOKEN`?**

Declarar `permissions` aplica o princípio do privilégio mínimo: o token fica só com `contents: read` (ler o código) e `pull-requests: write` (comentar no PR). As permissões padrão podem ser mais amplas do que o necessário, e isso aumentaria o estrago caso uma ação de terceiros ou o próprio fluxo fosse comprometido. Na Tarefa 3, ao remover `pull-requests: write`, o comentário falhou com `Resource not accessible by integration`, o que mostra que a permissão é realmente necessária e controlada de forma explícita.

**4. A revisão da IA pode substituir o status check da Tarefa 2? Justifique com o que você observou no item 4 da Tarefa 3.**

Não. No item 4 da Tarefa 3 observei que a IA fez uma afirmação, o que mostra que o resultado dela é falível e varia de uma execução para outra. Além disso, a revisão da IA só publica um comentário e não aprova nem bloqueia o merge, enquanto o status check é determinístico e é o que a regra da main consegue exigir. A IA serve como apoio à revisão, mas a barreira de qualidade continua sendo o check automático.
