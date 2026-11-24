---
'@mmmnt/cli': patch
---

Every command refuses a flag it does not take.

- cli: a flag the command does not declare fails the run with exit 2 and runs nothing. The error names the flag and lists the flags the command takes. Before, every command but `generate` and `simulate` ignored it, so `moment emit-ts <spec> --out-dir <dir>` wrote into the current directory; `generate` and `simulate` printed a warning and ran.

Behaviour change: a command line that passed a flag the command does not take, and ran anyway, now exits 2. That includes `generate` and `simulate`, which only warned. Every flag and alias in the CLI README still works: `--out`, `--out-dir` and `-o` on `generate`, `--out` on `simulate`, `-o` on `emit-ts`, `-p` on `serve`, `-n` and `-d` on `init`, `-d` on `watch`.
