import { RefObject } from "react";
import { GestureResponderEvent, type ViewInstance } from "react-native";

export type MenuAnchor = { x: number; y: number; width: number; height: number };

/** Where to anchor a ContextMenu for a long-press on a content area (a chat
 * bubble, a list row) — pass straight through from the Pressable's own
 * handler:
 *
 *   onLongPress={(e) => setMenu({ anchor: anchorFromEvent(e), title, actions })}
 *
 * Anchoring to the exact touch point rather than the whole element's
 * bounds matches where the user's finger actually was, which is what
 * WhatsApp does too. For a small fixed button (⋮, attach, filter) use
 * measureAnchor instead — the touch point can land anywhere inside a
 * small hit-slop target, which misplaces the menu relative to the
 * button itself rather than wherever the finger happened to be. */
export function anchorFromEvent(event: GestureResponderEvent): MenuAnchor {
  const { pageX, pageY } = event.nativeEvent;
  return { x: pageX, y: pageY, width: 0, height: 0 };
}

/** Anchors a ContextMenu to a button's own bounds instead of the touch
 * point, so it sits flush against that button regardless of where inside
 * it was tapped — give the button this ref and call this from its onPress:
 *
 *   const ref = useRef<ViewInstance>(null);
 *   <Pressable ref={ref} onPress={() => measureAnchor(ref, (anchor) => setMenu({ anchor, actions }))} />
 */
export function measureAnchor(ref: RefObject<ViewInstance | null>, onDone: (anchor: MenuAnchor) => void) {
  ref.current?.measureInWindow((x: number, y: number, width: number, height: number) => onDone({ x, y, width, height }));
}
