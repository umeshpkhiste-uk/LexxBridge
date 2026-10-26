import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "expo-router/tabs";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./theme";

type ActionItem = {
  /** Render the action tab right after this route name. */
  afterRoute: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
};

type Props = BottomTabBarProps & {
  /** Route names that exist as tabs but aren't shown in the bar. */
  hiddenRoutes?: string[];
  /** Extra tab-styled button inserted inline among the real tabs (not a route). */
  actionItem?: ActionItem;
  fabLabel: string;
  onFabPress: () => void;
};

/**
 * Bottom bar with all tabs laid out evenly in a single row (plus one
 * non-route action button inserted among them), and a small round FAB
 * floating above the bar, anchored above the last tab.
 */
export function CenterFabTabBar({ state, descriptors, navigation, hiddenRoutes = [], actionItem, fabLabel, onFabPress }: Props) {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [fabAnchor, setFabAnchor] = useState<{ x: number; width: number } | null>(null);

  const visible = state.routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => !hiddenRoutes.includes(route.name));

  const renderTab = ({ route, index }: (typeof visible)[number], onLayout?: (e: LayoutChangeEvent) => void) => {
    const { options } = descriptors[route.key];
    const focused = state.index === index;
    const color = focused ? colors.brand : colors.textSecondary;
    const label = typeof options.title === "string" ? options.title : route.name;

    const onPress = () => {
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onLayout={onLayout}
        style={styles.tab}
      >
        {options.tabBarIcon?.({ focused, color, size: 24 })}
        <Text style={[typography.caption, { color, fontSize: 12, fontWeight: focused ? "600" : "400", marginTop: 2 }]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  const renderAction = (item: ActionItem) => (
    <Pressable
      key="tab-bar-action"
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      style={styles.tab}
    >
      <Ionicons name={item.icon} size={24} color={colors.textSecondary} />
      <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 12, marginTop: 2 }]}>{item.label}</Text>
    </Pressable>
  );

  const items = visible.flatMap((entry, i) => {
    const isLast = i === visible.length - 1;
    const onLayout = isLast
      ? (e: LayoutChangeEvent) => setFabAnchor({ x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width })
      : undefined;
    const rendered = [renderTab(entry, onLayout)];
    if (actionItem && entry.route.name === actionItem.afterRoute) rendered.push(renderAction(actionItem));
    return rendered;
  });

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 10) },
      ]}
    >
      <View style={styles.row}>{items}</View>

      {fabAnchor ? (
        <Pressable
          onPress={onFabPress}
          accessibilityRole="button"
          accessibilityLabel={fabLabel}
          style={({ pressed }) => [
            styles.fab,
            {
              left: fabAnchor.x + fabAnchor.width / 2 - 28,
              backgroundColor: colors.brand,
              borderColor: colors.background,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
        >
          <Ionicons name="add" size={28} color={colors.textInverse} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: 10,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  row: { flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48 },
  fab: {
    position: "absolute",
    // Fully clear of the bar's own row (56px tall) plus a standard 16px gap,
    // so it floats above the Profile tab instead of sitting on top of it.
    top: -(56 + 16),
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
