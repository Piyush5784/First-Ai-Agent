import fs from "node:fs/promises";
import path from "node:path";
import { SqlDatabase } from "@langchain/classic/sql_db";
import { DataSource } from "typeorm";



// const url = "https://storage.googleapis.com/benchmarks-artifacts/chinook/Chinook.db";
const localPath = path.resolve("AdventureWorksDW.db");


export async function resolveDbPath() {
  const exists = await fs.access(localPath).then(() => true).catch(() => false);
  if (exists) {
    console.log(`${localPath} already exists, skipping download.`);
    return localPath;
  }
  // const resp = await fetch(url);
  // if (!resp.ok) throw new Error(`Failed to download DB. Status code: ${resp.status}`);
  // const buf = Buffer.from(await resp.arrayBuffer());
  // await fs.writeFile(localPath, buf);
  // console.log(`File downloaded and saved as ${localPath}`);
  return localPath;
}




export const dbPath = await resolveDbPath();
export const datasource = new DataSource({ type: "sqlite", database: dbPath });
export const db = await SqlDatabase.fromDataSourceParams({ appDataSource: datasource });
export const dialect = db.appDataSourceOptions.type;
