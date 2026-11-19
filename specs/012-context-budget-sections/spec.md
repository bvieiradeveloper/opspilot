# Feature Specification: Context Budget by Section

**Feature Branch**: `012-context-budget-sections`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "ContextBuilder com orçamento por seção: src/context-builder.ts monta o prompt de TODAS as estratégias com teto por seção via env CONTEXT_BUDGET_*: system e mensagem intocáveis, resumo 200, janela 1200 (corta as mais antigas), memórias 300 (corta menor score). TEste: tetos baixos cortam na ordem certa."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Controlar o tamanho de cada seção do contexto (Priority: P1)

Como operador do sistema, quero definir limites de conteúdo para as seções de contexto, para que os prompts permaneçam dentro de um orçamento previsível e não cresçam sem controle.

**Why this priority**: É a necessidade principal para limitar custos, evitar exceder limites do modelo e manter respostas consistentes em todas as estratégias.

**Independent Test**: Executar a montagem de um prompt com limites baixos e confirmar que os limites são respeitados e que a ordem de redução está correta.

**Acceptance Scenarios**:

1. **Given** que existem conteúdo de sistema e mensagem do usuário disponíveis, **When** o contexto é montado, **Then** ambos devem permanecer integralmente presentes independentemente dos limites das demais seções.
2. **Given** que o conteúdo de resumo excede seu limite configurado, **When** o contexto é montado, **Then** o resumo deve ser limitado ao teto máximo configurado sem remover conteúdo das seções intocáveis.
3. **Given** que a janela de conversa excede seu limite configurado, **When** o contexto é montado, **Then** os registros mais antigos devem ser removidos antes dos registros mais recentes até o teto ser atendido.
4. **Given** que as memórias excedem seu limite configurado, **When** o contexto é montado, **Then** as memórias com menor pontuação devem ser removidas primeiro até o teto ser atendido.

---

### User Story 2 - Aplicar orçamento a todas as estratégias (Priority: P2)

Como responsável pela plataforma, quero que toda estratégia que utiliza o ContextBuilder aplique o mesmo orçamento por seção, para evitar diferenças inesperadas de comportamento entre estratégias.

**Why this priority**: Garante consistência operacional e impede que uma estratégia ignore a proteção de tamanho do contexto.

**Independent Test**: Montar prompts por cada estratégia disponível com conteúdo excedente e verificar que todas aplicam os mesmos tetos.

**Acceptance Scenarios**:

1. **Given** uma estratégia disponível utiliza o ContextBuilder, **When** seu prompt contém conteúdo excedente, **Then** o mesmo conjunto de tetos por seção deve ser aplicado.
2. **Given** nenhuma configuração adicional é fornecida, **When** um prompt é montado, **Then** devem ser usados os valores padrão do orçamento por seção.

---

### User Story 3 - Verificar cortes com limites baixos em testes (Priority: P3)

Como desenvolvedor de qualidade, quero um teste determinístico para tetos baixos, para comprovar que o mecanismo corta primeiro a seção correta.

**Why this priority**: Protege contra regressões nas regras de ordenação e garante que mensagens recentes, conteúdo prioritário do usuário e informações de sistema não sejam removidos acidentalmente.

**Independent Test**: Executar testes automatizados com limites baixos em resumo, janela e memórias e comparar o conteúdo resultante com a ordem esperada.

**Acceptance Scenarios**:

1. **Given** um orçamento baixo para o resumo, **When** o teste monta o contexto, **Then** o resultado deve conter somente o conteúdo do resumo permitido pelo teto.
2. **Given** um orçamento baixo para a janela com entradas antigas e recentes, **When** o teste monta o contexto, **Then** entradas antigas devem ser removidas enquanto entradas recentes forem preservadas sempre que possível.
3. **Given** um orçamento baixo para memórias com pontuações distintas, **When** o teste monta o contexto, **Then** memórias de menor pontuação devem ser removidas antes das de maior pontuação.

---

### Edge Cases

