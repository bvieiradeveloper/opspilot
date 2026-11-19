async function answerNode(state: typeof GraphState.State){
    //grava histórico, dispara reflector

    RequestSchema.save({
        id: state.RequestId,
        userId: state.userId,
        route: state.route,
        modelUsed: state.result.metrics.modelUsed,
        promptTokens: state.result.metrics.promptTokens,
        latencyMs: state.result.metrics.latencyMs,
        status: "ok"
    })
    state.result.trace.foreach((e, seq) => traceEvents.save({
        requestId: state.requestId,
        seq,
        node: e.node,
        type: e.type,
        payload: e,
    }))
    log.info({requestId: state.requestId, node: "resposta", type: "done", route: state.route, tokens: state.result.metrics.promptTokens})
    return state
}