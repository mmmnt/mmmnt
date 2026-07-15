import { runInit } from './commands/init.js';
import { runParse, formatDiagnostic } from './commands/parse.js';
import { runWatch } from './commands/watch.js';
import { runServe } from './commands/serve.js';
import { runDerive } from './commands/derive.js';
import { runGenerate } from './commands/generate.js';
import { runCucumberJson } from './commands/cucumber-json.js';
import { runEmitTs } from './commands/emit-ts.js';
import { runTest } from './commands/test.js';
import { runViz } from './commands/viz.js';
import { runSyncStatus } from './commands/sync-status.js';
import { runSyncPropose } from './commands/sync-propose.js';
import { runSyncAccept } from './commands/sync-accept.js';
import { runSchemaStatus } from './commands/schema-status.js';
import { runLint } from './commands/lint.js';
import { runImportFromSift } from './commands/import-from-sift.js';
import { runStatus } from './commands/status.js';
import { runReconcile } from './commands/reconcile.js';
import { runSimulate } from './commands/simulate.js';
import { runAuthLogin } from './commands/auth-login.js';
import { runAuthStatus } from './commands/auth-status.js';
import { runAuthLogout } from './commands/auth-logout.js';
import { runAuthQuorum } from './commands/auth-quorum.js';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [command, ...args] = process.argv.slice(2);

const USAGE = `Usage: moment <command> [options]

Commands:
  init                     Initialize a Moment project with a manifest
  parse <file>             Parse and validate a .moment specification
  watch                    Watch .moment files and re-run the pipeline on change
  derive <file>            Derive test topology from a specification
  generate <file>          Generate Gherkin, TypeScript scaffolds, and docs
  emit-ts <file>           Emit TypeScript types and scaffolds
  test <file>              Run structural validation test suites
  simulate <file>          Generate simulation scenarios (--all, --json)
  viz <file>               Emit the visualization data envelope
  serve <file>             Serve topology/scenarios over WebSocket (Facet bridge)
  cucumber-json <file>     Emit Cucumber JSON for Xray import
  lint <file>              Drift + schema lint
  sync <status|propose|accept> <file>
                           Implementation drift detection and proposals
  schema <status> <file>   Schema governance report
  import --from-sift <dir> Import a Sift JSONL export
  reconcile <file>         Reconcile upstream drift (--local | --event <path>)
  status <file>            Unified project status
  auth <login|status|logout|quorum>
                           Manage GitHub and quorum credentials
  quorum <watch> <stream>  Subscribe to a quorum stream into .domain/

Flags:
  -v, --version            Print the CLI version
  -h, --help               Show this help`;

function cliVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

if (command === '--version' || command === '-v' || command === 'version') {
  console.log(cliVersion());
  process.exit(0);
}
if (command === '--help' || command === '-h' || command === 'help' || command === undefined) {
  console.log(USAGE);
  process.exit(command === undefined ? 1 : 0);
}

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
  case 'import': {
    if (args.includes('--from-sift')) {
      const filteredArgs = args.filter((a) => a !== '--from-sift');
      runImportFromSift(filteredArgs)
        .then((result) => {
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
    } else {
      console.error('Usage: moment import --from-sift <.domain/ directory>');
      process.exitCode = 1;
    }
    break;
  }
  case 'reconcile': {
    runReconcile(args)
      .then((result) => {
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
  case 'status': {
    runStatus(args)
      .then((result) => {
        if (result.json) {
          console.log(result.message);
        } else if (result.success && result.message) {
          console.log(result.message);
        } else if (result.message) {
          console.error(result.message);
        }
        if (!result.success) process.exitCode = 1;
        if (result.hasDrift) process.exitCode = 1;
      })
      .catch((error: unknown) => {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
    break;
  }
  case 'auth': {
    const [subcommand, ...authArgs] = args;
    const authHandler =
      subcommand === 'login'
        ? runAuthLogin()
        : subcommand === 'status'
          ? runAuthStatus()
          : subcommand === 'logout'
            ? runAuthLogout()
            : subcommand === 'quorum'
              ? runAuthQuorum(authArgs)
              : undefined;

    if (!authHandler) {
      console.error('Usage: moment auth <login|status|logout|quorum>');
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
  case 'serve': {
    runServe(args)
      .then((result) => {
        if (!result.success) {
          console.error(result.message);
          process.exitCode = 1;
        }
        // If successful, the server stays running — don't exit
      })
      .catch((error: unknown) => {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
    break;
  }
  case 'cucumber-json': {
    runCucumberJson(args)
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
  default:
    console.error(`Error: Unknown command '${command}'`);
    console.error("Run 'moment --help' for usage.");
    process.exitCode = 1;
}
