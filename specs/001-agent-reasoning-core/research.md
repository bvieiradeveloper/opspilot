# Research: Núcleo de Raciocínio do OpsPilot

**Date**: 2026-09-30  
**Scope**: Resolver escolhas de implementação para o grafo de estratégias, configuração do modelo, execução de ferramentas, métricas, ciclo do seed e arena.

## Decisions

### 1. Construção do grafo e Plan-and-Execute limitado

**Decision**: Usar `StateGraph` do LangGraph com nós explícitos `planner`, `executor` e `replanner`. O executor despacha exatamente um passo selecionado do plano e segue para o replanejador; este encerra o grafo ou retorna ao executor. Manter contador explícito de passos executados e parar no menor valor entre `maxIterations` configurado e oito.

**Rationale**: Representa diretamente o ciclo solicitado e torna cada passo observável. Uma ação por execução do executor evita chamadas de ferramenta em paralelo num fluxo que pode alterar incidentes.

**Alternatives considered**: Um loop monolítico de agente oculta os limites entre planejamento e revisão. O `ToolNode` pode executar chamadas da mesma mensagem em paralelo, portanto não atende sozinho ao requisito de um passo por vez.

**Verified API**: `@langchain/langgraph` 1.4.17 instalado disponibiliza `StateGraph`, `Annotation`, `START`, `END`, `.addNode()`, `.addEdge()`, `.addConditionalEdges()` e `.compile()`.

### 2. Planejamento e replanejamento estruturados

**Decision**: Usar um schema Zod com `withStructuredOutput` do LangChain para os resultados do planner e replanner. O plano inicial é limitado a oito passos validados; após cada ação, o replanner retorna passos restantes e se a solicitação está concluída. Resultado malformado causa falha tipada, nunca execução de argumento inválido.

**Rationale**: Saída estruturada separa dispatch de ferramenta de prosa livre e oferece ao executor nomes e argumentos validados.

**Alternatives considered**: Parsear JSON em texto livre tem tratamento de falha mais frágil e duplica validação. Binding de tools diretamente ao modelo não garante limite de plano nem uma ação por vez.

**Caveat**: As declarações locais confirmam a API e suporte a Zod v4, mas a compatibilidade do modo de saída estruturada com um modelo OpenRouter específico deve ser verificada em execução de integração autenticada.

### 3. Fábrica compartilhada do modelo OpenRouter

**Decision**: Construir `ChatOpenAI` em uma única fábrica, com `apiKey` de `OPENROUTER_API_KEY`, modelo de `OPENROUTER_MODEL`, `temperature: 0` e `configuration.baseURL` igual a `https://openrouter.ai/api/v1`. Validar as configurações obrigatórias antes de criar o cliente. Acessar `process.env` apenas quando a fábrica for chamada; não ler `.env`.

**Rationale**: A integração OpenAI instalada procura `OPENAI_API_KEY` por padrão; a fábrica deve fornecer explicitamente a variável solicitada. Um único ponto de criação mantém planner e replanner consistentes.

**Alternatives considered**: Clientes separados ou configuração implícita via `OPENAI_API_KEY` divergiriam do contrato da feature e poderiam usar modelos diferentes.

### 4. Ferramentas, validação e store

**Decision**: Manter store in-memory por processo, inicializado por uma função determinística de seed. Criar tools com `tool(func, { name, description, schema })` e schemas Zod; elas delegam mutações ao store. `list_alerts.status` é opcional (sem status lista todos); `open_incident` exige título, serviço e severidade não vazios, com serviço existente; `resolve_incident` exige ID existente de incidente aberto.

**Rationale**: Segue a decisão da FR-015: ferramentas mock, MySQL/Sequelize fora do escopo. Construção compartilhada do seed evita divergência entre runtime e comando de seed.

**Alternatives considered**: Persistência no banco conflita com FR-015. Fixtures de teste separadas podem divergir do runtime; testes devem criar instâncias isoladas usando a mesma função de seed.

**Seed lifecycle**: A criação do store de runtime carrega os dados naquele processo. O comando de seed constrói e valida o mesmo seed e imprime um resumo das contagens. Como o armazenamento é explicitamente em memória, a execução isolada do script não persiste dados para outro processo em execução; API/arena inicializam seu próprio store ao iniciar.

