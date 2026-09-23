import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { app } from "electron";

// A fork build bakes `paseoVariant` into the packaged package.json through
// electron-builder `extraMetadata`, so it runs beside the official app with its
// own name, state, and daemon port, and never installs official updates.
export interface DesktopVariant {
  name: string;
  home: string;
  // Preferred daemon address. The first free port from here upward is used.
  listen: string;
}

const PORT_SEARCH_SPAN = 100;
// The official app's daemon port. The variant never takes it, even when free.
const OFFICIAL_DAEMON_PORT = 6767;

function parseDesktopVariant(value: unknown): DesktopVariant | null {
  if (typeof value !== "object" || value === null) return null;
  const { name, home, listen } = value as Record<string, unknown>;
  if (typeof name !== "string" || typeof home !== "string" || typeof listen !== "string") {
    return null;
  }
  return { name, home: home.replace(/^~(?=$|\/)/, homedir()), listen };
}

let cachedVariant: DesktopVariant | null | undefined;

export function getDesktopVariant(): DesktopVariant | null {
  if (cachedVariant === undefined) {
    try {
      const manifest = JSON.parse(
        readFileSync(path.join(app.getAppPath(), "package.json"), "utf8"),
      );
      cachedVariant = parseDesktopVariant(manifest.paseoVariant);
    } catch {
      cachedVariant = null;
    }
  }
  return cachedVariant;
}

// The variant always overrides PASEO_HOME. A launch from a terminal inside the
// official Paseo inherits its value, which would attach this app to the
// official daemon.
export function applyDesktopVariantHome(variant: DesktopVariant): void {
  process.env.PASEO_HOME = variant.home;
}

// Picks the daemon address before the daemon starts. A desktop-managed daemon
// reads its address only from config.json, so the choice is persisted there. A
// running daemon keeps its address, and a configured free port is kept.
export async function applyDesktopVariantListen(variant: DesktopVariant): Promise<string | null> {
  delete process.env.PASEO_LISTEN;
  const runningListen = readRunningDaemonListen(variant.home);
  if (runningListen) return runningListen;

  const configPath = path.join(variant.home, "config.json");
  const config = readJson(configPath) ?? { version: 1 };
  const daemon = isRecord(config.daemon) ? config.daemon : {};
  const configured = typeof daemon.listen === "string" ? daemon.listen : null;
  // The daemon writes the official default on first run, so that value is replaced.
  const configuredHostPort = parseHostPort(configured ?? "");
  const preferred =
    configuredHostPort && configuredHostPort.port !== OFFICIAL_DAEMON_PORT
      ? configuredHostPort
      : parseHostPort(variant.listen);
  if (!preferred) return configured;

  const port = await findFreePort(preferred.host, preferred.port);
  const listen = `${preferred.host}:${port}`;
  if (listen !== configured) {
    writeJsonAtomic(configPath, { ...config, daemon: { ...daemon, listen } });
  }
  return listen;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tempPath, filePath);
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function readRunningDaemonListen(home: string): string | null {
  const lock = readJson(path.join(home, "paseo.pid"));
  if (typeof lock?.pid !== "number" || typeof lock.listen !== "string") return null;
  try {
    process.kill(lock.pid, 0);
    return lock.listen;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM" ? lock.listen : null;
  }
}

function parseHostPort(listen: string): { host: string; port: number } | null {
  const match = /^([^/:]+):(\d{1,5})$/.exec(listen);
  if (!match) return null;
  return { host: match[1], port: Number(match[2]) };
}

function isPortFree(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

async function findFreePort(host: string, preferredPort: number): Promise<number> {
  const lastPort = Math.min(preferredPort + PORT_SEARCH_SPAN, 65_535);
  for (let port = preferredPort; port <= lastPort; port += 1) {
    if (port !== OFFICIAL_DAEMON_PORT && (await isPortFree(host, port))) return port;
  }
  // Every port in the span is taken, so let the OS pick one.
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : preferredPort;
      server.close(() => resolve(port));
    });
  });
}
