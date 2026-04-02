import { runInit } from './commands/init.js';
import { runParse, formatDiagnostic } from './commands/parse.js';
import { runWatch } from './commands/watch.js';
import { runDerive } from './commands/derive.js';
import { runGenerate } from './commands/generate.js';
import { runEmitTs } from './commands/emit-ts.js';
import { runTest } from './commands/test.js';
import { runViz } from './commands/viz.js';
import { runSyncStatus } from './commands/sync-status.js';
import { runSyncPropose } from './commands/sync-propose.js';
import { runSyncAccept } from './commands/sync-accept.js';
import { runSchemaStatus } from './commands/schema-status.js';
import { runLint } from './commands/lint.js';
import { runSimulate } from './commands/simulate.js';
import { runAuthLogin } from './commands/auth-login.js';
import { runAuthStatus } from './commands/auth-status.js';
import { runAuthLogout } from './commands/auth-logout.js';

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
  case 'watch': {
    const result = runWatch(args);
    if (!result.started) {
      console.log(result.message);
    }
    break;
  }
  case 'derive': {
    runDerive(args)
      .then((result) => {
        if (result.success) {
          console.log(result.message);
        } else {
          console.error(result.message);
          for (const d of result.diagnostics) {
            console.error(formatDiagnostic(d, result.filePath));
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
  case 'generate': {
    runGenerate(args)
      .then((result) => {
        if (result.success) {
          console.log(result.message);
        } else {
          console.error(result.message);
          for (const d of result.diagnostics) {
            console.error(formatDiagnostic(d, result.filePath));
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
  case 'emit-ts': {
    runEmitTs(args)
      .then((result) => {
        if (result.success) {
          console.log(result.message);
        } else {
          console.error(result.message);
          for (const d of result.diagnostics) {
            console.error(formatDiagnostic(d, result.filePath));
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
  case 'test': {
    runTest(args)
      .then((result) => {
        if (result.success) {
          console.log(result.message);
        } else {
          console.error(result.message);
          for (const d of result.diagnostics) {
            console.error(formatDiagnostic(d, result.filePath));
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
  case 'viz': {
    runViz(args)
      .then((result) => {
        if (result.success) {
          console.log(result.json ?? result.message);
        } else {
          console.error(result.message);
          for (const d of result.diagnostics) {
            console.error(formatDiagnostic(d, result.filePath));
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
  case 'sync': {
    const subcommand = args[0];
    const subArgs = args.slice(1);
    if (subcommand === 'status') {
      runSyncStatus(subArgs)
        .then((result) => {
          if (result.success) {
            console.log(result.message);
          } else {
            console.error(result.message);
            for (const d of result.diagnostics) {
              console.error(formatDiagnostic(d, result.filePath));
            }
            process.exitCode = 1;
          }
        })
        .catch((error: unknown) => {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
        });
    } else if (subcommand === 'propose') {
      runSyncPropose(subArgs)
        .then((result) => {
          if (result.success) {
            console.log(result.message);
          } else {
            console.error(result.message);
            for (const d of result.diagnostics) {
              console.error(formatDiagnostic(d, result.filePath));
            }
            process.exitCode = 1;
          }
        })
        .catch((error: unknown) => {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
        });
    } else if (subcommand === 'accept') {
      runSyncAccept(subArgs)
        .then((result) => {
          if (result.success) {
            console.log(result.message);
          } else {
            console.error(result.message);
            for (const d of result.diagnostics) {
              console.error(formatDiagnostic(d, result.filePath));
            }
            process.exitCode = 1;
          }
        })
        .catch((error: unknown) => {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
        });
    } else {
      console.error(`Error: Unknown sync subcommand '${subcommand ?? ''}'`);
      console.error('Subcommands: status, propose, accept');
      process.exitCode = 1;
    }
    break;
  }
  case 'simulate': {
    runSimulate(args)
      .then((result) => {
        if (result.success) {
          console.log(result.message);
        } else {
          console.error(result.message);
          process.exitCode = 1;
        }
      })
      .catch((error: unknown) => {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
    break;
  }
  case 'schema': {
    const subcommand = args[0];
    const subArgs = args.slice(1);
    if (subcommand === 'status') {
      runSchemaStatus(subArgs)
        .then((result) => {
          if (result.success) {
            console.log(result.message);
          } else {
            console.error(result.message);
            for (const d of result.diagnostics) {
              console.error(formatDiagnostic(d, result.filePath));
            }
            process.exitCode = 1;
          }
        })
        .catch((error: unknown) => {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
        });
    } else {
      console.error(`Error: Unknown schema subcommand '${subcommand ?? ''}'`);
      console.error('Subcommands: status');
      process.exitCode = 1;
    }
    break;
  }
  case 'lint': {
    runLint(args)
      .then((result) => {
        // JSON always goes to stdout for tooling consumption
        if (result.json) {
          console.log(result.message);
        } else if (result.success) {
          console.log(result.message);
        } else {
          console.error(result.message);
        }
        if (!result.success) process.exitCode = 1;
      })
      .catch((error: unknown) => {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
    break;
  }
  case 'auth': {
    const [subcommand] = args;
    const authHandler =
      subcommand === 'login'
        ? runAuthLogin()
        : subcommand === 'status'
          ? runAuthStatus()
          : subcommand === 'logout'
            ? runAuthLogout()
            : undefined;

    if (!authHandler) {
      console.error('Usage: moment auth <login|status|logout>');
      process.exitCode = 1;
    } else {
      authHandler
        .then((result) => {
          if (result.success) {
            console.log(result.message);
          } else {
            console.error(result.message);
            process.exitCode = 1;
          }
        })
        .catch((error: unknown) => {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
        });
    }
    break;
  }
  default:
    if (command) {
      console.error(`Error: Unknown command '${command}'`);
    } else {
      console.error('Usage: moment <command> [options]');
      console.error(
        'Commands: init, parse, watch, derive, generate, emit-ts, test, viz, simulate, sync, schema, lint, auth',
      );
    }
    process.exitCode = 1;
}
