import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View, type ViewStyle, type TextStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { openExternalUrl } from "@/utils/open-external-url";
import { hasTextLinks, splitTextLinks } from "@/utils/text-links";
import type { ComposerLinkOverlayProps } from "./link-overlay.types";

// A textarea can't style part of its text, so the overlay paints the draft
// with colored links underneath a transparent-text textarea. Cmd+click or
// Ctrl+click on a link opens it; a plain click keeps editing.

const LINK_ATTRIBUTE = "data-composer-link";
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

function findLinkAtPoint(overlay: HTMLElement | null, x: number, y: number): string | null {
  if (!overlay) return null;
  for (const element of overlay.querySelectorAll<HTMLElement>(`[${LINK_ATTRIBUTE}]`)) {
    for (const rect of element.getClientRects()) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return element.getAttribute(LINK_ATTRIBUTE);
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

export function ComposerLinkOverlay({ getTextArea, value }: ComposerLinkOverlayProps) {
  const [text, setText] = useState(value);
  const [geometry, setGeometry] = useState<OverlayGeometry | null>(null);
  const overlayRef = useRef<View | null>(null);
  const contentRef = useRef<Text | null>(null);
  const active = hasTextLinks(text);

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
    // two cheap values while the draft has a link.
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

    const linkAtEvent = (event: MouseEvent) =>
      event.metaKey || event.ctrlKey
        ? findLinkAtPoint(
            overlayRef.current as unknown as HTMLElement | null,
            event.clientX,
            event.clientY,
          )
        : null;
    const handleMouseMove = (event: MouseEvent) => {
      textArea.style.cursor = linkAtEvent(event) ? "pointer" : "";
    };
    const handleMouseDown = (event: MouseEvent) => {
      const url = linkAtEvent(event);
      if (!url) return;
      event.preventDefault();
      void openExternalUrl(url);
    };
    textArea.addEventListener("mousemove", handleMouseMove);
    textArea.addEventListener("mousedown", handleMouseDown);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      textArea.removeEventListener("mousemove", handleMouseMove);
      textArea.removeEventListener("mousedown", handleMouseDown);
      textArea.style.cursor = "";
      restoreTextArea();
      setGeometry(null);
    };
  }, [active, getTextArea]);

  const segments = useMemo(() => (active ? splitTextLinks(text) : []), [active, text]);
  const boxStyle = useMemo(() => [styles.box, geometry?.box], [geometry]);
  const textStyle = useMemo(() => [styles.text, geometry?.text], [geometry]);

  if (!active || !geometry) return null;
  return (
    <View ref={overlayRef} style={boxStyle} pointerEvents="none" aria-hidden>
      <Text ref={contentRef} style={textStyle}>
        {segments.map((segment) =>
          segment.kind === "link" ? (
            <OverlayLink key={segment.start} url={segment.text} />
          ) : (
            segment.text
          ),
        )}
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
}));
