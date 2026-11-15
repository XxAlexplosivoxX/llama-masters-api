// Local server under Bun: the same app, reading exports from a folder (default: the fixture).
//   DATA_DIR=fixture PORT=8787 bun run src/server.ts
import { createApp } from "./app";
import { FileStore } from "./file-store";

const store = new FileStore(process.env.DATA_DIR ?? `${import.meta.dir}/../fixture`);
const app = createApp(() => store);
const port = Number(process.env.PORT ?? 8787);

export default { port, fetch: app.fetch };
console.log(`llama-masters api on http://localhost:${port} (data: ${process.env.DATA_DIR ?? "fixture"})`);
