import express from "express";
import type { Request, Response, NextFunction } from "express";
import { Command } from "@langchain/langgraph";
import { agentWithHuman } from "./agent";

const app = express();
app.use(express.json());

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});


const send = (res: Response, data: object) =>
  res.write(`data: ${JSON.stringify(data)}\n\n`);

const NODE_STATUS: Record<string, string> = {
  list_tables:     "Listing available tables...",
  call_get_schema: "Analyzing table schema...",
  get_schema:      "Loading schema details...",
  generate_query:  "Generating SQL query...",
  check_query:     "Validating query...",
  run_query:       "Executing query...",
};

async function streamUntilDone(res: Response, threadId: string, input: any) {
  const config = { configurable: { thread_id: threadId }, recursionLimit: 10 };

  const stream = await agentWithHuman.stream(input, {
    ...config,
    streamMode: "updates",
  });

  for await (const update of stream) {
    for (const [node, state] of Object.entries(update as Record<string, any>)) {
      const status = NODE_STATUS[node];
      if (status) send(res, { status });

      for (const msg of (state?.messages ?? []) as any[]) {
        const type: string = msg._getType?.() ?? msg.constructor?.name ?? "unknown";
        const hasToolCalls: boolean = msg.tool_calls?.length > 0;
        if (type === "ai" && !hasToolCalls && msg.content) {
          const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
          if (content.startsWith("Available tables:")) continue;
          console.log("LLM response:", content);
          send(res, { text: content });
        }
      }
    }
  }

  // Check for interrupt
  const state = await agentWithHuman.getState(config);
  if (state.next.length > 0) {
    const interrupt = state.tasks[0]?.interrupts?.[0];
    const query = interrupt?.value?.[0]?.args?.query ?? JSON.stringify(interrupt?.value);
    console.log("Interrupted — pending query:", query);
    send(res, { interrupt: true, query, threadId });
  } else {
    send(res, { done: true });
  }
}

// Start a new conversation
app.post("/api/chat", async (req: Request, res: Response) => {
  const { message, threadId } = req.body;
  const question = message || "give me a list of employee with address";
  const id: string = threadId ?? crypto.randomUUID();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();

  try {
    await streamUntilDone(res, id, {
      messages: [{ role: "user", content: question }],
    });
  } catch (err: any) {
    console.error(err);
    send(res, { error: err.message });
  } finally {
    res.end();
  }
});

// Resume after interrupt
app.post("/api/chat/resume", async (req: Request, res: Response) => {
  const { threadId, type = "accept", query } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();

  try {
    const resume =
      type === "edit" && query
        ? new Command({ resume: { type: "edit", args: { query } } })
        : new Command({ resume: { type: "accept" } });

    await streamUntilDone(res, threadId, resume);
  } catch (err: any) {
    console.error(err);
    send(res, { error: err.message });
  } finally {
    res.end();
  }
});

app.listen(3001, () => console.log("Server running on http://localhost:3001"));
