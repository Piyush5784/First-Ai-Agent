import { END, MemorySaver, START, StateGraph, type ConditionalEdgeRouter } from "@langchain/langgraph";
import { callGetSchema, generateQuery, getSchemaNode, listTables, MessagesState } from "./prompt";
import { queryToolWithInterrupt } from "./tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";

const shouldContinueWithHuman: ConditionalEdgeRouter<typeof MessagesState, "run_query"> = (state) => {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1] as any;
  if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    return END;
  } else {
    return "run_query";
  }
};

const runQueryNodeWithInterrupt = new ToolNode([queryToolWithInterrupt]);

const builderWithHuman = new StateGraph(MessagesState)
  .addNode("list_tables", listTables)
  .addNode("call_get_schema", callGetSchema)
  .addNode("get_schema", getSchemaNode)
  .addNode("generate_query", generateQuery)
  .addNode("run_query", runQueryNodeWithInterrupt)
  .addEdge(START, "list_tables")
  .addEdge("list_tables", "call_get_schema")
  .addEdge("call_get_schema", "get_schema")
  .addEdge("get_schema", "generate_query")
  .addConditionalEdges("generate_query", shouldContinueWithHuman)
  .addEdge("run_query", "generate_query");

const checkpointer = new MemorySaver();
export const agentWithHuman = builderWithHuman.compile({ checkpointer });