### 5. Métricas de chamadas e latência

**Decision**: Associar um callback LangChain novo a cada execução de estratégia. Contar eventos `handleChatModelStart` em `IICalls`, incluindo planner e replanner, e medir a duração total da estratégia com relógio monotônico. Não compartilhar handler mutável entre execuções concorrentes da arena.

**Rationale**: O callback observa chamadas no limite LangChain sem instrumentar manualmente cada invocação. Um handler por execução impede mistura de métricas.

**Alternatives considered**: Incrementos manuais em call sites escolhidos podem omitir chamadas de saída estruturada ou futuras chamadas de modelo. O callback conta invocações LangChain, não tentativas HTTP internas de retry; essa é a métrica definida para `IICalls`.

### 6. Proteção de recursão e limite de iterações

**Decision**: Aplicar `maxIterations` no estado do grafo, validado entre 1 e 8. Configurar `recursionLimit` do LangGraph separadamente como guarda técnica, com valor 32.

**Rationale**: `recursionLimit` limita supersteps do grafo, não ações de negócio; uma ação passa por vários nós. Separar os limites preserva o teto solicitado e detecta ciclos defeituosos.

**Alternatives considered**: Usar `recursionLimit` como teto de oito pode interromper fluxo válido antes de oito ações porque cada ação percorre executor e replanner.

### 7. Arena CLI

**Decision**: Aceitar uma solicitação posicional, uma lista separada por vírgula em `--strategies` e inteiro `--max-iterations` (padrão 8, intervalo 1-8). Executar estratégias selecionadas sequencialmente sobre a mesma solicitação e imprimir seção própria com resposta, trace formatado e métricas para cada uma. Rejeitar flags, nomes e limites inválidos com diagnóstico conciso e status de saída não zero.

**Rationale**: Execução sequencial simplifica a comparação e isola métricas; a saída fica previsível em terminal.

**Alternatives considered**: Execução paralela complica ordem de saída e isolamento de métricas sem benefício para a arena inicial.

**Package script**: Add `"seed": "tsx src/scripts/seed.ts"` to the existing npm scripts; no additional package is needed.

**ReAct strategy**: The installed LangGraph package exports `createReactAgent` from `@langchain/langgraph/prebuilt`, but its declaration marks it deprecated and recommends `createAgent` from the separate `langchain` package. That package is not installed, so the implementation uses the available compatibility export and contains the adapter behind `src/agents/react.ts`. Revisit the import if/when the `langchain` package is deliberately adopted.

## Package/API Findings

- Versões no lockfile: `@langchain/langgraph` 1.4.17, `@langchain/core` 1.2.12, `@langchain/openai` 1.5.13; a integração OpenAI declara suporte a Node.js 22.
- `ChatOpenAI.withStructuredOutput<Output>(schema, config?)` está declarado na integração instalada e aceita Zod v4. Com `includeRaw: true`, o resultado contém `{ raw, parsed }`.
- `ChatOpenAI` aceita `configuration.baseURL`; endpoint OpenAI-compatible do OpenRouter: `https://openrouter.ai/api/v1`.
- `tool(func, { name, description, schema })` aceita schemas Zod e produz tool estruturada validada.
- `BaseCallbackHandler.handleChatModelStart(...)` permite contar invocações do modelo. É uma contagem de chamadas LangChain, não de retries HTTP subjacentes.
- `recursionLimit` do LangGraph limita supersteps e pode lançar `GraphRecursionError`; não substitui contador explícito de passos do plano.

## Source References

- Declarações instaladas em `node_modules/@langchain/langgraph/dist/graph/` e `node_modules/@langchain/langgraph/dist/prebuilt/tool_node.d.ts`.
- Declarações instaladas em `node_modules/@langchain/openai/dist/chat_models/` e `node_modules/@langchain/core/dist/{tools,messages,callbacks,runnables}/`.
- Versões de dependências em `package.json` e `package-lock.json`.

A pesquisa não fez chamadas externas de rede. Compatibilidade do provider/modelo OpenRouter permanece como verificação de integração, não como decisão de design pendente.
