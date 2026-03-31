import { runInit } from './commands/init.js';
import { runParse, formatDiagnostic } from './commands/parse.js';

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'init': {
    const result = runInit(args);
    if (result.success) {
      console.log(result.message);
    } else {
      console.error(result.message);
      process.exitCode = 1;
    }
    break;
  }
  case 'parse': {
    runParse(args)
      .then((result) => {
        if (result.success) {
          console.log(result.message);
        } else {
          console.error(result.message);
          for (const d of result.diagnostics) {
            console.error(formatDiagnostic(d));
          }
          process.exitCode = 1;
        }
      })
      .catch((error: unknown) => {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
    break;
  }
  default:
    if (command) {
      console.error(`Error: Unknown command '${command}'`);
    } else {
      console.error('Usage: moment <command> [options]');
      console.error('Commands: init, parse');
    }
    process.exitCode = 1;
}
