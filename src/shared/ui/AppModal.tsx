import type { PropsWithChildren } from "react";
import { Modal } from "react-native";

export type AppModalProps = PropsWithChildren<{
  visible: boolean;
  transparent?: boolean;
  animationType?: "none" | "slide" | "fade";
  onRequestClose: () => void;
}>;

/** Drop-in replacement for RN's own Modal — use this instead of Modal
 * directly, everywhere in the app. Modal portals above the whole native
 * app here, same as always; the point of this wrapper is the web
 * counterpart (AppModal.web.tsx), which keeps the same portal-above-
 * everything behavior confined to the app's own phone-width column
 * instead of covering the real browser window — see its comment. */
export function AppModal({ visible, transparent = true, animationType = "fade", onRequestClose, children }: AppModalProps) {
  return (
    <Modal visible={visible} transparent={transparent} animationType={animationType} onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}
