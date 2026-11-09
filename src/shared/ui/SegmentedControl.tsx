import { useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, ViewStyle, type ScrollViewInstance } from "react-native";
import { useTheme } from "./theme";

type Segment = { key: string; label: string };

type Props = {
  segments: Segment[];
  value: string;
  onChange: (key: string) => void;
  /** For many tabs: segments size to their label and the bar scrolls
   * horizontally instead of squeezing every label into equal widths. */
  scrollable?: boolean;
  /** Locks the current selection — e.g. a client's type can't change once
   * the client (and any cases under it) already exist. */
  disabled?: boolean;
  style?: ViewStyle;
};

/**
 * The app's one tab style: a recessed pill track with the active tab raised
 * as a brand-coloured pill inside it, with thin dividers between inactive ones.
 */
export function SegmentedControl({ segments, value, onChange, scrollable = false, disabled = false, style }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const offsets = useRef<Record<string, number>>({});
  const activeIndex = segments.findIndex((s) => s.key === value);
  // Three or more equal tabs share a narrow screen: slightly smaller text.
  const fontSize = !scrollable && segments.length >= 3 ? 13 : 14;

  const handlePress = (key: string) => {
    onChange(key);
    // Keep the chosen tab comfortably in view when the bar scrolls.
    const x = offsets.current[key];
    if (scrollable && x !== undefined) scrollRef.current?.scrollTo({ x: Math.max(0, x - 48), animated: true });
  };

  const items = segments.map((segment, index) => {
    const isActive = index === activeIndex;
    // A divider sits between two inactive neighbours only; next to the
    // filled pill it would look like a stray line.
    const showDivider = index > 0 && !isActive && index - 1 !== activeIndex;
    return (
      <Pressable
        key={segment.key}
        onPress={() => handlePress(segment.key)}
        disabled={disabled}
        onLayout={(e) => {
          offsets.current[segment.key] = e.nativeEvent.layout.x;
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive, disabled }}
        style={[
          styles.segment,
          scrollable ? { paddingHorizontal: spacing.lg } : styles.equal,
          { borderRadius: radius.pill, backgroundColor: isActive ? colors.brand : "transparent" },
          isActive && styles.activeShadow,
          disabled && !isActive && styles.disabledSegment,
        ]}
      >
        {showDivider ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
        <Text
          numberOfLines={1}
          style={[
            typography.body,
            {
              fontSize,
              letterSpacing: 0.2,
              fontWeight: isActive ? "700" : "600",
              color: isActive ? colors.textInverse : colors.textSecondary,
              textAlign: "center",
              paddingHorizontal: scrollable ? 0 : spacing.xs,
            },
          ]}
        >
          {segment.label}
        </Text>
      </Pressable>
    );
  });

  const containerStyle = [
    styles.container,
    { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: radius.pill },
  ];

  if (scrollable) {
    return (
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[{ flexGrow: 0, marginBottom: spacing.md }, style]}
        // Edge-to-edge scroll: place the bar full-width, padding is built in.
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.lg }]}
      >
        <View style={containerStyle}>{items}</View>
      </ScrollView>
    );
  }

  return <View style={[containerStyle, { marginBottom: spacing.md }, style]}>{items}</View>;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  activeShadow: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  scrollContent: { paddingVertical: 4 },
  segment: { minHeight: 38, alignItems: "center", justifyContent: "center" },
  disabledSegment: { opacity: 0.4 },
  equal: { flex: 1 },
  divider: { position: "absolute", left: 0, top: 10, bottom: 10, width: StyleSheet.hairlineWidth * 2 },
});
