import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Text, View, type ViewStyle, type TextStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CircleDot, FileText, GitPullRequest, Image as ImageIcon, X } from "lucide-react-native";
import { openExternalUrl } from "@/utils/open-external-url";
import { splitTextLinks } from "@/utils/text-links";
import {
  pairInlineTokens,
  parseInlineTokens,
  readInlineLabel,
} from "@/composer/inline-attachments/tokens";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import type { ComposerTextOverlayProps, InlineChip, InlineChipKind } from "./text-overlay.types";

// A textarea can't style part of its text or hold elements, so the overlay
// paints the draft underneath a transparent-text textarea: links in color and
// attachment tokens as chips. Cmd+click or Ctrl+click on a link opens it; a
// click on a chip opens its attachment; any other click keeps editing.

const LINK_ATTRIBUTE = "data-composer-link";
const CHIP_ATTRIBUTE = "data-composer-chip";
const CHIP_REMOVE_ATTRIBUTE = "data-composer-chip-remove";
const COPIED_TEXT_PROPERTIES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "wordSpacing",
  "textAlign",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
] as const;

interface OverlayGeometry {
  box: ViewStyle;
  text: TextStyle;
}

type OverlaySegment =
  | { kind: "text"; text: string; start: number }
  | { kind: "link"; text: string; start: number }
  | { kind: "keyword"; text: string; start: number }
  | { kind: "chip"; text: string; label: string; start: number; chipIndex: number | null };

function measureGeometry(textArea: HTMLTextAreaElement): OverlayGeometry {
  const computed = window.getComputedStyle(textArea);
  const text: Record<string, string> = {};
  for (const property of COPIED_TEXT_PROPERTIES) text[property] = computed[property];
  return {
    box: {
      top: textArea.offsetTop + textArea.clientTop,
      left: textArea.offsetLeft + textArea.clientLeft,
      width: textArea.clientWidth,
      height: textArea.clientHeight,
    },
    text: text as TextStyle,
  };
}

// Claude Code reasons harder on a turn whose prompt contains this keyword.
const ULTRATHINK_PATTERN = /\bultrathink\b/i;

function pushKeywordSegments(segments: OverlaySegment[], text: string, start: number): void {
  let cursor = 0;
  for (const match of text.matchAll(new RegExp(ULTRATHINK_PATTERN, "gi"))) {
    if (match.index > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, match.index), start: start + cursor });
    }
    segments.push({ kind: "keyword", text: match[0], start: start + match.index });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor), start: start + cursor });
  }
}

function splitSegments(
  text: string,
  chips: readonly InlineChip[],
  highlightUltrathink: boolean,
): OverlaySegment[] {
  const tokens = parseInlineTokens(text);
  const indexed = chips.map((chip, index) => ({ label: chip.label, index }));
  const paired = pairInlineTokens(tokens, indexed, (chip) => chip.label);
  const segments: OverlaySegment[] = [];
  const pushText = (from: number, to: number) => {
    if (to <= from) return;
    for (const segment of splitTextLinks(text.slice(from, to))) {
      const start = from + segment.start;
      if (segment.kind === "text" && highlightUltrathink) {
        pushKeywordSegments(segments, segment.text, start);
      } else {
        segments.push({ kind: segment.kind, text: segment.text, start });
      }
    }
  };
  let cursor = 0;
  tokens.forEach((token, index) => {
    pushText(cursor, token.start);
    segments.push({
      kind: "chip",
      text: text.slice(token.start, token.end),
      label: readInlineLabel(token.label),
      start: token.start,
      chipIndex: paired[index]?.index ?? null,
    });
    cursor = token.end;
  });
  pushText(cursor, text.length);
  return segments;
}

function hasDecorations(text: string, highlightUltrathink: boolean): boolean {
  return (
    (highlightUltrathink && ULTRATHINK_PATTERN.test(text)) ||
    splitTextLinks(text).some((segment) => segment.kind === "link") ||
    parseInlineTokens(text).length > 0
  );
}

