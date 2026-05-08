import { tool } from "langchain";
import * as z from "zod";
import { db } from "@/db";
import { type RunnableConfig } from "@langchain/core/runnables";
import { interrupt } from "@langchain/langgraph";

// Tool to list all tables
export const listTablesTool = tool(
  async () => {
    const tableNames = db.allTables.map(t => t.tableName);
    return tableNames.join(", ");
  },
  {
    name: "sql_db_list_tables",
    description: "Input is an empty string, output is a comma-separated list of tables in the database.",
    schema: z.object({}),
  }
);

// Tool to get schema for specific tables
export const getSchemaTool = tool(
  async ({ table_names }) => {
    const tables = table_names.split(",").map(t => t.trim());
    return await db.getTableInfo(tables);
  },
  {
    name: "sql_db_schema",
    description: "Input to this tool is a comma-separated list of tables, output is the schema and sample rows for those tables. Be sure that the tables actually exist by calling sql_db_list_tables first! Example Input: table1, table2, table3",
    schema: z.object({
      table_names: z.string().describe("Comma-separated list of table names"),
    }),
  }
);

// Tool to execute SQL query
export const queryTool = tool(
  async ({ query }) => {
    try {
      const result = await db.run(query);
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (error:any) {
      return `Error: ${error.message}`;
    }
  },
  {
    name: "sql_db_query",
    description: "Input to this tool is a detailed and correct SQL query, output is a result from the database. If the query is not correct, an error message will be returned. If an error is returned, rewrite the query, check the query, and try again.",
    schema: z.object({
      query: z.string().describe("SQL query to execute"),
    }),
  }
);

export const tools = [listTablesTool, getSchemaTool, queryTool];

export const queryToolWithInterrupt = tool(
  async (input, config: RunnableConfig) => {
    const request = {
      action: queryTool.name,
      args: input,
      description: "Please review the tool call",
    };
    const response = interrupt([request]);
    // approve the tool call
    if (response.type === "accept") {
      const toolResponse = await queryTool.invoke(input, config);
      return toolResponse;
    }
    // update tool call args
    else if (response.type === "edit") {
      const editedInput = response.args.args;
      const toolResponse = await queryTool.invoke(editedInput, config);
      return toolResponse;
    }
    // respond to the LLM with user feedback
    else if (response.type === "response") {
      const userFeedback = response.args;
      return userFeedback;
    } else {
      throw new Error(`Unsupported interrupt response type: ${response.type}`);
    }
  },
  {
    name: queryTool.name,
    description: queryTool.description,
    schema: queryTool.schema,
  }
);