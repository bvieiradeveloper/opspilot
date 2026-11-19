# OpsPilot

OpsPilot e um copiloto de plantao que gerencia alertas e incidentes de producao. A API e um agente LangChain/LangGraph sobre OpenRouter.

## Stack

- Node.js 22 LTS
- TypeScript ESM com `strict`
- Zod na fronteira HTTP/CLI para validar entradas e saidas
- Testes com `node:test` via `tsx`
- Express com MySQL como banco

## Comandos

- `npm run dev` - inicia a API
- `npm run arena` - executa a arena
- `npm run bench` - executa benchmarks
- `npm run test` - executa os testes
- `npm run typecheck` - verifica os tipos

## Convencoes

- Organize o codigo nas camadas MVC: Model, Service e Controller.
- Valide toda entrada externa com Zod.
- Use classes para erros de dominio e traduza-as na borda.
- Toda logica nova deve nascer com testes.
- `typecheck` e `test` sempre devem passar.
- Nunca commite segredos (`secrets`) nem leia `.env`.

## Fluxo

Siga o fluxo do Spec Kit do GitHub Copilot na ordem:

(/speckit.specify -> plan -> task -> implement)

Specs devem ser versionadas.
