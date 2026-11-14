import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppWidth } from "./appFrame";
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

// RN's style types don't include "fixed" (it's web-only CSS), so this is
// built directly rather than through StyleSheet.create.
const portalRoot = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 };

/** Web counterpart of ContextMenu (native: ContextMenu.tsx). ContextMenu is
 * usually mounted inside one small item (a post card, a list row), not at
 * the screen root. A plain in-place overlay only escapes an *ordinary*
 * ancestor; it still gets trapped — mispositioned, and often invisible —
 * by any ancestor with its own CSS `filter` (which several cards get from
 * RN shadow props, translated to `filter: drop-shadow(...)` on the web)
 * or `overflow: hidden`, both of which create a new containing block or
 * clip region that `position: fixed` can't escape. A real DOM portal
 * straight to `document.body`, the way RN's own Modal portals above the
 * whole native app, is the only thing that reliably escapes all of that. */
export function ContextMenu({ visible, anchor, title, actions, onClose }: Props) {
  const { colors, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const appWidth = useAppWidth();
  // The portal escapes to document.body, i.e. the real window — the app's
  // own centred column (see appFrame.tsx) is only used here to keep the
  // card from drifting into the grey margin beside it on a wide desktop
  // browser; on a phone, columnLeft is 0 and columnWidth is the full
  // window anyway.
  const columnLeft = Math.max(0, (windowWidth - appWidth) / 2);
  const columnWidth = appWidth;

  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [fired, setFired] = useState(false);
  const [prevAnchor, setPrevAnchor] = useState<MenuAnchor | null>(null);
  if (anchor !== prevAnchor) {
    setPrevAnchor(anchor);
    setSize(null);
    setFired(false);
  }

  if (!visible || !anchor || typeof document === "undefined") return null;

  const cardWidth = size?.width ?? CARD_MAX_WIDTH;
  const cardHeight = size?.height ?? 0;

  const onRight = anchor.x + anchor.width / 2 > columnLeft + columnWidth / 2;
  let left = onRight ? anchor.x + anchor.width - cardWidth : anchor.x;
  left = Math.min(Math.max(left, columnLeft + MARGIN), Math.max(columnLeft + columnWidth - cardWidth - MARGIN, columnLeft + MARGIN));

  const fitsBelow = anchor.y + anchor.height + MARGIN + cardHeight <= windowHeight - insets.bottom - MARGIN;
  const top = fitsBelow ? anchor.y + anchor.height + MARGIN : Math.max(anchor.y - cardHeight - MARGIN, insets.top + MARGIN);

  return createPortal(
    <View style={portalRoot as object}>
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
    </View>,
    document.body
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