- Se o orçamento configurado for zero ou negativo, o sistema deve rejeitar a configuração inválida ou aplicar o comportamento seguro definido antes da montagem do prompt.
- Se uma seção tiver menos conteúdo que seu teto, todo o conteúdo dessa seção deve ser preservado.
- Se houver empates entre pontuações de memórias, o sistema deve manter uma ordem determinística e documentada para o corte.
- Se os limites forem maiores que o conteúdo disponível, nenhuma seção deve ser artificialmente preenchida ou reduzida além do necessário.
- Se uma seção obrigatória já exceder um limite total por não possuir limite próprio, o sistema deve preservar essa seção e seguir para as seções opcionais conforme a prioridade definida.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o orçamento seja configurado separadamente para o resumo, o histórico de conversa e as memórias.
- **FR-002**: O sistema MUST manter o conteúdo de sistema e a mensagem atual integralmente presentes em toda montagem de contexto.
- **FR-003**: O sistema MUST aplicar o teto padrão de 100 unidades ao resumo.
- **FR-004**: O sistema MUST aplicar o teto padrão de 300 unidades ao histórico de conversa.
- **FR-005**: O sistema MUST aplicar o teto padrão de 100 unidades às memórias.
- **FR-006**: Quando o histórico exceder seu teto, o sistema MUST remover primeiro as entradas mais antigas.
- **FR-007**: Quando as memórias excederem seu teto, o sistema MUST remover primeiro as memórias de menor pontuação.
- **FR-008**: O sistema MUST aplicar as mesmas regras de orçamento a todas as estratégias que montam prompts por meio do ContextBuilder.
- **FR-009**: O sistema MUST aceitar limites obtidos das configurações de ambiente chamadas CONTEXT_BUDGET_SUMMARY, CONTEXT_BUDGET_HISTORY e CONTEXT_BUDGET_MEMORIES.
- **FR-010**: O sistema MUST fornecer testes automatizados que comprovem os cortes por teto baixo, a preservação das seções intocáveis e a ordem correta dos cortes.
- **FR-011**: O sistema MUST rejeitar ou informar explicitamente valores de configuração inválidos antes de usar o conteúdo para montar o prompt.
- **FR-012**: O sistema MUST preservar a ordem relativa dos itens restantes após cada operação de corte.

### Key Entities *(include if feature involves data)*

- **Context Section**: Parte do prompt com conteúdo próprio e política de teto: sistema, mensagem atual, resumo, janela ou memórias.
- **Section Budget**: Limite configurado para uma seção opcional, com valor padrão associado ao resumo, à janela ou às memórias.
- **Conversation Entry**: Registro da janela de conversa com posição temporal usada para identificar entradas antigas e recentes.
- **Memory Record**: Informação recuperada com pontuação que determina a prioridade de preservação quando o teto é excedido.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos cenários de teste das estratégias existentes, o conteúdo de sistema e a mensagem atual permanecem íntegros.
- **SC-002**: Em 100% dos cenários com conteúdo excedente, o resumo, a janela e as memórias não ultrapassam seus tetos configurados.
- **SC-003**: Em testes com janela excedente, pelo menos 95% das entradas preservadas são as mais recentes e nenhuma entrada recente é removida enquanto houver entradas mais antigas elegíveis.
- **SC-004**: Em testes com memórias excedentes, 100% das primeiras remoções correspondem às memórias de menor pontuação.
- **SC-005**: A suíte cobre todas as estratégias disponíveis e confirma o resultado esperado em menos de um minuto de execução automatizada.
- **SC-006**: A suíte identifica configurações inválidas sem montagem parcial ou silenciosa do prompt em 100% dos casos cobertos.

## Assumptions

- Os tetos são medidos por unidades compatíveis com a representação utilizada pelo contexto, sem alterar o conteúdo textual original quando ele cabe integralmente.
- Os valores padrão são 200 para resumo, 1200 para janela e 300 para memórias, quando nenhuma configuração válida é fornecida.
- O conteúdo de sistema e a mensagem atual não participam do corte por orçamento.
- Estratégias já existentes são consideradas no alcance porque todas montam prompts por meio do ContextBuilder.
- Em empates de pontuação de memórias, o sistema mantém uma ordem determinística; nenhuma ordem aleatória deve afetar o corte.
- Configurações inválidas serão tratadas de forma explícita, preferencialmente rejeitando-as antes da montagem do prompt.
