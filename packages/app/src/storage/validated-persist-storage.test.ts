import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { StateStorage } from "zustand/middleware";
import { createValidatedPersistStorage } from "./validated-persist-storage";

class MemoryStorage implements StateStorage {
  readonly values = new Map<string, string>();

  getItem(name: string): string | null {
    return this.values.get(name) ?? null;
  }

  setItem(name: string, value: string): void {
    this.values.set(name, value);
  }

  removeItem(name: string): void {
    this.values.delete(name);
  }
}

const StateSchema = z.strictObject({ enabled: z.boolean() });

describe("createValidatedPersistStorage", () => {
  it.each([
    ["malformed JSON", "{"],
    ["invalid state", JSON.stringify({ state: { enabled: "yes" }, version: 1 })],
    ["unknown state fields", JSON.stringify({ state: { enabled: true, extra: true }, version: 1 })],
    [
      "unknown envelope fields",
      JSON.stringify({ state: { enabled: true }, version: 1, extra: true }),
    ],
  ])("clears %s", async (_label, stored) => {
    const backing = new MemoryStorage();
    backing.values.set("settings", stored);
    const storage = createValidatedPersistStorage(backing, StateSchema);

    await expect(storage.getItem("settings")).resolves.toBeNull();
    expect(backing.values.has("settings")).toBe(false);
  });

  it("returns schema-validated state", async () => {
    const backing = new MemoryStorage();
    backing.values.set("settings", JSON.stringify({ state: { enabled: true }, version: 1 }));
    const storage = createValidatedPersistStorage(backing, StateSchema);

    await expect(storage.getItem("settings")).resolves.toEqual({
      state: { enabled: true },
      version: 1,
    });
  });

  it("clears a written value the schema rejects on the next read", async () => {
    const backing = new MemoryStorage();
    const storage = createValidatedPersistStorage(
      backing,
      z.strictObject({ count: z.number().finite() }),
    );

    await storage.setItem("settings", { state: { count: Number.NaN } });

    await expect(storage.getItem("settings")).resolves.toBeNull();
    expect(backing.values.has("settings")).toBe(false);
  });

  it("coalesces writes and skips unchanged values", async () => {
    vi.useFakeTimers();
    try {
      const backing = new MemoryStorage();
      const writes: string[] = [];
      backing.setItem = (name, value) => {
        writes.push(value);
        backing.values.set(name, value);
      };
      const storage = createValidatedPersistStorage(backing, StateSchema);
      const state = { enabled: true };

      void storage.setItem("settings", { state: { enabled: false } });
      void storage.setItem("settings", { state, version: 1 });
      expect(writes).toEqual([]);
      await vi.runAllTimersAsync();
      expect(writes).toEqual([JSON.stringify({ state, version: 1 })]);

      void storage.setItem("settings", { state, version: 1 });
      void storage.setItem("settings", { state: { enabled: true }, version: 1 });
      await vi.runAllTimersAsync();
      expect(writes).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes a pending write before reading", async () => {
    const backing = new MemoryStorage();
    const storage = createValidatedPersistStorage(backing, StateSchema);

    void storage.setItem("settings", { state: { enabled: true }, version: 1 });

    await expect(storage.getItem("settings")).resolves.toEqual({
      state: { enabled: true },
      version: 1,
    });
  });
});

it("retries an unchanged state after a failed save", async () => {
  let attempts = 0;
  const backing = new MemoryStorage();
  const storage = createValidatedPersistStorage(
    {
      getItem: (name) => backing.getItem(name),
      setItem: (name, value) => {
        attempts += 1;
        if (attempts === 1) return Promise.reject(new Error("storage unavailable"));
        backing.setItem(name, value);
      },
      removeItem: (name) => backing.removeItem(name),
    },
    StateSchema,
  );
  const value = { state: { enabled: true }, version: 1 };
  await expect(storage.setItem("layout", value)).rejects.toThrow("storage unavailable");
  await storage.setItem("layout", value);
  expect(attempts).toBe(2);
  expect(backing.getItem("layout")).toBe(JSON.stringify(value));
});

it("saves the same state again after removal or rehydration clears invalid storage", async () => {
  const backing = new MemoryStorage();
  const storage = createValidatedPersistStorage(backing, StateSchema);
  const value = { state: { enabled: true }, version: 1 };
  await storage.setItem("layout", value);
  await storage.removeItem("layout");
  await storage.setItem("layout", value);
  expect(backing.getItem("layout")).toBe(JSON.stringify(value));

  backing.values.set("layout", "{");
  await expect(storage.getItem("layout")).resolves.toBeNull();
  await storage.setItem("layout", value);
  expect(backing.getItem("layout")).toBe(JSON.stringify(value));
});
