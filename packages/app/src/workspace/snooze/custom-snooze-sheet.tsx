import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { setWorkspaceSnoozeWithUndo } from "./actions";
import { useCustomSnoozeStore, type CustomSnoozeRequest } from "./custom-snooze-store";
import {
  defaultCustomSnoozeSelection,
  resolveCustomSnooze,
  type CustomSnoozeSelection,
  type SnoozeDayOption,
  type SnoozeTimeOption,
} from "./model";

/** Mounts the custom snooze sheet whenever a menu asks for one. */
export function CustomSnoozeSheetHost() {
  const request = useCustomSnoozeStore((state) => state.request);
  const close = useCustomSnoozeStore((state) => state.close);
  if (!request) {
    return null;
  }
  // Keyed per workspace so each open starts from a fresh selection.
  return <CustomSnoozeSheet key={request.target.workspaceKey} request={request} onClose={close} />;
}

type SubmitState = { kind: "idle" } | { kind: "pending" } | { kind: "failed"; message: string };

function dayLabel(day: SnoozeDayOption, t: TFunction): string {
  if (day.offset === 0) {
    return t("sidebar.snooze.today");
  }
  if (day.offset === 1) {
    return t("sidebar.snooze.tomorrow");
  }
  return day.date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function timeLabel(time: SnoozeTimeOption): string {
  const date = new Date(2000, 0, 1, time.hours, time.minutes);
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function CustomSnoozeSheet({
  request,
  onClose,
}: {
  request: CustomSnoozeRequest;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<CustomSnoozeSelection>(() =>
    defaultCustomSnoozeSelection(new Date()),
  );
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  const resolved = resolveCustomSnooze(selection, new Date());
  const isPending = submit.kind === "pending";

  const dayOptions = useMemo<SelectFieldOption<string>[]>(
    () =>
      resolved.days.map((day) => ({
        id: day.key,
        value: day.key,
        label: dayLabel(day, t),
        testID: `custom-snooze-day-${day.key}`,
      })),
    [resolved.days, t],
  );
  const timeOptions = useMemo<SelectFieldOption<string>[]>(
    () =>
      resolved.times.map((time) => ({
        id: time.key,
        value: time.key,
        label: timeLabel(time),
        testID: `custom-snooze-time-${time.key}`,
      })),
    [resolved.times],
  );
  const selectedDay = dayOptions.find((option) => option.value === resolved.dayKey) ?? null;
  const selectedTime = timeOptions.find((option) => option.value === resolved.timeKey) ?? null;

  const handleDayChange = useCallback((dayKey: string) => {
    setSelection((current) => ({ ...current, dayKey }));
    setSubmit({ kind: "idle" });
  }, []);
  const handleTimeChange = useCallback((timeKey: string) => {
    setSelection((current) => ({ ...current, timeKey }));
    setSubmit({ kind: "idle" });
  }, []);

  const handleSubmit = useCallback(() => {
    if (isPending) {
      return;
    }
    setSubmit({ kind: "pending" });
    // Resolved again at submit, so a slot that passed while the sheet was open moves forward.
    const { until } = resolveCustomSnooze(selection, new Date());
    setWorkspaceSnoozeWithUndo({ target: request.target, until, previous: request.previous })
      .then(onClose)
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : t("sidebar.snooze.failed");
        setSubmit({ kind: "failed", message });
      });
  }, [isPending, onClose, request, selection, t]);

  const header = useMemo<SheetHeader>(() => ({ title: t("sidebar.snooze.customTitle") }), [t]);
  const error = submit.kind === "failed" ? submit.message : null;

  return (
    <AdaptiveModalSheet visible header={header} onClose={onClose} testID="custom-snooze-sheet">
      <View style={styles.body}>
        <View style={styles.fields}>
          <View style={styles.field}>
            <SelectField
              label={t("sidebar.snooze.date")}
              value={resolved.dayKey}
              selectedDisplay={selectedDay}
              options={dayOptions}
              onChange={handleDayChange}
              placeholder={t("sidebar.snooze.date")}
              emptyText={t("sidebar.snooze.date")}
              title={t("sidebar.snooze.date")}
              disabled={isPending}
              triggerTestID="custom-snooze-date"
            />
          </View>
          <View style={styles.field}>
            <SelectField
              label={t("sidebar.snooze.time")}
              value={resolved.timeKey}
              selectedDisplay={selectedTime}
              options={timeOptions}
              onChange={handleTimeChange}
              placeholder={t("sidebar.snooze.time")}
              emptyText={t("sidebar.snooze.time")}
              title={t("sidebar.snooze.time")}
              error={error}
              disabled={isPending}
              triggerTestID="custom-snooze-time"
            />
          </View>
        </View>
        <View style={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            style={styles.actionButton}
            onPress={onClose}
            disabled={isPending}
            testID="custom-snooze-cancel"
          >
            {t("common.actions.cancel")}
          </Button>
          <Button
            variant="default"
            size="sm"
            style={styles.actionButton}
            onPress={handleSubmit}
            disabled={isPending}
            testID="custom-snooze-submit"
          >
            {t("sidebar.snooze.submit")}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  fields: {
    flexDirection: "row",
    gap: theme.spacing[3],
  },
  field: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  actionButton: {
    flex: 1,
  },
}));
