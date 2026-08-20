"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, X } from "lucide-react";

interface SuggestedQuestion {
  id: string;
  question: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const FALLBACK_TEXT = "No pude responder ahora. Probá de nuevo en un momento.";

/**
 * El panel del chat en sí — mensajes efímeros en memoria (se pierden al
 * cerrar/recargar la página, a propósito: no hace falta persistir historial
 * de chat para nada de lo pedido, y el tope de mensajes/día ya lo resuelve
 * `AiUsageEvent` del lado del backend).
 */
export default function FlikkerChatbotPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggested, setSuggested] = useState<SuggestedQuestion[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/proxy/insights/chatbot/suggested-questions")
      .then((res) => (res.ok ? (res.json() as Promise<SuggestedQuestion[]>) : []))
      .then(setSuggested)
      .catch(() => setSuggested([]));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/proxy/insights/chatbot/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as {
        text?: string;
      } | null;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data?.text ?? FALLBACK_TEXT },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: FALLBACK_TEXT },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[20px] border border-[#E8EAF0] bg-white shadow-[0_28px_60px_-16px_rgba(17,22,59,0.32)]">
      <div className="flex items-center justify-between gap-2 border-b border-[#EEF0F5] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="font-display text-sm font-bold text-[#1A202C]">
            Preguntale a Flikker
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el asistente"
          className="rounded-[8px] p-1.5 text-[#8891A4] hover:bg-[#F3F4F7] hover:text-[#1A202C]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flikker-scrollbar-hidden flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && (
          <div>
            <p className="text-sm text-[#8891A4]">
              Preguntame cómo usar Flikker o sobre los números de tu negocio.
            </p>
            {suggested.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {suggested.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => void send(q.question)}
                    className="rounded-full border border-[#E5E6EC] bg-[#F9FAFD] px-3 py-1.5 text-xs font-medium text-[#4A5568] hover:border-[#5C6BC0]/30 hover:bg-[#EEF0FB] hover:text-[#5C6BC0]"
                  >
                    {q.question}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-[14px] px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-[#5C6BC0] text-white"
                  : "bg-[#F3F4F7] text-[#1A202C]"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-[14px] bg-[#F3F4F7] px-3.5 py-2.5 text-sm text-[#8891A4]">
              Pensando…
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2 border-t border-[#EEF0F5] p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribí tu pregunta…"
          className="flex-1 rounded-[10px] border border-[#E5E6EC] bg-[#F9FAFD] px-3 py-2 text-sm text-[#1A202C] outline-none focus:border-[#5C6BC0]/40"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Enviar"
          className="flk-glossy flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#5C6BC0] text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
