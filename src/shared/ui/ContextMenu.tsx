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

// RN's style types don't include "fixed" (it's web-only CSS), so this is
// built directly rather than through StyleSheet.create.
const webOverlay = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 };

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
  // The overlay below always spans the real window on both platforms (see
  // its own comment), so every coordinate here is window-relative — the
  // app's own column is only used to keep the card from drifting into the
  // grey margin beside it on a wide desktop browser; on a phone (native or
  // mobile web) columnLeft is 0 and columnWidth is the full window anyway.
  const columnLeft = Platform.OS === "web" ? Math.max(0, (windowWidth - appWidth) / 2) : 0;
  const columnWidth = appWidth;

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

  const onRight = anchor.x + anchor.width / 2 > columnLeft + columnWidth / 2;
  let left = onRight ? anchor.x + anchor.width - cardWidth : anchor.x;
  left = Math.min(Math.max(left, columnLeft + MARGIN), Math.max(columnLeft + columnWidth - cardWidth - MARGIN, columnLeft + MARGIN));

  const fitsBelow = anchor.y + anchor.height + MARGIN + cardHeight <= windowHeight - insets.bottom - MARGIN;
  const top = fitsBelow ? anchor.y + anchor.height + MARGIN : Math.max(anchor.y - cardHeight - MARGIN, insets.top + MARGIN);

  const content = (
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
      <View
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            maxWidth: Math.min(CARD_MAX_WIDTH, columnWidth - MARGIN * 2),
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

  // ContextMenu is often rendered deep inside a small item (a post card, a
  // list row) rather than at the screen root, unlike ActionSheet. RN's
  // Modal already escapes that nesting on native — it portals above the
  // whole app regardless of where it's mounted, so the backdrop always
  // covers the real screen and a tap anywhere outside the menu closes it.
  // On the web, a plain in-place `position: absolute` overlay (the trick
  // ActionSheet uses to stay inside AppFrame's phone-width column) only
  // fills its *nearest* positioned ancestor — when that's a small item,
  // not the screen, the backdrop was silently clipped to that item's
  // bounds, so taps outside it did nothing and the menu never closed.
  // `position: fixed` escapes that nesting the same way Modal does
  // natively, while staying confined to the browser viewport rather than
  // portalling past it — exactly the coverage the backdrop needs.
  if (Platform.OS === "web") return <View style={webOverlay as object}>{content}</View>;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
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
