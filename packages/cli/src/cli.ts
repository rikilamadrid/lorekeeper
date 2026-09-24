#!/usr/bin/env node
import { run } from './run.js';
import { createPaint } from './terminal.js';

process.exitCode = run(
  process.argv.slice(2),
  {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  },
  createPaint(process.env, process.stdout.isTTY === true),
);
