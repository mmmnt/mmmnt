import { startStdioServer } from './server.js';

startStdioServer().catch((err) => {
  process.stderr.write(`MCP server failed: ${err}\n`);
  process.exit(1);
});
