import type { InstructionsRequest } from "@/git/pr-instructions";

/** What the agent needs to know about `paseo.json` without fetching the public docs. */
const PASEO_CONFIG_REFERENCE = `## paseo.json reference

Paseo reads \`paseo.json\` from the repository root. There is no local-only variant, so the file
is shared with everyone who uses Paseo on this repository.

\`\`\`json
{
  "worktree": {
    "setup": "npm ci\\ncp \\"$PASEO_SOURCE_CHECKOUT_PATH/.env\\" .env",
    "teardown": "rm -rf .cache"
  },
  "scripts": {
    "test": { "command": "npm test" },
    "web": { "command": "npm run dev -- --port $PASEO_PORT", "type": "service" }
  }
}
\`\`\`

- \`worktree.setup\` runs once after Paseo creates a worktree for a workspace. A fresh worktree has
  no installed dependencies and no ignored files such as \`.env\`, so setup installs dependencies
  and copies what the workspace needs. It accepts a multiline shell script or an array of commands.
- \`worktree.teardown\` runs when the workspace is archived, before the worktree is removed.
- Setup and teardown run with the worktree as the working directory.
  \`$PASEO_SOURCE_CHECKOUT_PATH\` points at the original checkout, for untracked files like \`.env\`.
- Paseo reads setup and teardown from the committed \`paseo.json\` on the base branch, so the
  change takes effect for new workspaces after it is committed.
- \`scripts\` are named commands the user runs on demand from the Run panel. A script with
  \`"type": "service"\` is a long-running process: Paseo supervises it, assigns it a port through
  \`$PASEO_PORT\`, and routes HTTP traffic to it. Omit \`port\` so each worktree gets its own port.
  Omit \`type\` for one-off commands such as tests.

Full reference: https://paseo.sh/docs/worktrees`;

const SHARED_RULES = `## Rules

- If \`paseo.json\` already exists, preserve its settings unless they are clearly wrong.
- Follow the repository's package manager, lockfile, and existing scripts. Read the package files,
  lockfiles, README and contributing docs, Makefile or justfile, Docker or Procfile config, and any
  \`scripts/\` or \`bin/\` directory before choosing commands.
- Keep every command simple, non-interactive, non-destructive, and safe to run in a fresh
  worktree.
- Validate the JSON after editing.
- Don't commit. Summarize what you configured and why, then tell me how to try it.`;

function buildSetupScriptInstructions(): string {
  return `# Add a Paseo setup script

Inspect this repository and add a \`worktree.setup\` script to \`paseo.json\` in the repository root,
so new Paseo workspaces are ready to run without manual steps. Add \`worktree.teardown\` only when
the workspace creates something that must be cleaned up.

${SHARED_RULES}

${PASEO_CONFIG_REFERENCE}`;
}

function buildRunScriptInstructions(): string {
  return `# Add Paseo run scripts

Inspect this repository and add \`scripts\` to \`paseo.json\` in the repository root, so I can run
tests and the development server from Paseo's Run panel. Mark long-running servers as services
and bind them to \`$PASEO_PORT\` when the project accepts a configurable port. If the repository has no setup
script yet, add \`worktree.setup\` as well.

${SHARED_RULES}

${PASEO_CONFIG_REFERENCE}`;
}

export function buildSetupScriptRequest(): InstructionsRequest {
  return {
    text: "Add a setup script",
    file: { name: "Paseo setup script.md", instructions: buildSetupScriptInstructions() },
  };
}

export function buildRunScriptRequest(): InstructionsRequest {
  return {
    text: "Add run scripts",
    file: { name: "Paseo run scripts.md", instructions: buildRunScriptInstructions() },
  };
}
