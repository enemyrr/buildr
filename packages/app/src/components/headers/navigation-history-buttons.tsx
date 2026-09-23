import { useCallback, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ArrowLeft, ArrowRight } from "lucide-react-native";
import { HeaderToggleButton, headerIconSlotStyle } from "./header-toggle-button";
import { iconButtonChromeGlyphSize } from "@/components/ui/icon-button-chrome";
import { extraMutedIconColorMapping } from "@/components/ui/icon-color";
import { stepNavigation, useCanStepNavigation } from "@/navigation/navigation-history-store";

const ThemedArrowLeft = withUnistyles(ArrowLeft);
const ThemedArrowRight = withUnistyles(ArrowRight);
const NO_SHORTCUT: [] = [];

function NavigationHistoryButton({ delta }: { delta: 1 | -1 }): ReactElement {
  const { t } = useTranslation();
  const canStep = useCanStepNavigation(delta);
  const handlePress = useCallback(() => stepNavigation(delta), [delta]);
  const label = delta === -1 ? t("shell.menu.back") : t("shell.menu.forward");
  const Icon = delta === -1 ? ThemedArrowLeft : ThemedArrowRight;

  return (
    <HeaderToggleButton
      onPress={handlePress}
      disabled={!canStep}
      tooltipLabel={label}
      tooltipKeys={NO_SHORTCUT}
      tooltipSide="bottom"
      testID={delta === -1 ? "navigation-back-button" : "navigation-forward-button"}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon
        size={iconButtonChromeGlyphSize("large")}
        strokeWidth={1.5}
        uniProps={extraMutedIconColorMapping}
      />
    </HeaderToggleButton>
  );
}

export function NavigationHistoryButtons(): ReactElement {
  return (
    <View style={styles.row}>
      <NavigationHistoryButton delta={-1} />
      <NavigationHistoryButton delta={1} />
    </View>
  );
}

/** Reserves the buttons' width where the window-level overlay draws them. */
export function NavigationHistoryButtonsPlaceholder(): ReactElement {
  return (
    <View pointerEvents="none" style={styles.row}>
      <View style={headerIconSlotStyle.slot} />
      <View style={headerIconSlotStyle.slot} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
});
