import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { createChatModelRunnable, getModelCandidates } from "../agents/model.js";
import type { ConversationMessage } from "../store/conversation-store.js";

export const SUMMARIZER_PROMPT = `Comprima o trecho de conversa a seguir em no máximo 150 tokens, preservando obrigatoriamente: decisões tomadas, fatos estabelecidos (nomes, datas, prazos, preferências), incidentes abertos/fechados, resolvidos e pendências abertas. Descarte cumprimentos e conversa social. Se houver um resumo anterior, incorpore-o. Responda só o resumo, em tópicos telegráficos.`;

export interface ConversationSummarizer {
    summarize(previousSummary: string | null, batch: readonly ConversationMessage[]): Promise<string>;
}

export function createConversationSummarizer(): ConversationSummarizer {
    return {
        async summarize(previousSummary, batch) {
            const transcript = batch.map(({ role, content, sequence }) => `${sequence}. ${role}: ${content}`).join("\n");
            const response = await createChatModelRunnable(getModelCandidates()).invoke([
                new SystemMessage(SUMMARIZER_PROMPT),
                new HumanMessage(`Resumo anterior:\n${previousSummary ?? "Nenhum"}\n\nTrecho novo:\n${transcript}`),
            ]);
            const content = typeof response.content === "string"
                ? response.content
                : response.content.map((part) => typeof part === "string" ? part : ("text" in part ? part.text : "")).join("");
            const summary = content.trim();
            if (!summary) throw new Error("The summarizer returned an empty summary.");
            return summary;
        },
    };
}
