import React from "react";
import { useRef, useState } from "react";
import type { ChatMessage } from "../models/chat.js";
import { sendChatMessage } from "../services/chat-api.js";
import { MessageList } from "./MessageList.js";

function id(): string {
    return globalThis.crypto.randomUUID();
}

export function Chat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [conversationId, setConversationId] = useState<string | undefined>();
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const sending = useRef(false);

    async function send(text: string, key: string, appendMessage: boolean, existingAssistantId?: string) {
        if (sending.current) return;
        sending.current = true;
        setBusy(true);
        setNotice("Enviando solicitação.");
        const assistantId = existingAssistantId ?? id();
        if (appendMessage) {
            setMessages((current) => [
                ...current,
                { id: id(), role: "user", content: text, status: "complete" },
                { id: assistantId, role: "assistant", content: "", status: "sending", retryKey: key },
            ]);
        } else {
            setMessages((current) => current.map((message) => message.id === assistantId
                ? { ...message, status: "sending", error: undefined }
                : message));
        }

        try {
            const result = await sendChatMessage({
                message: text,
                conversationId,
                idempotencyKey: key,
            });
            setConversationId(result.response.conversationId);
            setMessages((current) => current.map((message) => message.id === assistantId
                ? {
                    ...message,
                    content: result.response.answer,
                    status: result.status === 202 ? "awaiting_approval" : "complete",
                    trace: result.response.trace,
                    approvals: result.response.approvals,
                    retryKey: undefined,
                }
                : message));
            setNotice(result.status === 202 ? "A solicitação aguarda aprovação." : "Resposta recebida.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Não foi possível enviar a solicitação.";
            setMessages((current) => current.map((item) => item.id === assistantId
                ? { ...item, status: "failed", error: message, retryKey: key }
                : item));
            setNotice("Falha ao enviar a solicitação.");
        } finally {
            sending.current = false;
            setBusy(false);
        }
    }

    function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const text = draft.trim();
        if (!text || sending.current) return;
        setDraft("");
        void send(text, id(), true);
    }

    function retry(message: ChatMessage, userText: string) {
        const savedKey = message.retryKey;
        if (!savedKey) return;
        void send(userText, savedKey, false, message.id);
    }

    return (
        <section className="chat" aria-labelledby="chat-title">
            <header className="chat-header">
                <div>
                    <h1 id="chat-title">War Room</h1>
                    <p>Investigue alertas e incidentes com contexto.</p>
                </div>
            </header>
            {messages.length === 0 ? (
                <div className="empty-state">
                    <h2>Comece uma investigação</h2>
                    <p>Envie uma pergunta sobre alertas, incidentes ou serviços monitorados.</p>
                </div>
            ) : (
                <MessageList messages={messages} onRetry={retry} />
            )}
            <form className="chat-form" onSubmit={submit}>
                <label htmlFor="chat-message">Mensagem</label>
                <textarea
                    id="chat-message"
                    value={draft}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                    placeholder="Descreva o que precisa investigar…"
                    rows={3}
                />
                <button type="submit" disabled={busy || !draft.trim()}>Enviar</button>
            </form>
            <p className="live-status" role="status" aria-live="polite">{notice}</p>
        </section>
    );
}
