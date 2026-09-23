import { useCallback, useMemo, type ReactElement, type RefObject } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CornerDownLeft, GitBranch, GitPullRequest } from "lucide-react-native";
import { Combobox, ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/segmented-control";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import {
  filterPickerOptionsByTab,
  pickerItemLabel,
  type CreateFromTab,
  type PickerItem,
} from "../new-workspace-picker-item";

const ThemedGitBranch = withUnistyles(GitBranch);
const ThemedGitPullRequest = withUnistyles(GitPullRequest);
const ThemedCornerDownLeft = withUnistyles(CornerDownLeft);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const branchIcon = <ThemedGitBranch size={ICON_SIZE.sm} uniProps={mutedColorMapping} />;
const prIcon = <ThemedGitPullRequest size={ICON_SIZE.sm} uniProps={mutedColorMapping} />;

function CreateFromOptionRow({
  item,
  selected,
  active,
  disabled,
  onPress,
}: {
  item: PickerItem;
  selected: boolean;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const isBranch = item.kind === "branch";
  const divergence = isBranch ? item.divergenceLabel : undefined;
  const leadingSlot = useMemo(
    () => <View style={styles.rowIconBox}>{isBranch ? branchIcon : prIcon}</View>,
    [isBranch],
  );
  // The highlighted row names the key that picks it, so keyboard and pointer read the same.
  const trailingSlot = useMemo(() => {
    if (active) {
      return (
        <View style={styles.selectHint}>
          <Text style={styles.selectHintText}>{t("newWorkspace.createFrom.select")}</Text>
          <ThemedCornerDownLeft size={ICON_SIZE.sm} uniProps={mutedColorMapping} />
        </View>
      );
    }
    return divergence ? <Text style={styles.divergenceLabel}>{divergence}</Text> : undefined;
  }, [active, divergence, t]);
  const description =
    !isBranch && item.item.baseRefName
      ? t("newWorkspace.refPicker.intoBase", { baseRef: item.item.baseRefName })
      : undefined;

  return (
    <ComboboxItem
      testID={
        isBranch
          ? `new-workspace-ref-picker-branch-${item.name}`
          : `new-workspace-ref-picker-pr-${item.item.number}`
      }
      label={pickerItemLabel(item)}
      description={description}
      selected={selected}
      active={active}
      disabled={disabled}
      onPress={onPress}
      leadingSlot={leadingSlot}
      trailingSlot={trailingSlot}
      accessibilityLabel={isBranch ? item.accessibilityLabel : undefined}
    />
  );
}

export interface CreateFromPickerProps {
  anchorRef: RefObject<View | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: CreateFromTab;
  onTabChange: (tab: CreateFromTab) => void;
  /** False when the host can't search the forge; the picker is then a plain branch list. */
  showPullRequests: boolean;
  options: ComboboxOption[];
  itemById: Map<string, PickerItem>;
  selectedOptionId: string;
  onSelect: (id: string) => void;
  onSearchQueryChange: (query: string) => void;
  isSearching: boolean;
  disabled: boolean;
}

/**
 * "Create from…": the new-workspace ref picker split into PR and branch tabs. Data and
 * selection belong to the screen; this only decides which slice of the options is visible.
 */
export function CreateFromPicker({
  anchorRef,
  open,
  onOpenChange,
  tab,
  onTabChange,
  showPullRequests,
  options,
  itemById,
  selectedOptionId,
  onSelect,
  onSearchQueryChange,
  isSearching,
  disabled,
}: CreateFromPickerProps): ReactElement {
  const { t } = useTranslation();
  const effectiveTab: CreateFromTab = showPullRequests ? tab : "branches";
  const visibleOptions = useMemo(
    () => filterPickerOptionsByTab({ options, itemById, tab: effectiveTab }),
    [effectiveTab, itemById, options],
  );
  const tabOptions = useMemo<SegmentedControlOption<CreateFromTab>[]>(
    () => [
      {
        value: "prs",
        label: t("newWorkspace.createFrom.pullRequests"),
        testID: "new-workspace-create-from-tab-prs",
      },
      {
        value: "branches",
        label: t("newWorkspace.createFrom.branches"),
        testID: "new-workspace-create-from-tab-branches",
      },
    ],
    [t],
  );
  const tabs = useMemo(
    () =>
      showPullRequests ? (
        <View style={styles.tabs}>
          <SegmentedControl
            size="xs"
            options={tabOptions}
            value={effectiveTab}
            onValueChange={onTabChange}
            testID="new-workspace-create-from-tabs"
          />
        </View>
      ) : null,
    [effectiveTab, onTabChange, showPullRequests, tabOptions],
  );

  const renderOption = useCallback(
    ({
      option,
      selected,
      active,
      onPress,
    }: {
      option: ComboboxOption;
      selected: boolean;
      active: boolean;
      onPress: () => void;
    }) => {
      const item = itemById.get(option.id);
      if (!item) return <View />;
      return (
        <CreateFromOptionRow
          item={item}
          selected={selected}
          active={active}
          disabled={disabled}
          onPress={onPress}
        />
      );
    },
    [disabled, itemById],
  );

  let emptyText = t("newWorkspace.createFrom.noBranches");
  if (isSearching) emptyText = t("newWorkspace.refPicker.searching");
  else if (effectiveTab === "prs") emptyText = t("newWorkspace.createFrom.noPullRequests");

  return (
    <Combobox
      options={visibleOptions}
      value={selectedOptionId}
      onSelect={onSelect}
      searchable
      searchPlaceholder={t("newWorkspace.createFrom.searchPlaceholder")}
      title={t("newWorkspace.createFrom.title")}
      open={open}
      onOpenChange={onOpenChange}
      onSearchQueryChange={onSearchQueryChange}
      desktopPlacement="bottom-start"
      desktopMinWidth={420}
      desktopLockWidth
      anchorRef={anchorRef}
      emptyText={emptyText}
      renderOption={renderOption}
      stickyHeader={tabs}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  tabs: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  rowIconBox: {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    alignItems: "center",
    justifyContent: "center",
  },
  selectHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  selectHintText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  divergenceLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    fontVariant: ["tabular-nums"],
  },
}));
