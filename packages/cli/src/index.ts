#!/usr/bin/env node

import { runInit } from './commands/init.js';

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
  default:
    if (command) {
      console.error(`Error: Unknown command '${command}'`);
    } else {
      console.error('Usage: moment <command> [options]');
      console.error('Commands: init');
    }
    process.exitCode = 1;
}
