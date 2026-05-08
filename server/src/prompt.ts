import { AIMessage, ToolMessage, SystemMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { StateSchema, MessagesValue, type GraphNode, StateGraph, START, END } from "@langchain/langgraph";
import { getSchemaTool, listTablesTool, queryTool } from "./tools";
import { model } from "./model";
import { dialect } from "./db";

function currentTurnMessages(messages: BaseMessage[]): BaseMessage[] {
  let lastHumanIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && msg.getType() === "human") { lastHumanIdx = i; break; }
  }
  return lastHumanIdx === -1 ? messages : messages.slice(lastHumanIdx);
}

export const getSchemaNode = new ToolNode([getSchemaTool]);
export const runQueryNode = new ToolNode([queryTool]);

// Define state schema
export const MessagesState = new StateSchema({
  messages: MessagesValue,
});

// Example: create a predetermined tool call
// export const listTables: GraphNode<typeof MessagesState> = async (state) => {
//   const toolCall = {
//     name: "sql_db_list_tables",
//     args: {},
//     id: "abc123",
//     type: "tool_call" as const,
//   };
//   const toolCallMessage = new AIMessage({
//     content: "",
//     tool_calls: [toolCall],
//   });

//   const toolMessage = await listTablesTool.invoke({});
//   const response = new AIMessage(`Available tables: ${toolMessage}`);

//   return { messages: [toolCallMessage, new ToolMessage({ content: toolMessage, tool_call_id: "abc123" }), response] };
// };
export const listTables: GraphNode<typeof MessagesState> = async () => {
  const tableNames = await listTablesTool.invoke({});
  return {
    messages: [new ToolMessage({ content: tableNames, tool_call_id: "list_tables" })],
  };
};

// Example: force a model to create a tool call
export const callGetSchema: GraphNode<typeof MessagesState> = async (state) => {
  const llmWithTools = model.bindTools([getSchemaTool], {
    tool_choice: "any",
  });
  const response = await llmWithTools.invoke(currentTurnMessages(state.messages));

  return { messages: [response] };
};

const topK = 5;

const generateQuerySystemPrompt = `
You are an agent designed to interact with a SQL database.
Given an input question, create a syntactically correct ${dialect}
query to run, then look at the results of the query and return the answer. Unless
the user specifies a specific number of examples they wish to obtain, always limit
your query to at most ${topK} results.

You can order the results by a relevant column to return the most interesting
examples in the database. Never query for all the columns from a specific table,
only ask for the relevant columns given the question.

DO NOT make any DML statements (INSERT, UPDATE, DELETE, DROP etc.) to the database.
`;

export const generateQuery: GraphNode<typeof MessagesState> = async (state) => {
  const systemMessage = new SystemMessage(generateQuerySystemPrompt);
  // We do not force a tool call here, to allow the model to
  // respond naturally when it obtains the solution.
  const llmWithTools = model.bindTools([queryTool]);
  const response = await llmWithTools.invoke([systemMessage, ...currentTurnMessages(state.messages)]);

  return { messages: [response] };
};

export const checkQuerySystemPrompt = `
You are a SQL expert with a strong attention to detail.
Double check the ${dialect} query for common mistakes, including:
- Using NOT IN with NULL values
- Using UNION when UNION ALL should have been used
- Using BETWEEN for exclusive ranges
- Data type mismatch in predicates
- Properly quoting identifiers
- Using the correct number of arguments for functions
- Casting to the correct data type
- Using the proper columns for joins

If there are any of the above mistakes, rewrite the query. If there are no mistakes,
just reproduce the original query.

You will call the appropriate tool to execute the query after running this check.
`;

export const checkQuery: GraphNode<typeof MessagesState> = async (state) => {
  const systemMessage = new SystemMessage(checkQuerySystemPrompt);

  // Generate an artificial user message to check
  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    throw new Error("No tool calls found in the last message");
  }
  const toolCall = lastMessage.tool_calls[0];
  const userMessage = new HumanMessage(toolCall.args.query);
  const llmWithTools = model.bindTools([queryTool], {
    tool_choice: "any",
  });
  const response = await llmWithTools.invoke([systemMessage, userMessage]);
  // Preserve the original message ID
  response.id = lastMessage.id;

  return { messages: [response] };
};


