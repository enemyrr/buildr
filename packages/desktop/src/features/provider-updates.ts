import { execFile } from "node:child_process";
import { access, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execute = promisify(execFile);
const Provider = z.enum(["claude", "codex"]);
type ProviderId = z.infer<typeof Provider>;
const packageNames = { claude: "@anthropic-ai/claude-code", codex: "@openai/codex" } as const;
const inFlight = new Set<ProviderId>();

export function parseCliVersion(output: string): string {
  const version = output.match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/)?.[0];
  if (!version) throw new Error("The agent did not report a recognizable version.");
  return version;
}

export function isNewerCliVersion(installed: string, latest: string): boolean {
  const current = installed.split(/[.-]/).slice(0, 3).map(Number);
  const target = latest.split(/[.-]/).slice(0, 3).map(Number);
  for (let index = 0; index < 3; index++) {
    if (target[index] !== current[index]) return target[index]! > current[index]!;
  }
  return installed.includes("-") && !latest.includes("-");
}

export function providerUpdateCommand(
  provider: ProviderId,
  binaryPath: string,
): { command: string; args: string[] } | null {
  const normalized = binaryPath.replace(/\\/g, "/");
  const cask = normalized.match(/\/Caskroom\/([^/]+)\//)?.[1];
  if (cask && ["claude-code", "claude-code@latest", "codex"].includes(cask)) {
    return { command: "brew", args: ["upgrade", "--cask", cask] };
  }
  if (normalized.includes(`/node_modules/${packageNames[provider]}/`)) {
    return { command: "npm", args: ["install", "-g", `${packageNames[provider]}@latest`] };
  }
  if (normalized.includes(`/.local/share/${provider}/`) || normalized.includes(`/.${provider}/`)) {
    return { command: provider, args: ["update"] };
  }
  return null;
}

async function findExecutable(command: string): Promise<string> {
  const extensions = process.platform === "win32" ? [".exe", ""] : [""];
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Continue through PATH; no shell is needed to resolve the executable.
      }
    }
  }
  throw new Error(`${command} is not installed or is not on PATH.`);
}

export async function checkProviderUpdate(rawProvider: unknown) {
  const provider = Provider.parse(rawProvider);
  const executable = await findExecutable(provider);
  const binaryPath = await realpath(executable);
  const { stdout } = await execute(executable, ["--version"], {
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });
  const installedVersion = parseCliVersion(stdout);
  const response = await fetch(`https://registry.npmjs.org/${packageNames[provider]}/latest`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Could not check the latest version (HTTP ${response.status}).`);
  const { version } = z
    .object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) })
    .parse(await response.json());
  const command = providerUpdateCommand(provider, binaryPath);
  return {
    provider,
    installedVersion,
    latestVersion: version,
    updateAvailable: isNewerCliVersion(installedVersion, version),
    executable,
    updateCommand: command ? [command.command, ...command.args].join(" ") : null,
  };
}

export async function updateProvider(rawProvider: unknown) {
  const provider = Provider.parse(rawProvider);
  if (inFlight.has(provider)) throw new Error("This agent is already being updated.");
  inFlight.add(provider);
  try {
    const executable = await findExecutable(provider);
    const command = providerUpdateCommand(provider, await realpath(executable));
    if (!command) throw new Error("Update this installation with the tool that installed it.");
    const updater =
      command.command === provider ? executable : await findExecutable(command.command);
    await execute(updater, command.args, { timeout: 180_000, maxBuffer: 2 * 1024 * 1024 });
    return await checkProviderUpdate(provider);
  } finally {
    inFlight.delete(provider);
  }
}