function findAttributeAtPoint(
  overlay: HTMLElement | null,
  attribute: string,
  x: number,
  y: number,
): string | null {
  if (!overlay) return null;
  for (const element of overlay.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
    for (const rect of element.getClientRects()) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return element.getAttribute(attribute);
      }
    }
  }
  return null;
}

function hideTextAreaText(textArea: HTMLTextAreaElement): () => void {
  const { style } = textArea;
  const previous = {
    color: style.color,
    caretColor: style.caretColor,
    position: style.position,
    zIndex: style.zIndex,
  };
  const caretColor = window.getComputedStyle(textArea).color;
  style.setProperty("color", "transparent", "important");
  style.caretColor = caretColor;
  style.position = "relative";
  style.zIndex = "1";
  return () => {
    style.removeProperty("color");
    Object.assign(style, previous);
  };
}

export function ComposerTextOverlay({
  getTextArea,
  value,
  chips,
  highlightUltrathink = false,
}: ComposerTextOverlayProps) {
  const [text, setText] = useState(value);
  const [geometry, setGeometry] = useState<OverlayGeometry | null>(null);
  const [hoveredChip, setHoveredChip] = useState<number | null>(null);
  const overlayRef = useRef<View | null>(null);
  const contentRef = useRef<Text | null>(null);
  const chipsRef = useRef(chips);
  chipsRef.current = chips;
  const active = hasDecorations(text, highlightUltrathink);

  const syncText = useCallback(() => {
    const textArea = getTextArea();
    if (textArea) setText(textArea.value);
  }, [getTextArea]);

  useEffect(syncText, [syncText, value]);

  useEffect(() => {
    const textArea = getTextArea();
    if (!textArea) return;
    textArea.addEventListener("input", syncText);
    return () => textArea.removeEventListener("input", syncText);
  }, [getTextArea, syncText]);

  useEffect(() => {
    const textArea = getTextArea();
    if (!active || !textArea) return;
    const restoreTextArea = hideTextAreaText(textArea);
    const updateGeometry = () => setGeometry(measureGeometry(textArea));
    updateGeometry();
    const resizeObserver = new ResizeObserver(updateGeometry);
    resizeObserver.observe(textArea);

    // Programmatic edits and scrolling don't always emit events, so poll the
    // two cheap values while the draft has a link or chip.
    let frame = 0;
    let scrollTop = -1;
    const tick = () => {
      if (textArea.scrollTop !== scrollTop) {
        scrollTop = textArea.scrollTop;
        const content = contentRef.current as unknown as HTMLElement | null;
        if (content) content.style.transform = `translateY(${-scrollTop}px)`;
      }
      setText((current) => (current === textArea.value ? current : textArea.value));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // The overlay ignores the pointer so the textarea keeps the caret, so
    // clicks and hovers are matched against the painted rects instead.
    const overlay = () => overlayRef.current as unknown as HTMLElement | null;
    const attributeAt = (event: MouseEvent, attribute: string) =>
      findAttributeAtPoint(overlay(), attribute, event.clientX, event.clientY);
    const linkAtEvent = (event: MouseEvent) =>
      event.metaKey || event.ctrlKey ? attributeAt(event, LINK_ATTRIBUTE) : null;
    const chipIndexAt = (event: MouseEvent, attribute: string) => {
      const index = attributeAt(event, attribute);
      return index === null ? null : Number(index);
    };
    const handleMouseMove = (event: MouseEvent) => {
      const chipIndex = chipIndexAt(event, CHIP_ATTRIBUTE);
      setHoveredChip(chipIndex);
      const chip = chipIndex === null ? null : chipsRef.current?.[chipIndex];
      const onRemove = chipIndexAt(event, CHIP_REMOVE_ATTRIBUTE) !== null;
      textArea.style.cursor = linkAtEvent(event) || onRemove || chip?.onOpen ? "pointer" : "";
    };
    const handleMouseLeave = () => setHoveredChip(null);
    const handleMouseDown = (event: MouseEvent) => {
      const url = linkAtEvent(event);
      if (url) {
        event.preventDefault();
        void openExternalUrl(url);
        return;
      }
      const removeIndex = chipIndexAt(event, CHIP_REMOVE_ATTRIBUTE);
      const removeChip = removeIndex === null ? null : chipsRef.current?.[removeIndex];
      if (removeChip?.onRemove) {
        event.preventDefault();
        setHoveredChip(null);
        removeChip.onRemove();
        return;
      }
      const chipIndex = chipIndexAt(event, CHIP_ATTRIBUTE);
      const chip = chipIndex === null ? null : chipsRef.current?.[chipIndex];
      if (!chip?.onOpen) return;
      event.preventDefault();
      chip.onOpen();
    };
    textArea.addEventListener("mousemove", handleMouseMove);
    textArea.addEventListener("mouseleave", handleMouseLeave);
    textArea.addEventListener("mousedown", handleMouseDown);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      textArea.removeEventListener("mousemove", handleMouseMove);
      textArea.removeEventListener("mouseleave", handleMouseLeave);
      textArea.removeEventListener("mousedown", handleMouseDown);
      textArea.style.cursor = "";
      restoreTextArea();
      setGeometry(null);
      setHoveredChip(null);
    };
  }, [active, getTextArea]);

  const segments = useMemo(
    () => (active ? splitSegments(text, chips ?? [], highlightUltrathink) : []),
    [active, chips, highlightUltrathink, text],
  );
  const boxStyle = useMemo(() => [styles.box, geometry?.box], [geometry]);
  const textStyle = useMemo(() => [styles.text, geometry?.text], [geometry]);
  const fontFamily = geometry?.text.fontFamily;

  if (!active || !geometry) return null;
  return (
    <View ref={overlayRef} style={boxStyle} pointerEvents="none" aria-hidden>
      <Text ref={contentRef} style={textStyle}>
        {segments.map((segment) => {
          if (segment.kind === "link") {
            return <OverlayLink key={segment.start} url={segment.text} />;
          }
          if (segment.kind === "text") return segment.text;
          if (segment.kind === "keyword") {
            return <OverlayKeyword key={segment.start} text={segment.text} />;
          }
          const chip = segment.chipIndex === null ? null : (chips?.[segment.chipIndex] ?? null);
          return (
            <OverlayChip
              key={segment.start}
              text={segment.text}
              label={segment.label}
              chipIndex={segment.chipIndex}
              kind={chip?.kind ?? "file"}
              testID={chip?.testID}
              fontFamily={fontFamily}
              removable={Boolean(chip?.onRemove)}
              hovered={segment.chipIndex !== null && segment.chipIndex === hoveredChip}
            />
          );
        })}
        {/* A trailing newline needs a character after it to take up a line. */}
        {text.endsWith("\n") ? "\u200b" : null}
      </Text>
    </View>
  );
}

