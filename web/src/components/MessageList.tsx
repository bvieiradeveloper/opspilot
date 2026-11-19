import React from "react";
import { useRef, useState } from "react";
import type { ChatMessage } from "../models/chat.js";
import { AssistantMarkdown } from "./AssistantMarkdown.js";
import { ApprovalCard } from "./ApprovalCard.js";
import { TracePanel } from "./TracePanel.js";

export function MessageList({
    messages,
    onRetry,
}: {
    messages: ChatMessage[];
    onRetry: (message: ChatMessage, userText: string) => void;
}) {
    const [traceMessageId, setTraceMessageId] = useState<string | null>(null);
    const traceOpener = useRef<HTMLButtonElement>(null);
    const selected = messages.find((message) => message.id === traceMessageId);

    function closeTrace() {
        setTraceMessageId(null);
        requestAnimationFrame(() => traceOpener.current?.focus());
    }

    return (
        <>
            <ol className="message-list" aria-label="Conversa">
                {messages.map((message, index) => (
                    <li key={message.id} className={`message message-${message.role}`}>
                        <h2>{message.role === "user" ? "Você" : "OpsPilot"}</h2>
                        {message.role === "assistant" && message.status !== "sending"
                            ? <AssistantMarkdown content={message.content} />
                            : <p>{message.content}</p>}
                        {message.status === "sending" && <p role="status">Processando sua solicitação…</p>}
                        {message.status === "failed" && (
                            <>
                                <p role="alert">{message.error}</p>
                                {index > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => onRetry(message, messages[index - 1]?.content ?? "")}
                                    >
                                        Tentar novamente
                                    </button>
                                )}
                            </>
                        )}
                        {message.role === "assistant" && message.trace && (
                            <button
                                type="button"
                                aria-label={`Ver raciocínio da resposta ${index + 1}`}
                                onClick={(event) => {
                                    traceOpener.current = event.currentTarget;
                                    setTraceMessageId(message.id);
                                }}
                            >
                                Ver raciocínio
                            </button>
                        )}
                        {message.approvals?.map((approval) => <ApprovalCard key={approval.id} proposal={approval} />)}
                    </li>
                ))}
            </ol>
            {selected?.trace && <TracePanel events={selected.trace} onClose={closeTrace} />}
        </>
    );
}
