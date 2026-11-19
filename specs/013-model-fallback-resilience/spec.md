# Feature Specification: Model Fallback Resilience

**Feature Branch**: `[013-model-fallback-resilience]`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Resiliência de modelo:
- env: OPENROUTER_MODEL)FALLBACK
- fábrica model.ts: withRetry no primário; withFallbacks([reserva])
- Trace: evento "fallback"; metrics.modelUsed.
- Caso nada funcione, 503"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manter o atendimento com um modelo reserva (Priority: P1)

Como operador de plantão, quero que o OpsPilot tente um modelo reserva quando o modelo
principal continuar indisponível após as tentativas previstas, para que a investigação de um
incidente possa prosseguir sem depender de um único modelo.

**Why this priority**: A indisponibilidade do modelo principal não deve interromper o apoio
operacional quando há um modelo reserva disponível.

**Independent Test**: Simular uma falha persistente do modelo principal e uma resposta válida do
modelo reserva; confirmar que a resposta chega ao operador e que o modelo utilizado é identificado.

**Acceptance Scenarios**:

1. **Given** que o modelo principal responde com sucesso, **When** o OpsPilot processa uma
   solicitação, **Then** a resposta é produzida pelo modelo principal sem acionar o reserva.
2. **Given** que as tentativas previstas para o modelo principal se esgotam e há um modelo reserva
   configurado, **When** o OpsPilot processa a solicitação, **Then** ele tenta o modelo reserva e
   retorna sua resposta quando bem-sucedida.
3. **Given** que a resposta é produzida pelo modelo reserva, **When** os dados de execução são
   registrados, **Then** é emitido um evento de trace `fallback` e `metrics.modelUsed` identifica
   o modelo reserva.

---

### User Story 2 - Receber uma falha explícita quando todos os modelos falham (Priority: P2)

Como operador de plantão, quero receber uma indicação explícita de indisponibilidade quando nenhum
dos modelos configurados consegue responder, para que eu não confunda uma falha do agente com uma
resposta válida sobre o incidente.

**Why this priority**: Uma falha visível e inequívoca evita decisões operacionais baseadas em uma
resposta inexistente ou incompleta.

**Independent Test**: Simular falha em todas as tentativas do modelo principal e do reserva e
confirmar que a solicitação termina com HTTP 503, sem apresentar uma resposta como sucesso.

**Acceptance Scenarios**:

1. **Given** que o modelo principal e o reserva falham, **When** o processamento se encerra,
   **Then** a API retorna HTTP 503 e não apresenta conteúdo como resposta bem-sucedida.
2. **Given** que nenhum modelo reserva está configurado e as tentativas do principal falham,
   **When** o processamento se encerra, **Then** a API retorna HTTP 503.

### Edge Cases

- A variável de configuração do modelo reserva não está definida; o sistema não tenta um modelo
  não configurado e aplica o comportamento de falha após esgotar as tentativas do principal.
- O modelo principal responde com sucesso depois de uma tentativa adicional; o modelo reserva não
  é acionado e a métrica identifica o principal.
- O modelo reserva também falha; a solicitação termina com HTTP 503.
- A configuração do modelo reserva está definida, mas sua tentativa não produz uma resposta
  utilizável; a falha não deve ser apresentada como sucesso.
- Uma execução muda do principal para o reserva; trace e métrica devem identificar essa mudança e
  o modelo que efetivamente produziu a resposta.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir a configuração de um modelo reserva por meio da variável
  `OPENROUTER_MODEL_FALLBACK`.
- **FR-002**: O sistema MUST fazer duas tentativas totais no modelo principal antes de considerar
  o candidato indisponível.
- **FR-003**: O sistema MUST tentar o modelo reserva somente após as duas tentativas do principal
  falharem, somente quando houver um modelo reserva configurado, e MUST fazer duas tentativas
  totais nesse candidato.
- **FR-004**: Quando o modelo principal responder com sucesso, o sistema MUST retornar essa
  resposta sem acionar o modelo reserva.
- **FR-005**: Quando o sistema passar a usar o modelo reserva, MUST registrar um evento de trace
  chamado `fallback`.
- **FR-006**: O campo `metrics.modelUsed` MUST identificar o modelo que produziu a resposta
  retornada, inclusive quando esse modelo for o reserva.
- **FR-007**: Se todas as tentativas dos modelos configurados falharem ou não produzirem uma
  resposta utilizável, a API MUST retornar HTTP 503 e MUST NOT apresentar a execução como
  bem-sucedida.
- **FR-008**: Testes automatizados MUST verificar o sucesso do principal, a transição bem-sucedida
  para o reserva, os dados de trace e métrica e a falha final HTTP 503.

### Key Entities *(include if feature involves data)*

- **Modelo configurado**: Modelo principal ou reserva disponível para produzir uma resposta do
  agente.
- **Evento de fallback**: Registro de trace que indica a transição do modelo principal para o
  reserva.
- **Métrica de modelo utilizado**: Dado de execução que identifica o modelo responsável pela
  resposta retornada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos cenários em que o principal responde com sucesso, a resposta é atribuída
  ao principal e o reserva não é acionado.
- **SC-002**: Em 100% dos cenários de falha do principal com sucesso do reserva, o operador recebe
  uma resposta utilizável e consegue identificar qual modelo a produziu.
- **SC-003**: Em 100% dos cenários em que todos os modelos configurados falham, o operador recebe
  uma indicação explícita de indisponibilidade, sem resposta com aparência de sucesso.

## Assumptions

- A grafia pretendida para `OPENROUTER_MODEL)FALLBACK` na descrição é
  `OPENROUTER_MODEL_FALLBACK`.
- O modelo reserva é opcional; quando ausente, o sistema mantém as tentativas do principal e
  retorna HTTP 503 se elas se esgotarem.
- Cada modelo configurado recebe no máximo duas tentativas totais por chamada; o reserva segue a
  mesma política do principal.
- HTTP 503 é a resposta externa para o esgotamento de todos os modelos configurados, sem alterar
  o formato de erro já adotado pela API.
