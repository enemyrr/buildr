import { create } from "zustand";
import type { WorkspaceSnooze } from "@getpaseo/protocol/messages";
import type { SnoozeTarget } from "./actions";

export interface CustomSnoozeRequest {
  target: SnoozeTarget;
  previous: WorkspaceSnooze | null;
}

interface CustomSnoozeState {
  request: CustomSnoozeRequest | null;
  open: (request: CustomSnoozeRequest) => void;
  close: () => void;
}

// The sheet opens from a menu row, and the menu unmounts as it closes, so the request lives
// outside the menu tree.
export const useCustomSnoozeStore = create<CustomSnoozeState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));
