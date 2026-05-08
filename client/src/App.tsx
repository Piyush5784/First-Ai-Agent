import { useRef, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "./components/ui/card";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type InterruptState = {
  query: string;
  threadId: string;
};

async function* readSSE(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      yield JSON.parse(part.slice(6));
    }
  }
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [interrupt, setInterrupt] = useState<InterruptState | null>(null);
  const threadIdRef = useRef(crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, interrupt]);

  async function runStream(url: string, body: object) {
    setLoading(true);
    setStatus("");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      for await (const event of readSSE(res)) {
        if (event.status) {
          setStatus(event.status);
        } else if (event.text) {
          setStatus("");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: event.text } : m,
            ),
          );
        } else if (event.interrupt) {
          threadIdRef.current = event.threadId;
          // remove the empty assistant placeholder
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          setInterrupt({ query: event.query, threadId: event.threadId });
        } else if (event.done) {
          break;
        } else if (event.error) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Error: ${event.error}` }
                : m,
            ),
          );
        }
      }
    } finally {
      setLoading(false);
      setStatus("");
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading || interrupt) return;

    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text },
    ]);

    await runStream(`${SERVER_URL}/api/chat`, {
      message: text,
      threadId: threadIdRef.current,
    });
  }

  async function handleAccept() {
    const threadId = interrupt!.threadId;
    setInterrupt(null);
    await runStream(`${SERVER_URL}/api/chat/resume`, {
      threadId,
      type: "accept",
    });
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
          AI
        </div>
        <div>
          <p className="font-semibold leading-none">SQL Agent</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Powered by LangGraph
          </p>
        </div>
      </div>

      {/* Main content: chat left, description right */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Chat panel */}
        <div className="flex flex-col flex-1 min-w-0 border-r">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.length === 0 && !loading && (
                <div className="text-center text-muted-foreground py-20">
                  <p className="text-lg font-medium">
                    Ask me anything about the database
                  </p>
                  <p className="text-sm mt-1">
                    Try: "give me a list of employees with address"
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-primary shrink-0 flex items-center justify-center text-primary-foreground text-xs font-bold mt-1">
                      AI
                    </div>
                  )}

                  {msg.content && (
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2.5 max-w-[75%] text-sm min-w-0 overflow-hidden",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted rounded-tl-sm",
                      )}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-invert prose-sm wrap-break-word">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <span className="whitespace-pre-wrap">
                          {msg.content}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Interrupt card */}
              {interrupt && (
                <div className="flex justify-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-yellow-600 shrink-0 flex items-center justify-center text-white text-xs font-bold mt-1">
                    !
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 max-w-[75%] min-w-0 space-y-3">
                    <p className="text-sm font-medium">
                      Agent wants to run this SQL query:
                    </p>
                    <pre className="bg-background rounded-lg px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                      {interrupt.query}
                    </pre>
                    <Button size="sm" onClick={handleAccept} className="gap-2">
                      <CheckCheck className="w-4 h-4" />
                      Accept & Run
                    </Button>
                  </div>
                </div>
              )}

              {/* Loader */}
              {loading && (
                <div className="flex justify-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary shrink-0 flex items-center justify-center text-primary-foreground text-xs font-bold">
                    AI
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{status || "Thinking..."}</span>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input */}
          <div className="border-t px-4 py-4 shrink-0">
            <div className="max-w-2xl mx-auto flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask about the database..."
                disabled={loading || !!interrupt}
                rows={1}
                className="flex-1 resize-none min-h-0"
              />
              <Button
                onClick={sendMessage}
                disabled={loading || !input.trim() || !!interrupt}
                size="icon"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right: Description panel */}
        <div className="flex flex-col w-[40%] shrink-0">
          <div className="border-b px-4 py-3 shrink-0">
            <p className="text-sm font-semibold">Note:- </p>
          </div>
          <Card className="h-full rounded-none border-0 px-2">
            <CardHeader className="space-y-4 px-6 py-6">
              <p className="text-xl font-bold">
                This is a SQL Agent that runs queries on the database.
              </p>
              <ul className="space-y-3 text-base  list-disc">
                <li> This is just a demo ai agent, a testing tool</li>
                <li> Runs only read-only queries</li>
                <li> Human approval is needed before executing query.</li>
                <li>
                  {" "}
                  Many users trying it at the same time might get a 400 rate
                  limit (try again in that case).
                </li>
                <li>
                  {" "}
                  Free to use for everyone, no signin/signup, no api keys
                  needed.
                </li>
                <li>
                  {" "}
                  Runs only on a DB dump, not the actual DB no data loss, feel
                  free to try
                </li>
                <li> Uses LangChain + LangGraph</li>
                <li> All inputs are tracked on LangSmith</li>
              </ul>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
}
