import { AppState } from "react-native";
import { z } from "zod";
import type { PersistStorage, StateStorage, StorageValue } from "zustand/middleware";
import { isWeb } from "@/constants/platform";

const WRITE_DELAY_MS = 300;

// Every persisting store's pending writes, so lifecycle events and reads can drain them all.
const pendingFlushes = new Set<() => Promise<void>>();
let isLifecycleFlushBound = false;

// Write failures surface through the promise setItem returned; flushing never rejects.
export async function flushPendingWrites(): Promise<void> {
  await Promise.allSettled(Array.from(pendingFlushes, (flush) => flush()));
}

function bindLifecycleFlush(): void {
  if (isLifecycleFlushBound) return;
  isLifecycleFlushBound = true;
  const flush = () => void flushPendingWrites();
  if (!isWeb) {
    AppState.addEventListener("change", (state) => {
      if (state !== "active") flush();
    });
    return;
  }
  if (typeof window === "undefined") return;
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

interface PendingWrite {
  start: () => void;
  done: Promise<void>;
  timer: ReturnType<typeof setTimeout>;
}

function isShallowEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object" || !left || !right) return false;
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) return false;
  return leftEntries.every(([key, value]) => Object.is(value, Reflect.get(right, key)));
}

function isSameStorageValue<State>(left: StorageValue<State>, right: StorageValue<State>) {
  return left.version === right.version && isShallowEqual(left.state, right.state);
}

// zustand persist writes on every set(), including no-ops. Writes are coalesced per key, skipped
// when unchanged, and flushed on page hide or app background. Validation runs on read only.
export function createValidatedPersistStorage<State>(
  backingStorage: StateStorage,
  stateSchema: z.ZodType<State>,
): PersistStorage<State> {
  const envelopeSchema = z.strictObject({
    state: stateSchema,
    version: z.number().int().nonnegative().optional(),
  });
  const latest = new Map<string, StorageValue<State>>();
  const written = new Map<string, string>();
  const pending = new Map<string, PendingWrite>();

  function settle(name: string): void {
    const pendingWrite = pending.get(name);
    if (!pendingWrite) return;
    clearTimeout(pendingWrite.timer);
    pending.delete(name);
    if (pending.size === 0) pendingFlushes.delete(flushAll);
  }

  async function write(name: string): Promise<void> {
    settle(name);
    const value = latest.get(name);
    if (!value) return;
    const serialized = JSON.stringify(value);
    if (written.get(name) === serialized) return;
    await backingStorage.setItem(name, serialized);
    written.set(name, serialized);
  }

  function flushAll(): Promise<void> {
    const writes = Array.from(pending.values());
    for (const { start } of writes) start();
    return Promise.allSettled(writes.map(({ done }) => done)).then(() => undefined);
  }

  function forget(name: string): void {
    settle(name);
    latest.delete(name);
    written.delete(name);
  }

  return {
    getItem: async (name) => {
      await flushPendingWrites();
      const raw = await backingStorage.getItem(name);
      if (raw === null) return null;

      let decoded: unknown;
      try {
        decoded = JSON.parse(raw);
      } catch {
        forget(name);
        await backingStorage.removeItem(name);
        return null;
      }

      const result = envelopeSchema.safeParse(decoded);
      if (!result.success) {
        forget(name);
        await backingStorage.removeItem(name);
        return null;
      }
      written.set(name, raw);
      return result.data;
    },
    setItem: (name, value) => {
      const previous = latest.get(name);
      if (previous && isSameStorageValue(previous, value)) return pending.get(name)?.done;
      latest.set(name, value);
      const existing = pending.get(name);
      if (existing) return existing.done;
      let start = () => {};
      const done = new Promise<void>((resolve) => {
        start = resolve;
      }).then(() => write(name));
      pending.set(name, { start, done, timer: setTimeout(start, WRITE_DELAY_MS) });
      pendingFlushes.add(flushAll);
      bindLifecycleFlush();
      return done;
    },
    removeItem: (name) => {
      forget(name);
      return backingStorage.removeItem(name);
    },
  };
}
