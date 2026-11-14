import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SheetAction } from "./ActionSheet";
import type { MenuAnchor } from "./menuAnchor";
import { useTheme } from "./theme";

export { anchorFromEvent, measureAnchor, type MenuAnchor } from "./menuAnchor";

type Props = {
  visible: boolean;
  anchor: MenuAnchor | null;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
};

const MARGIN = 8;
const CARD_MAX_WIDTH = 240;

/** A small menu that pops up right next to whatever was pressed — like
 * WhatsApp's message long-press menu — instead of a bottom sheet. Position
 * is resolved in two passes: it renders once invisibly to measure its own
 * size via onLayout, then places itself above or below the anchor
 * (whichever fits) and reveals.
 *
 * Rendered through RN's own Modal here, which already portals above the
 * whole app regardless of where ContextMenu itself is mounted — unlike
 * the web counterpart (ContextMenu.web.tsx), native has no CSS
 * containing-block/overflow quirks to work around. */
export function ContextMenu({ visible, anchor, title, actions, onClose }: Props) {
  const { colors, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  // Same double-fire guard as ActionSheet — see its comment for why.
  const [fired, setFired] = useState(false);
  // Each new long-press passes a new anchor object, so resetting here —
  // adjusting state during render, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  // — re-measures the menu and re-arms the guard for the new open.
  const [prevAnchor, setPrevAnchor] = useState<MenuAnchor | null>(null);
  if (anchor !== prevAnchor) {
    setPrevAnchor(anchor);
    setSize(null);
    setFired(false);
  }

  if (!visible || !anchor) return null;

  const cardWidth = size?.width ?? CARD_MAX_WIDTH;
  const cardHeight = size?.height ?? 0;

  const onRight = anchor.x + anchor.width / 2 > windowWidth / 2;
  let left = onRight ? anchor.x + anchor.width - cardWidth : anchor.x;
  left = Math.min(Math.max(left, MARGIN), Math.max(windowWidth - cardWidth - MARGIN, MARGIN));

  const fitsBelow = anchor.y + anchor.height + MARGIN + cardHeight <= windowHeight - insets.bottom - MARGIN;
  const top = fitsBelow ? anchor.y + anchor.height + MARGIN : Math.max(anchor.y - cardHeight - MARGIN, insets.top + MARGIN);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        <View
          onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              maxWidth: Math.min(CARD_MAX_WIDTH, windowWidth - MARGIN * 2),
              opacity: size ? 1 : 0,
              left,
              top,
            },
          ]}
        >
          {title ? (
            <Text
              numberOfLines={1}
              style={[typography.caption, styles.title, { color: colors.textSecondary, borderBottomColor: colors.border }]}
            >
              {title}
            </Text>
          ) : null}
          {actions.map((action, i) => (
            <Pressable
              key={action.label}
              onPress={() => {
                if (fired) return;
                setFired(true);
                onClose();
                action.onPress();
              }}
              style={({ pressed }) => [
                styles.row,
                i < actions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                { backgroundColor: pressed ? colors.surfaceAlt : "transparent" },
              ]}
            >
              <Text style={[typography.body, { color: action.destructive ? colors.danger : colors.textPrimary, flex: 1 }]}>
                {action.label}
              </Text>
              <Ionicons name={action.icon} size={18} color={action.destructive ? colors.danger : colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Matches ActionSheet's dimming — without it the card had no visual
  // separation from whatever it happened to land on top of (e.g. the next
  // line of a post's text), which read as a layout glitch rather than an
  // intentional popup, especially on narrower phone screens.
  backdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.4)" },
  card: {
    position: "absolute",
    paddingVertical: 4,
    minWidth: 180,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  title: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
});
