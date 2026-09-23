import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { getIsElectron } from "@/constants/platform";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";

interface ProviderUpdateStatus {
  installedVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  updateCommand: string | null;
}

function LocalProviderUpdate({ provider }: { provider: string }) {
  const [status, setStatus] = useState<ProviderUpdateStatus | null>(null);
  const [pending, setPending] = useState<"check" | "update" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (action: "check" | "update") => {
      setPending(action);
      setError(null);
      try {
        setStatus(
          await invokeDesktopCommand<ProviderUpdateStatus>(
            action === "check" ? "check_provider_update" : "update_provider",
            { provider },
          ),
        );
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Could not check agent updates.");
      } finally {
        setPending(null);
      }
    },
    [provider],
  );
  const check = useCallback(() => {
    void run("check");
  }, [run]);
  const update = useCallback(() => {
    void run("update");
  }, [run]);
  return (
    <View style={styles.container} testID="provider-update-section">
      <View style={styles.row}>
        <Text style={styles.title}>CLI updates</Text>
        <Button
          variant="outline"
          size="sm"
          onPress={check}
          disabled={pending !== null}
          loading={pending === "check"}
          testID="provider-check-update"
        >
          Check for updates
        </Button>
      </View>
      {status ? (
        <>
          <Text style={styles.detail}>
            Installed {status.installedVersion} · Latest published {status.latestVersion}
          </Text>
          <Text style={styles.detail}>
            {status.updateAvailable ? "An update is available." : "You’re up to date."}
          </Text>
          {status.updateAvailable && status.updateCommand ? (
            <Button
              size="sm"
              variant="secondary"
              onPress={update}
              disabled={pending !== null}
              loading={pending === "update"}
              testID="provider-install-update"
            >
              {pending === "update" ? "Updating…" : "Update"}
            </Button>
          ) : null}
          {status.updateCommand ? (
            <Text style={styles.detail}>
              {status.updateCommand}. Updates apply to new agent sessions.
            </Text>
          ) : (
            <Text style={styles.detail}>Use the tool that installed this CLI to update it.</Text>
          )}
        </>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function ProviderUpdateSection({
  provider,
  serverId,
}: {
  provider: string;
  serverId: string;
}) {
  const localServerId = useLocalDaemonServerId();
  if (!getIsElectron() || localServerId !== serverId || !["claude", "codex"].includes(provider))
    return null;
  return <LocalProviderUpdate key={provider} provider={provider} />;
}

const styles = StyleSheet.create((theme) => ({
  container: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  title: { fontSize: theme.fontSize.base, color: theme.colors.foreground },
  detail: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted },
  error: { fontSize: theme.fontSize.sm, color: theme.colors.destructive },
}));
