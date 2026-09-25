import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { PixelLoader } from "@/components/pixel-loader";

// Keeps ActivityIndicator's named sizes so callers read the same; every spinner is the pixel grid.
const NAMED_SIZES = { small: 14, large: 24 } as const;

interface LoadingSpinnerProps {
  color: string;
  size?: number | keyof typeof NAMED_SIZES;
  style?: StyleProp<ViewStyle>;
}

export function LoadingSpinner({ color, size = "small", style }: LoadingSpinnerProps) {
  const px = typeof size === "number" ? size : NAMED_SIZES[size];
  const loader = <PixelLoader size={px} color={color} />;
  return style ? <View style={style}>{loader}</View> : loader;
}
