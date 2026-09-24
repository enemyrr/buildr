import { useCallback, useMemo, type ReactNode } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Image as ImageIcon } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { AgentAttachment } from "@getpaseo/protocol/messages";
import { getAgentAttachmentPillContent } from "@/attachments/attachment-pill-content";
import {
  formatAttachmentReference,
  formatImageReference,
  splitMessageReferences,
} from "@/composer/inline-attachments/references";
import { formatInlineLabel } from "@/composer/inline-attachments/tokens";
import { isWeb } from "@/constants/platform";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import type { UserMessageImageAttachment } from "@/types/stream";
import { openExternalUrl } from "@/utils/open-external-url";
import { splitTextLinks } from "@/utils/text-links";

interface MessageReference {
  text: string;
  label: string;
  icon: ReactNode;
  image: UserMessageImageAttachment | null;
}

interface UserMessageTextProps {
  text: string;
  images: readonly UserMessageImageAttachment[];
  attachments: readonly AgentAttachment[];
  linkStyle: StyleProp<TextStyle>;
  onOpenImage: (image: UserMessageImageAttachment) => void;
}

/**
 * The runs inside a sent message's text: links, and the references the
 * composer wrote for its inline attachments (`[Image #1]`, `[#370 title]`)
 * drawn as chips like the composer's.
 */
export function UserMessageText({
  text,
  images,
  attachments,
  linkStyle,
  onOpenImage,
}: UserMessageTextProps) {
  const { t } = useTranslation();
  const references = useMemo(
    () => buildMessageReferences({ images, attachments, t }),
    [attachments, images, t],
  );
  const segments = useMemo(
    () =>
      splitMessageReferences(
        text,
        references.map((reference) => reference.text),
      ),
    [references, text],
  );
  return segments.map((segment) => {
    const reference = segment.kind === "reference" ? references[segment.index] : undefined;
    if (!reference) {
      return <LinkedText key={segment.start} text={segment.text} linkStyle={linkStyle} />;
    }
    return <ReferenceChip key={segment.start} reference={reference} onOpenImage={onOpenImage} />;
  });
}

function buildMessageReferences(input: {
  images: readonly UserMessageImageAttachment[];
  attachments: readonly AgentAttachment[];
  t: TFunction;
}): MessageReference[] {
  const imageReferences = input.images.map((image, index) => {
    const text = formatImageReference(index + 1);
    return { text, label: text.slice(1, -1), icon: imageIcon, image };
  });
  const attachmentReferences = input.attachments.map((attachment) => {
    const { icon, label } = getAgentAttachmentPillContent(attachment, input.t);
    return { text: formatAttachmentReference(label), label, icon, image: null };
  });
  return [...imageReferences, ...attachmentReferences];
}

function ReferenceChip({
  reference,
  onOpenImage,
}: {
  reference: MessageReference;
  onOpenImage: (image: UserMessageImageAttachment) => void;
}) {
  const { image } = reference;
  const handlePress = useCallback(() => {
    if (image) onOpenImage(image);
  }, [image, onOpenImage]);
  return (
    <Text style={styles.chip} onPress={image ? handlePress : undefined}>
      {/* Native nested text can't center an inline view, so chips there are text only. */}
      {isWeb ? reference.icon : null}
      {formatInlineLabel(reference.label)}
    </Text>
  );
}

function TextLink({ url, style }: { url: string; style: StyleProp<TextStyle> }) {
  const handlePress = useCallback(() => void openExternalUrl(url), [url]);
  return (
    <Text accessibilityRole="link" style={style} onPress={handlePress}>
      {url}
    </Text>
  );
}

function LinkedText({ text, linkStyle }: { text: string; linkStyle: StyleProp<TextStyle> }) {
  const segments = useMemo(() => splitTextLinks(text), [text]);
  return segments.map((segment) =>
    segment.kind === "link" ? (
      <TextLink key={segment.start} url={segment.text} style={linkStyle} />
    ) : (
      segment.text
    ),
  );
}

const ThemedImageIcon = withUnistyles(ImageIcon);
const iconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const imageIcon = <ThemedImageIcon size={ICON_SIZE.xs} uniProps={iconMapping} />;

const styles = StyleSheet.create((theme) => ({
  chip: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.content - 2,
    backgroundColor: theme.colors.surface3,
    ...(isWeb
      ? {
          // RN doesn't type "inline-flex" but RN-web honors it at runtime, which
          // centers the icon and keeps the label on the text's baseline.
          display: "inline-flex" as TextStyle["display"],
          alignItems: "center" as const,
          gap: theme.spacing[1],
          paddingHorizontal: theme.spacing[1],
          borderRadius: theme.borderRadius.base,
        }
      : {}),
  },
}));
