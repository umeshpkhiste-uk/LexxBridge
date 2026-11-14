import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { GestureResponderEvent, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppWidth } from "./appFrame";
import type { SheetAction } from "./ActionSheet";
import { useTheme } from "./theme";

export type MenuAnchor = { x: number; y: number; width: number; height: number };

/** Where to anchor the menu for a given long-press (or button tap) —
 * pass straight through from the Pressable's own handler:
 *
 *   onLongPress={(e) => setMenu({ anchor: anchorFromEvent(e), title, actions })}
 *
 * Anchoring to the exact touch point rather than the whole element's
 * bounds matches where the user's finger actually was, which is what
 * WhatsApp does too, and needs no ref/measurement. */
export function anchorFromEvent(event: GestureResponderEvent): MenuAnchor {
  const { pageX, pageY } = event.nativeEvent;
  return { x: pageX, y: pageY, width: 0, height: 0 };
}

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
 * (whichever fits) and reveals. */
export function ContextMenu({ visible, anchor, title, actions, onClose }: Props) {
  const { colors, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const appWidth = useAppWidth();
  // On the web the app renders in a centred phone-width column (see
  // appFrame.tsx) while a touch event's pageX/pageY are relative to the
  // real browser window, so an anchor must be shifted back into the
  // column's own coordinate space before it's used for layout.
  const webOffsetX = Platform.OS === "web" ? Math.max(0, (windowWidth - appWidth) / 2) : 0;
  const screenWidth = appWidth;
  const screenHeight = windowHeight;

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

  const localAnchor = { x: anchor.x - webOffsetX, y: anchor.y, width: anchor.width, height: anchor.height };
  const cardWidth = size?.width ?? CARD_MAX_WIDTH;
  const cardHeight = size?.height ?? 0;

  const onRight = localAnchor.x + localAnchor.width / 2 > screenWidth / 2;
  let left = onRight ? localAnchor.x + localAnchor.width - cardWidth : localAnchor.x;
  left = Math.min(Math.max(left, MARGIN), Math.max(screenWidth - cardWidth - MARGIN, MARGIN));

  const fitsBelow = localAnchor.y + localAnchor.height + MARGIN + cardHeight <= screenHeight - insets.bottom - MARGIN;
  const top = fitsBelow
    ? localAnchor.y + localAnchor.height + MARGIN
    : Math.max(localAnchor.y - cardHeight - MARGIN, insets.top + MARGIN);

  const content = (
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
      <View
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            maxWidth: Math.min(CARD_MAX_WIDTH, screenWidth - MARGIN * 2),
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
  );

  // Same native/web split as ActionSheet, and for the same reason: RN's
  // Modal portals to the window on web, breaking out of AppFrame's
  // phone-width column, so web instead gets an absolutely-positioned
  // overlay rendered in place (confined to that column — see webOffsetX
  // above, which maps the window-relative anchor into it). Native keeps
  // the real Modal, which already covers the full window, so the anchor's
  // own window-relative coordinates need no offset there.
  if (Platform.OS === "web") return <View style={styles.overlay}>{content}</View>;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 1000, elevation: 20 },
  backdrop: { flex: 1 },
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
