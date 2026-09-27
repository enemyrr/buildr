import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { setWorkspaceSnoozeWithUndo } from "./actions";
import { useCustomSnoozeStore, type CustomSnoozeRequest } from "./custom-snooze-store";
import { formatCustomSnoozeFields, parseCustomSnooze, resolveSnoozePresets } from "./model";

/** Mounts the custom snooze sheet whenever a menu asks for one. */
export function CustomSnoozeSheetHost() {
  const request = useCustomSnoozeStore((state) => state.request);
  const close = useCustomSnoozeStore((state) => state.close);
  if (!request) {
    return null;
  }
  // Keyed per workspace so each open starts from a fresh draft.
  return <CustomSnoozeSheet key={request.target.workspaceKey} request={request} onClose={close} />;
}

type SubmitState = { kind: "idle" } | { kind: "pending" } | { kind: "failed"; message: string };

function defaultWake(): Date {
  const tomorrow = resolveSnoozePresets(new Date()).find((preset) => preset.id === "tomorrow");
  return tomorrow ? tomorrow.until : new Date();
}

function CustomSnoozeSheet({
  request,
  onClose,
}: {
  request: CustomSnoozeRequest;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [initialFields] = useState(() => formatCustomSnoozeFields(defaultWake()));
  const [date, setDate] = useState(initialFields.date);
  const [time, setTime] = useState(initialFields.time);
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  const parsed = parseCustomSnooze({ date, time, now: new Date() });
  const isPending = submit.kind === "pending";

  let error: string | null = null;
  if (submit.kind === "failed") {
    error = submit.message;
  } else if (parsed.kind === "invalid") {
    error =
      parsed.reason === "past" ? t("sidebar.snooze.inPast") : t("sidebar.snooze.invalidFormat");
  }

  const handleSubmit = useCallback(() => {
    if (parsed.kind !== "valid" || isPending) {
      return;
    }
    setSubmit({ kind: "pending" });
    setWorkspaceSnoozeWithUndo({
      target: request.target,
      until: parsed.until,
      previous: request.previous,
    })
      .then(onClose)
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : t("sidebar.snooze.failed");
        setSubmit({ kind: "failed", message });
      });
  }, [isPending, onClose, parsed, request, t]);

  const handleDateChange = useCallback((value: string) => {
    setDate(value);
    setSubmit({ kind: "idle" });
  }, []);
  const handleTimeChange = useCallback((value: string) => {
    setTime(value);
    setSubmit({ kind: "idle" });
  }, []);
  const header = useMemo<SheetHeader>(() => ({ title: t("sidebar.snooze.customTitle") }), [t]);

  return (
    <AdaptiveModalSheet visible header={header} onClose={onClose} testID="custom-snooze-sheet">
      <View style={styles.body}>
        <View style={styles.fields}>
          <View style={styles.field}>
            <Field label={t("sidebar.snooze.date")}>
              <FormTextInput
                initialValue={initialFields.date}
                onChangeText={handleDateChange}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isPending}
                onSubmitEditing={handleSubmit}
                testID="custom-snooze-date"
              />
            </Field>
          </View>
          <View style={styles.field}>
            <Field label={t("sidebar.snooze.time")}>
              <FormTextInput
                initialValue={initialFields.time}
                onChangeText={handleTimeChange}
                placeholder="HH:MM"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isPending}
                onSubmitEditing={handleSubmit}
                testID="custom-snooze-time"
              />
            </Field>
          </View>
        </View>
        {error ? (
          <Text style={styles.errorText} testID="custom-snooze-error">
            {error}
          </Text>
        ) : null}
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
            disabled={isPending || parsed.kind !== "valid"}
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
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
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
