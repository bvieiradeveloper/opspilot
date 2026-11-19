# Reasoning Strategy and Tool Contracts

Estes contratos descrevem a fronteira entre arena, estratégias e ferramentas operacionais mock. São contratos de design, não código de implementação.

## Strategy Contract

```ts
type TraceType =
  | "thought"
  | "action"
  | "observation"
  | "plan"
  | "critique"
  | "answer";

type ToolName = "list_alerts" | "open_incident" | "resolve_incident";

type TraceEvent =
  | { type: "thought"; summary: string }
  | { type: "plan"; steps: string[] }
  | { type: "action"; tool: ToolName; args: Record<string, unknown> }
  | { type: "observation"; result: unknown }
  | { type: "critique"; summary: string }
  | { type: "answer"; text: string };

type Metrics = {
  IICalls: number;
  latencyMs: number;
};

type ReasoningInput = {
  request: string;
  maxIterations: number;
};

type ReasoningResult = {
  answer: string;
  trace: TraceEvent[];
  metrics: Metrics;
};

interface ReasoningStrategy {
  readonly name: string;
  run(input: ReasoningInput): Promise<ReasoningResult>;
}
```

`maxIterations` é validado como inteiro de 1 a 8 e assume 8 na fronteira da arena. Valores `thought` e `critique` são resumos concisos e seguros, nunca raciocínio oculto privado. Cada execução tem contador próprio; `IICalls` conta inícios de execução de chat model LangChain feitos por essa estratégia.

## Plan-and-Execute Contract

- A saída do planner é uma lista ordenada validada de até oito passos.
- Um passo nomeia uma ferramenta permitida e argumentos aceitos pelo schema Zod dessa ferramenta.
- O executor invoca somente o primeiro passo restante, registra uma `action` e sua `observation`, sem despachar ações irmãs em paralelo.
- O replanner recebe solicitação original, ações/observações concluídas e plano restante; retorna plano atualizado e decisão de conclusão.
- O grafo roteia para resposta final quando o plano atualizado está vazio ou o limite de iterações foi atingido.
- O grafo também tem uma proteção separada de recursão do LangGraph para detectar falhas de roteamento; ela não é o limite de iterações do usuário.
- A construção da estratégia aceita dependências de planner/replanner substituíveis; a configuração de produção usa a fábrica compartilhada, enquanto testes fornecem runnables determinísticos sem rede.

## ReAct Contract

- ReAct usa as mesmas ferramentas compartilhadas e o contrato `ReasoningStrategy`.
- `maxIterations` limita o número total de ações de ferramenta efetivamente executadas, com teto rígido de oito; o `recursionLimit` do grafo é uma guarda separada.
- O trace é derivado de tool calls, resultados de ferramentas e resposta final. Mensagens intermediárias do assistant não são copiadas como `thought`, evitando expor raciocínio privado.
- `IICalls` conta mensagens de saída do modelo na execução; métricas e trace pertencem somente àquela execução.

## Tool Contracts

### `list_alerts`

- Entrada: `{ status?: "firing" | "resolved" }`.
- Status omitido lista todos os alertas; status informado filtra exatamente por estado.
- Saída: registros correspondentes, ordenados deterministicamente por ID estável.
- Status inválido é rejeitado antes do acesso ao store.

### `open_incident`

- Entrada: `{ title: string, service: string, severity: string }`.
- Strings são aparadas e não vazias; `service` deve corresponder ao nome de serviço existente.
- Sucesso cria um incidente `open` e retorna esse registro.
- Valores inválidos falham sem alterar o estado.

### `resolve_incident`

- Entrada: `{ id: string }`, aparada e não vazia.
- Sucesso transiciona um incidente `open` existente para `resolved` e retorna o registro atualizado.
- ID desconhecido ou já resolvido produz erro de domínio tipado sem mutação.

## Store Contract

- Cada instância possui seus serviços, alertas e incidentes; testes podem criar stores seedados isolados.
- A construção do store runtime carrega a seed uma vez por processo.
- Inicialização da seed é determinística e idempotente em relação à base inicial.
- O store é process-local; nem o script de seed nem o runtime persistem estado entre processos.
