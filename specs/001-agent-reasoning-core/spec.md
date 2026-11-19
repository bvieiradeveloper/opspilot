# Feature Specification: Núcleo de Raciocínio do OpsPilot

**Feature Branch**: `001-agent-reasoning-core`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: Criar o núcleo de raciocínio do OpsPilot com estratégias compartilhadas, estratégia Plan-and-Execute, ferramentas de incidentes, configuração do modelo, arena de avaliação, testes determinísticos e seed inicial.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Executar estratégias de raciocínio (Priority: P1)

Como pessoa responsável por um plantão, quero executar uma estratégia de raciocínio com uma solicitação operacional e receber uma resposta acompanhada de rastreabilidade e métricas, para entender o resultado e comparar estratégias.

**Why this priority**: Respostas úteis, rastreáveis e mensuráveis são a base do núcleo e habilitam os demais fluxos.

**Independent Test**: Executar uma estratégia com uma solicitação e verificar que o resultado contém resposta, eventos ordenados de trace, quantidade de chamadas ao modelo e latência.

**Acceptance Scenarios**:

1. **Given** uma estratégia disponível e uma solicitação válida, **When** a estratégia termina, **Then** ela retorna uma resposta, um trace tipado e métricas de chamadas ao modelo e latência.
2. **Given** uma execução que registra interação com ferramenta, **When** o trace é consultado, **Then** a ação identifica a ferramenta e seus argumentos, e a observação registra o resultado.
3. **Given** um trace que inclui raciocínio, **When** ele é apresentado, **Then** eventos `thought` contêm apenas resumos seguros e concisos, nunca raciocínio interno privado do modelo.
4. **Given** as estratégias ReAct e Plan-and-Execute registradas, **When** a arena seleciona uma delas, **Then** cada estratégia retorna o mesmo contrato de resposta, trace e métricas.

---

### User Story 2 - Resolver uma solicitação com planejamento e ferramentas (Priority: P1)

Como pessoa de plantão, quero que o agente planeje uma sequência de passos, execute uma ação por vez e revise o que falta após cada ação, para resolver solicitações sobre alertas e incidentes sem ultrapassar um limite previsível.

**Why this priority**: A estratégia transforma o núcleo em um agente operacional capaz de consultar alertas e atuar sobre incidentes com controle de execução.

**Independent Test**: Submeter solicitações que exijam listar alertas, abrir incidente ou resolver incidente; verificar cada chamada e observação, revisão do plano após cada passo e encerramento quando não restarem passos ou ao atingir o limite.

**Acceptance Scenarios**:

1. **Given** uma solicitação operacional, **When** a estratégia a processa, **Then** ela cria um plano ordenado e executa no máximo um passo por interação.
2. **Given** que um passo foi executado, **When** a estratégia continua, **Then** ela reavalia os passos restantes antes de escolher a próxima ação.
3. **Given** que o plano inicial excede oito passos, **When** a estratégia inicia a execução, **Then** nenhuma execução ultrapassa oito passos.
4. **Given** que não restam passos, **When** o replanejador avalia o resultado, **Then** a estratégia encerra e retorna a resposta final.
5. **Given** uma entrada inválida para uma ferramenta, **When** a ação é solicitada, **Then** a entrada é rejeitada sem alterar o estado dos alertas ou incidentes.

---

### User Story 3 - Avaliar estratégias e preparar dados operacionais (Priority: P2)

Como pessoa desenvolvedora ou avaliadora, quero executar uma ou mais estratégias sobre a mesma entrada e iniciar um conjunto conhecido de serviços e alertas, para comparar resultados de forma reproduzível.

**Why this priority**: A arena e os dados previsíveis permitem avaliar o comportamento do agente e demonstrar os fluxos sem depender de dados manuais.

**Independent Test**: Executar a arena para uma ou mais estratégias com limites configuráveis; executar o seed e verificar que o conjunto resultante contém cinco serviços e seis alertas, com três em estado firing e três resolved.

**Acceptance Scenarios**:

1. **Given** uma entrada e uma ou mais estratégias selecionadas, **When** a arena é executada, **Then** cada estratégia recebe a mesma entrada e apresenta sua resposta, trace e métricas.
2. **Given** opções de seleção de estratégias e limite de interações, **When** a arena é iniciada com essas opções, **Then** executa somente as estratégias selecionadas e respeita o limite solicitado.
3. **Given** o seed inicial, **When** ele é executado, **Then** os dados resultantes contêm exatamente cinco serviços e seis alertas variados, três firing e três resolved.
4. **Given** os testes do store e da formatação de trace, **When** são executados sem acesso de rede, **Then** seus resultados são determinísticos.

### Edge Cases

