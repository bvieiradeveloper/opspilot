exemplo de supervisor

const nextSchema = z.object({
    next: z.enum(["analista", "planejador", "executor", "done"]),
    brief: z.string().describe("instrução de trabalho para o próximo papel (nó) ou resumo final de done"),
})

async function supervisor(state: typeof TeamState.State) {
    cons veredict = await createModel().withStructuredOutout(nextSchema).invoke([
    ["system", SUPERVISOR_PROMPT], //papéis disponíveis + critérios de sequência
    ["user", blackboardAsText(state)]
])
    trace.push({
        type: "handoff",
        from: "supervisor",
        to: veredict.next,
        brief: veredict.brief
    })
    return {
        next: veredict.next,
        brief: veredict.brief
    }
}

// aresta condicional: (s) => s.next -> analista, planejador, executor, done

//exemplo de prompt do analista

"Você é o ANALISTA do plantão. Sua única função: produzir diagnóstico FACTUAL do estado atual, as ferramentas de leitura. Liste: alertas disparando (com data e severidade) incidentes recentes (abertos e resolvidos), runbooks relevantes, status dos provedores, janelas/fatos conhecidos do time. NÂO proponha soluções. NÂO abra nem resolva nada. Formato: tópicos telegráficos. Seja cético: se um dado não esta nas observaçoes não afirme"