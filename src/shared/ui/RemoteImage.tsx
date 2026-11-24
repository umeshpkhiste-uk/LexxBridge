import { Ionicons } from "@expo/vector-icons";
import { Image, type ImageContentFit } from "expo-image";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useIsSlow } from "@/shared/hooks/useIsSlow";
import { useTheme } from "./theme";

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  /** Shown behind the image until it loads, and kept if it never does — for
   * small pictures (avatars) with no room for a message. Without one, a
   * spinner, a "network is slow" note and a retry are shown instead. */
  fallback?: ReactNode;
  accessibilityLabel?: string;
  /** Passed to the retry overlay, which would otherwise swallow it. */
  onLongPress?: (event: GestureResponderEvent) => void;
};

/** An image from the network. Use this instead of Image for anything that
 * isn't bundled or just picked on this device. */
export function RemoteImage(props: Props) {
  // Keyed so a different picture starts again from "loading".
  return <RemoteImageContent key={props.uri} {...props} />;
}

function RemoteImageContent({ uri, style, contentFit = "cover", fallback, accessibilityLabel, onLongPress }: Props) {
  const { colors, typography } = useTheme();
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const isSlow = useIsSlow(status === "loading");

  return (
    <View style={[style, styles.clip]}>
      {fallback && status !== "loaded" ? <View style={[StyleSheet.absoluteFill, styles.fallback]}>{fallback}</View> : null}
      {status !== "failed" ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          transition={150}
          accessibilityLabel={accessibilityLabel}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("failed")}
        />
      ) : null}
      {!fallback && status === "loading" ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator color={colors.accent} />
          {isSlow ? <Text style={[typography.caption, styles.note]}>Network is slow. Still loading…</Text> : null}
        </View>
      ) : null}
      {!fallback && status === "failed" ? <ImageRetry onRetry={() => setStatus("loading")} onLongPress={onLongPress} /> : null}
    </View>
  );
}

/** Fills its parent: "couldn't load", tap to try again. */
export function ImageRetry({ onRetry, onLongPress, what = "photo" }: { onRetry: () => void; onLongPress?: Props["onLongPress"]; what?: string }) {
  const { typography } = useTheme();
  return (
    <Pressable
      onPress={onRetry}
      onLongPress={onLongPress}
      delayLongPress={500}
      accessibilityRole="button"
      accessibilityLabel={`Couldn't load ${what}. Tap to try again`}
      style={[StyleSheet.absoluteFill, styles.center]}
    >
      <Ionicons name="cloud-offline-outline" size={24} color="#FFFFFF" style={styles.icon} />
      <Text style={[typography.caption, styles.note]}>Couldn&apos;t load {what}. Tap to try again</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  fallback: { alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", justifyContent: "center", gap: 8, padding: 8 },
  icon: { backgroundColor: "rgba(15, 23, 42, 0.7)", padding: 8, borderRadius: 20, overflow: "hidden" },
  // Own dark background: sits on light cards, dark viewers and chat bubbles alike.
  note: { color: "#FFFFFF", backgroundColor: "rgba(15, 23, 42, 0.7)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: "hidden", textAlign: "center" },
});