function OverlayLink({ url }: { url: string }) {
  const dataSet = useMemo(() => ({ composerLink: url }), [url]);
  return (
    <Text style={styles.link} dataSet={dataSet}>
      {url}
    </Text>
  );
}

// One color per letter, cycling, like Claude Code's rainbow `ultrathink`.
function OverlayKeyword({ text }: { text: string }) {
  return (
    <Text>
      {Array.from(text, (letter, index) => (
        <Text key={index} style={KEYWORD_LETTER_STYLES[index % KEYWORD_LETTER_STYLES.length]}>
          {letter}
        </Text>
      ))}
    </Text>
  );
}

interface OverlayChipProps {
  text: string;
  label: string;
  chipIndex: number | null;
  kind: InlineChipKind;
  testID: string | undefined;
  fontFamily: TextStyle["fontFamily"];
  removable: boolean;
  hovered: boolean;
}

// The chip's box is the token's own characters, painted transparent, so it
// takes exactly the token's width. The visible icon and label sit on top in a
// smaller font, centered in the slack the smaller font leaves.
function OverlayChip({
  text,
  label,
  chipIndex,
  kind,
  testID,
  fontFamily,
  removable,
  hovered,
}: OverlayChipProps) {
  const dataSet = useMemo(
    () => (chipIndex === null ? undefined : { composerChip: String(chipIndex) }),
    [chipIndex],
  );
  const removeDataSet = useMemo(
    () => (chipIndex === null ? undefined : { composerChipRemove: String(chipIndex) }),
    [chipIndex],
  );
  const labelStyle = useMemo(() => [styles.chipLabel, { fontFamily }], [fontFamily]);
  const removeStyle = useMemo(
    () => [styles.chipRemove, hovered && styles.chipRemoveVisible],
    [hovered],
  );
  return (
    <Text style={styles.chip} dataSet={dataSet} testID={testID}>
      {text}
      <View style={styles.chipContent}>
        {CHIP_ICONS[kind]}
        <Text style={labelStyle} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {removable ? (
        <View style={removeStyle} dataSet={removeDataSet}>
          {chipRemoveIcon}
        </View>
      ) : null}
    </Text>
  );
}

