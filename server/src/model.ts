import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";
dotenv.config()

// export const model = new ChatOpenAI({
//   model: "openai/gpt-4.1-mini", 
//   apiKey,
// });


// import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

// export const model = new ChatGoogleGenerativeAI({
//    model: "gemini-2.0-flash-lite",
//   apiKey
// });


// export const AGENT_MODELS = {
//   gemma: "google/gemma-4-31b-it:free",
//   llama: "meta-llama/llama-3.3-70b-instruct:free",
//   grok: "x-ai/grok-3-mini-beta:free",
//   nemotron: "nvidia/nemotron-3-super-120b-a12b:free",

// } as const;


export const model = new ChatOpenAI({
  model: "openrouter/free",
  apiKey: process.env.OPENROUTER_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

// export const model = new ChatOpenAI({
//   model: "",
//   apiKey: process.env.OPENROUTER_KEY,
//   configuration: {
//     baseURL: "https://openrouter.ai/api/v1",
//   },
// });