- A solicitação não corresponde a nenhuma ação suportada ou não exige ferramenta.
- O modelo retorna um plano vazio, malformado ou com mais de oito passos.
- Uma ferramenta recebe identificador inexistente, status inválido ou campos obrigatórios ausentes.
- Uma estratégia atinge o limite configurado antes de concluir o plano.
- O modelo não pode ser configurado porque faltam credenciais ou identificação do modelo.
- A arena recebe nome de estratégia desconhecido ou valor inválido para o limite de interações.
- O seed é executado mais de uma vez; a operação deve ter resultado reproduzível sem multiplicar registros.
- O trace inclui evento de ação sem argumentos válidos ou sem observação correspondente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer um contrato comum de estratégia que aceite uma entrada e retorne resposta, trace e métricas.
- **FR-002**: O trace MUST conter eventos tipados dos tipos `thought`, `action`, `observation`, `plan`, `critique` e `answer`; cada evento `action` MUST identificar a ferramenta e seus argumentos.
- **FR-003**: O sistema MUST fornecer uma única configuração compartilhada do modelo, usando `OPENROUTER_API_KEY` e `OPENROUTER_MODEL`, o endpoint base do OpenRouter e temperatura igual a zero.
- **FR-004**: As métricas MUST incluir `IICalls`, definido como a quantidade de chamadas ao modelo, e `latencyMs` para a latência da execução.
- **FR-005**: A estratégia Plan-and-Execute MUST produzir uma lista ordenada de passos, executar um passo por vez e reavaliar os passos restantes depois de cada passo executado.
- **FR-006**: A estratégia Plan-and-Execute MUST encerrar quando não houver passos restantes e MUST limitar a execução a, no máximo, oito passos.
- **FR-007**: O sistema MUST disponibilizar ferramentas para listar alertas por status, abrir incidentes com título, serviço e severidade, e resolver incidentes por identificador.
- **FR-008**: As entradas das ferramentas MUST ser validadas por schemas; uma entrada inválida MUST produzir erro sem mutação de estado.
- **FR-009**: O conjunto inicial MUST incluir cinco serviços e seis alertas variados, sendo três firing e três resolved.
- **FR-010**: O projeto MUST disponibilizar um script executável para aplicar o seed inicial; sua execução MUST produzir de forma reproduzível o conjunto definido em FR-009.
- **FR-011**: A arena MUST executar uma ou mais estratégias sobre a mesma entrada e apresentar resposta, trace e métricas de cada execução.
- **FR-012**: A arena MUST permitir selecionar estratégias com `--strategies` e configurar o limite de interações com `--max-iterations`.
- **FR-013**: Toda estratégia MUST respeitar o limite de interações recebido e contabilizar suas chamadas ao modelo.
- **FR-014**: Testes do store e da formatação de trace MUST ser determinísticos e executáveis sem rede.
- **FR-015**: As ferramentas mock MUST operar exclusivamente sobre o store in-memory seedado; persistência MySQL/Sequelize está fora do escopo desta feature.
- **FR-016**: O sistema MUST fornecer uma estratégia ReAct usando as ferramentas compartilhadas, limitar suas ações de ferramenta ao `maxIterations` recebido (máximo oito) e registrar no trace apenas tool calls, observações e resposta final, sem expor conteúdo interno de raciocínio.

### Key Entities *(include if data is involved)*

- **Estratégia**: Unidade de raciocínio executável que recebe uma entrada e produz resposta, trace e métricas.
- **Evento de trace**: Registro ordenado de uma etapa do raciocínio, planejamento, ação, observação, crítica ou resposta.
- **Plano**: Lista ordenada e limitada de passos necessários para atender à solicitação.
- **Alerta**: Sinal operacional associado a um serviço e a um status, incluindo firing ou resolved.
- **Incidente**: Registro operacional aberto para um serviço, com título, severidade e estado de resolução.
- **Serviço**: Sistema monitorado ao qual alertas e incidentes podem estar associados.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em toda execução concluída, 100% dos resultados incluem resposta, trace e as duas métricas definidas.
- **SC-002**: Em 100% das execuções Plan-and-Execute, o total de passos executados não excede oito e a execução encerra quando não há passos restantes.
- **SC-003**: A execução do seed produz exatamente cinco serviços e seis alertas, com a distribuição de estados especificada, em cada execução repetida.
- **SC-004**: A arena apresenta um resultado separado para cada estratégia selecionada, todas processando a mesma entrada.
- **SC-005**: Os testes do store e da formatação de trace passam de forma repetível sem conexão de rede.
- **SC-006**: Entradas inválidas de ferramenta não alteram alertas nem incidentes em 100% dos casos de teste correspondentes.
- **SC-007**: ReAct e Plan-and-Execute produzem resultados pelo contrato comum e não executam mais ações de ferramenta que o limite recebido.

## Assumptions

- As ferramentas mock representam operações de demonstração e avaliação de alertas e incidentes do OpsPilot.
- O provider e a identificação do modelo são configurados por ambiente; a disponibilidade de credenciais válidas é responsabilidade do ambiente de execução.
- `IICalls` significa contagem de chamadas de LLM, conforme o requisito de contar chamadas de modelo.
- O seed pode ser executado repetidamente sem duplicar os dados iniciais.
- O evento `thought` expõe somente um resumo seguro, não conteúdo de raciocínio interno privado.
- As ferramentas mock usam exclusivamente o store in-memory; persistência MySQL/Sequelize está fora do escopo desta feature.