const ThemedImageIcon = withUnistyles(ImageIcon);
const ThemedFileText = withUnistyles(FileText);
const ThemedGitPullRequest = withUnistyles(GitPullRequest);
const ThemedCircleDot = withUnistyles(CircleDot);
const ThemedX = withUnistyles(X);
const chipIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const CHIP_ICONS: Record<InlineChipKind, ReactElement> = {
  image: <ThemedImageIcon size={ICON_SIZE.xs} uniProps={chipIconMapping} />,
  file: <ThemedFileText size={ICON_SIZE.xs} uniProps={chipIconMapping} />,
  change_request: <ThemedGitPullRequest size={ICON_SIZE.xs} uniProps={chipIconMapping} />,
  issue: <ThemedCircleDot size={ICON_SIZE.xs} uniProps={chipIconMapping} />,
  resource: <ThemedFileText size={ICON_SIZE.xs} uniProps={chipIconMapping} />,
};
const chipRemoveIcon = <ThemedX size={10} uniProps={chipIconMapping} />;

const CHIP_REMOVE_SIZE = 16;

const styles = StyleSheet.create((theme) => ({
  box: {
    position: "absolute",
    overflow: "hidden",
  },
  text: {
    color: theme.colors.foreground,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  },
  link: {
    color: theme.colors.accentBright,
  },
  keywordRed: { color: theme.colors.palette.red[500] },
  keywordOrange: { color: theme.colors.palette.orange[500] },
  keywordYellow: { color: theme.colors.palette.yellow[400] },
  keywordGreen: { color: theme.colors.palette.green[400] },
  keywordBlue: { color: theme.colors.palette.blue[400] },
  keywordPurple: { color: theme.colors.palette.purple[500] },
  chip: {
    position: "relative",
    color: "transparent",
    paddingVertical: 1,
    borderRadius: theme.borderRadius.base,
    backgroundColor: theme.colors.surface2,
    boxShadow: `inset 0 0 0 1px ${theme.colors.borderAccent}`,
  },
  chipContent: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  chipLabel: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.content - 2,
  },
  chipRemove: {
    position: "absolute",
    top: "50%",
    right: 2,
    width: CHIP_REMOVE_SIZE,
    height: CHIP_REMOVE_SIZE,
    marginTop: -CHIP_REMOVE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.base,
    backgroundColor: theme.colors.surface3,
    opacity: 0,
  },
  chipRemoveVisible: {
    opacity: 1,
  },
}));

const KEYWORD_LETTER_STYLES = [
  styles.keywordRed,
  styles.keywordOrange,
  styles.keywordYellow,
  styles.keywordGreen,
  styles.keywordBlue,
  styles.keywordPurple,
];
