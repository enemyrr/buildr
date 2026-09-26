import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

interface UsageGlanceStoreState {
  /** The provider the sidebar footer shows usage for. */
  providerId: string | null;
}

const UsageGlancePersistedStateSchema = z.strictObject({
  providerId: z.string().nullable(),
});

export const useUsageGlanceStore = create<UsageGlanceStoreState>()(
  persist((): UsageGlanceStoreState => ({ providerId: null }), {
    name: "sidebar-usage-glance",
    version: 1,
    storage: createValidatedPersistStorage(AsyncStorage, UsageGlancePersistedStateSchema),
  }),
);

export function setUsageGlanceProvider(providerId: string): void {
  useUsageGlanceStore.setState({ providerId });
}
