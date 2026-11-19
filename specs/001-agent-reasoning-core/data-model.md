# Data Model: Núcleo de Raciocínio do OpsPilot

A feature usa somente registros em memória. O store é criado a partir de seed determinístico e tem escopo de um processo; não há persistência MySQL nem garantia de estado entre processos.

## Service

Representa uma aplicação ou subsistema monitorado.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Identificador estável, não vazio e único no store |
| `name` | string | Não vazio e único no store |
| `description` | string | Contexto operacional legível |

O seed inclui cinco serviços: `payments-api`, `checkout-api`, `identity-service`, `inventory-worker` e `notification-service`.

## Alert

Representa um sinal associado a um serviço.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Identificador estável, não vazio e único no store |
| `serviceId` | string | Deve referenciar serviço seedado |
| `title` | string | Resumo não vazio |
| `status` | `firing | resolved` | Obrigatório; filtro da listagem pode ser omitido para listar todos |
| `severity` | string | Rótulo de severidade não vazio |
| `createdAt` | ISO timestamp | Valor fixo no seed para reprodutibilidade |
| `resolvedAt` | ISO timestamp ou ausente | Presente para alertas resolved; ausente para firing |

O seed inclui seis alertas variados, exatamente três `firing` e três `resolved`, com IDs e timestamps estáveis.

| ID | Service | Title | Status | Severity |
|---|---|---|---|---|
| `alert-001` | `payments-api` | Elevated payment latency | `firing` | critical |
| `alert-002` | `checkout-api` | Increased checkout failures | `firing` | high |
| `alert-003` | `identity-service` | Authentication error rate | `firing` | high |
| `alert-004` | `inventory-worker` | Queue backlog | `resolved` | medium |
| `alert-005` | `notification-service` | Delayed notification delivery | `resolved` | medium |
| `alert-006` | `payments-api` | Database connection saturation | `resolved` | high |

## Incident

Representa uma ação operacional aberta para um serviço.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Identificador estável único gerado pelo store |
| `title` | string | Obrigatório, aparado e não vazio |
| `serviceId` | string | Deve referenciar serviço existente |
| `severity` | string | Obrigatória, aparada e não vazia |
| `status` | `open | resolved` | Novo incidente inicia `open`; resolver transiciona apenas `open` para `resolved` |
| `createdAt` | ISO timestamp | Definido na abertura; relógio injetável em testes |
| `resolvedAt` | ISO timestamp ou ausente | Definido ao resolver |

Resolver ID inexistente ou incidente já resolvido retorna erro de domínio sem alterar registros.

## Reasoning Input and Result

| Entity | Fields | Rules |
|---|---|---|
| `ReasoningInput` | `request: string`, `maxIterations: integer` | Solicitação não vazia; iterações padrão 8, intervalo 1-8 |
| `ReasoningResult` | `answer: string`, `trace: TraceEvent[]`, `metrics: Metrics` | Retornado em toda execução concluída |
| `Metrics` | `IICalls: integer`, `latencyMs: number` | Ambos não negativos; `IICalls` conta inícios de chamada de modelo LangChain nesta execução |

## Trace Event

`TraceEvent` é uma união discriminada em ordem cronológica estável:

| Type | Payload | Rules |
|---|---|---|
| `thought` | Resumo conciso | Não contém cadeia privada oculta de raciocínio |
| `plan` | Descrições dos passos ordenados | Plano inicial e plano restante podem ser registrados |
| `action` | `tool`, `args` | Exatamente uma ação por passagem do executor |
| `observation` | Resultado ou resumo seguro de erro da ferramenta | Segue a ação correspondente |
| `critique` | Reavaliação concisa | Registra decisão do replanejador sem raciocínio privado |
| `answer` | Resposta final ao usuário | No máximo um evento terminal de resposta |

## Plan and PlanStep

`Plan` é uma lista ordenada de `PlanStep` e estado de conclusão. Um passo contém ordinal, nome de ferramenta permitida e argumentos validados pelo schema correspondente. O plano contém no máximo oito passos executáveis. Após cada resultado de ferramenta, o replanejador substitui os passos restantes; o grafo encerra quando não há trabalho restante ou o limite de iterações é atingido.

Nomes permitidos: `list_alerts`, `open_incident` e `resolve_incident`. Schemas e mutações são definidos em [reasoning-strategy.md](contracts/reasoning-strategy.md).

## Seed Invariants

- Cinco serviços distintos existem após inicialização.
- Seis alertas existem após inicialização: exatamente três `firing` e três `resolved`.
- Todo `serviceId` de alerta referencia um dos cinco serviços.
- IDs e timestamps são estáveis entre execuções; reinicializar seed reconstrói a mesma base em vez de anexar duplicatas.
- Inicialização do store runtime e script standalone usam a mesma definição de seed.
