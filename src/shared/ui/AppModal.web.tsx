import { createPortal } from "react-dom";
import { useWindowDimensions, View } from "react-native";
import { useAppWidth } from "./appFrame";
import type { AppModalProps } from "./AppModal";

// RN's style types don't include "fixed" (it's web-only CSS), so this is
// built directly rather than through StyleSheet.create.
const portalRootBase = { position: "fixed", top: 0, zIndex: 1000 };

/** Web counterpart of AppModal (native: AppModal.tsx). RN's own Modal
 * portals straight to the browser window on the web, breaking out of
 * AppFrame's centred phone-width column (see appFrame.tsx) and covering
 * the real monitor instead of just the app — this is what every bottom
 * sheet, dropdown and full-screen viewer in the app used to do before
 * this file existed, whenever it used Modal directly on the web.
 *
 * This portals to document.body too — same as Modal, and for the same
 * reason ContextMenu.web.tsx does (escaping any ancestor's CSS `filter`
 * or `overflow: hidden`, which an in-place `position: fixed` overlay
 * alone can't escape) — but sizes and centres itself to exactly the
 * app's own column instead of the full window, so content inside still
 * renders confined to it, the same as it would on native or an actual
 * phone. `onRequestClose` is a no-op here, matching Modal on the web
 * (there's no Android hardware back button to wire it to). */
export function AppModal({ visible, children }: AppModalProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const appWidth = useAppWidth();
  const left = Math.max(0, (windowWidth - appWidth) / 2);

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <View style={{ ...portalRootBase, left, width: appWidth, height: windowHeight } as object}>{children}</View>,
    document.body
  );
}
