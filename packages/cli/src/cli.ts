#!/usr/bin/env node
import { tolerateClosedPipe } from './pipe.js';
import { run } from './run.js';
import { createPaint } from './terminal.js';

tolerateClosedPipe(process.stdout);
tolerateClosedPipe(process.stderr);

process.exitCode = run(
  process.argv.slice(2),
  {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  },
  createPaint(
    process.env,
    process.stdout.isTTY === true,
    process.stdout.columns,
    process.platform,
  ),
);
