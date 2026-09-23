import type { ReactElement } from "react";
import { withUnistyles } from "react-native-unistyles";
import { getProviderIcon } from "@/components/provider-icons";
import type { Theme } from "@/styles/theme";

interface ProviderIconProps {
  provider: string;
  serverId: string;
  size: number;
  color?: string;
}

function ProviderIcon({ provider, serverId, size, color = "" }: ProviderIconProps): ReactElement {
  const Icon = getProviderIcon(provider, serverId);
  return <Icon size={size} color={color} />;
}

const ThemedProviderIcon = withUnistyles(ProviderIcon);

const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function ProviderGlyph({
  provider,
  serverId,
  size,
  tone = "muted",
}: {
  provider: string;
  serverId: string;
  size: number;
  tone?: "muted" | "foreground";
}): ReactElement {
  return (
    <ThemedProviderIcon
      provider={provider}
      serverId={serverId}
      size={size}
      uniProps={tone === "foreground" ? foregroundMapping : mutedMapping}
    />
  );
}
