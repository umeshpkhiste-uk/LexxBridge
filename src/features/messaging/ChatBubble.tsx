import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/shared/ui/theme";
import { getAttachmentUrl, Message } from "./api";
import { bubbleTime, fileSizeLabel, messagePreview } from "./chatFormat";

export type LocalStatus = "sending" | "failed" | "offline";

export type ChatMessage = Message & { localStatus?: LocalStatus; localUri?: string };

type Props = {
  message: ChatMessage;
  isMine: boolean;
  replyTo: ChatMessage | null;
  replyToIsMine: boolean;
  partnerName: string;
  onLongPress: (event: GestureResponderEvent) => void;
  onPressReply: () => void;
  onOpenImage: (uri: string) => void;
  onOpenFile: () => void;
  onRetry: () => void;
  onExplainUndecryptable: () => void;
};

const READ_BLUE = "#53BDEB";

/** One WhatsApp-style bubble: optional reply quote, photo or file, text,
 * then "edited", the time and (for your own messages) delivery ticks. */
export function ChatBubble({
  message,
  isMine,
  replyTo,
  replyToIsMine,
  partnerName,
  onLongPress,
  onPressReply,
  onOpenImage,
  onOpenFile,
  onRetry,
  onExplainUndecryptable,
}: Props) {
  const { colors, typography } = useTheme();
  const fg = isMine ? colors.textInverse : colors.textPrimary;
  const muted = isMine ? "rgba(255,255,255,0.72)" : colors.textSecondary;

  if (message.is_deleted) {
    return (
      <View style={[styles.row, { justifyContent: isMine ? "flex-end" : "flex-start" }]}>
        <View style={[styles.bubble, bubbleShape(isMine), { backgroundColor: isMine ? colors.brand : colors.surface, borderColor: colors.border, borderWidth: isMine ? 0 : StyleSheet.hairlineWidth }]}>
          <View style={styles.inline}>
            <Ionicons name="ban-outline" size={14} color={muted} />
            <Text style={[typography.body, { color: muted, fontStyle: "italic" }]}>This message was deleted</Text>
          </View>
          <Text style={[styles.meta, { color: muted, alignSelf: "flex-end" }]}>{bubbleTime(message.created_at)}</Text>
        </View>
      </View>
    );
  }

  // A placeholder explanation, not real content — rendered as a small muted
  // system note (like a day divider), never as a colored chat bubble, so a
  // run of these can't be mistaken for actual messages or look like the
  // chat itself is broken. Tapping it explains why in plain language.
  if (message.is_undecryptable) {
    return (
      <Pressable
        onPress={onExplainUndecryptable}
        style={[styles.systemRow, { alignSelf: isMine ? "flex-end" : "flex-start" }]}
        accessibilityLabel={`${message.content}. Tap to learn more.`}
      >
        <View style={[styles.systemPill, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="lock-closed-outline" size={12} color={colors.textSecondary} />
          <Text style={[typography.caption, { color: colors.textSecondary, fontStyle: "italic" }]} numberOfLines={1}>
            Message unavailable on this device
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{bubbleTime(message.created_at)}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, { justifyContent: isMine ? "flex-end" : "flex-start" }]}>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={500}
        onPress={message.localStatus === "failed" || message.localStatus === "offline" ? onRetry : undefined}
        style={({ pressed }) => [
          styles.bubble,
          bubbleShape(isMine),
          {
            backgroundColor: isMine ? colors.brand : colors.surface,
            borderColor: colors.border,
            borderWidth: isMine ? 0 : StyleSheet.hairlineWidth,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        {replyTo ? (
          <Pressable
            onPress={onPressReply}
            style={[styles.quote, { backgroundColor: isMine ? "rgba(255,255,255,0.14)" : colors.surfaceAlt, borderLeftColor: colors.accent }]}
          >
            <Text style={[typography.caption, { color: isMine ? "#FFDEA5" : colors.accent, fontWeight: "700" }]}>
              {replyToIsMine ? "You" : partnerName}
            </Text>
            <Text style={[typography.caption, { color: muted }]} numberOfLines={2}>
              {replyTo.attachment_kind === "image" ? "📷 " : replyTo.attachment_kind === "file" ? "📄 " : ""}
              {messagePreview(replyTo)}
            </Text>
          </Pressable>
        ) : null}

        {message.attachment_kind === "image" ? (
          <ChatImage message={message} onOpen={onOpenImage} onLongPress={onLongPress} />
        ) : message.attachment_kind === "file" ? (
          <Pressable
            onPress={onOpenFile}
            onLongPress={onLongPress}
            delayLongPress={500}
            style={[styles.file, { backgroundColor: isMine ? "rgba(255,255,255,0.14)" : colors.surfaceAlt }]}
          >
            <View style={[styles.fileIcon, { backgroundColor: isMine ? "rgba(255,255,255,0.2)" : colors.surface }]}>
              <Ionicons name={message.attachment_mime?.includes("pdf") ? "document-text" : "document"} size={22} color={isMine ? "#FFFFFF" : colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyStrong, { color: fg }]} numberOfLines={2}>
                {message.attachment_name ?? "File"}
              </Text>
              <Text style={[typography.caption, { color: muted }]}>
                {[fileSizeLabel(message.attachment_size), message.attachment_mime?.split("/").pop()?.toUpperCase()].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Ionicons name="download-outline" size={20} color={muted} />
          </Pressable>
        ) : null}

        {message.content ? <Text style={[typography.body, { color: fg }]}>{message.content}</Text> : null}

        <View style={[styles.inline, { alignSelf: "flex-end", marginTop: 2 }]}>
          {message.edited_at ? <Text style={[styles.meta, { color: muted }]}>edited</Text> : null}
          <Text style={[styles.meta, { color: muted }]}>{bubbleTime(message.created_at)}</Text>
          {isMine ? <Ticks message={message} muted={muted} /> : null}
        </View>
        {message.localStatus === "failed" ? (
          <Text style={[typography.caption, { color: "#FFB4AB", marginTop: 2 }]}>Not sent · tap to retry</Text>
        ) : null}
        {message.localStatus === "offline" ? (
          <Text style={[typography.caption, { color: muted, marginTop: 2 }]}>You&apos;re offline · will send automatically</Text>
        ) : null}
      </Pressable>
    </View>
  );
}

function Ticks({ message, muted }: { message: ChatMessage; muted: string }) {
  if (message.localStatus === "sending") return <Ionicons name="time-outline" size={13} color={muted} />;
  if (message.localStatus === "offline") return <Ionicons name="cloud-offline-outline" size={13} color={muted} />;
  if (message.localStatus === "failed") return <Ionicons name="alert-circle" size={14} color="#FFB4AB" />;
  if (message.read_at) return <Ionicons name="checkmark-done" size={16} color={READ_BLUE} accessibilityLabel="Read" />;
  return <Ionicons name="checkmark" size={15} color={muted} accessibilityLabel="Sent" />;
}

function ChatImage({
  message,
  onOpen,
  onLongPress,
}: {
  message: ChatMessage;
  onOpen: (uri: string) => void;
  onLongPress: (event: GestureResponderEvent) => void;
}) {
  const [uri, setUri] = useState<string | null>(message.localUri ?? null);

  useEffect(() => {
    if (message.localUri || !message.attachment_path) return;
    let cancelled = false;
    getAttachmentUrl(message.attachment_path)
      .then((url) => !cancelled && setUri(url))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [message.attachment_path, message.localUri]);

  return (
    // A nested Pressable with its own onPress claims the touch responder,
    // so the outer bubble's onLongPress (the "Delete for everyone" menu)
    // never fired for a touch starting on the image — it needs its own
    // long-press here, matching the rest of the bubble's 500ms.
    <Pressable onPress={() => uri && onOpen(uri)} onLongPress={onLongPress} delayLongPress={500} style={styles.image}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <ActivityIndicator style={StyleSheet.absoluteFill} color="#FFFFFF" />
      )}
      {message.localStatus === "sending" ? (
        <View style={[StyleSheet.absoluteFill, styles.imageOverlay]}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}
    </Pressable>
  );
}

function bubbleShape(isMine: boolean) {
  return isMine ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 };
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", paddingHorizontal: 12, marginVertical: 2 },
  bubble: { maxWidth: "80%", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, gap: 4 },
  inline: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { fontSize: 11 },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  file: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, padding: 8, minWidth: 220 },
  fileIcon: { width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  image: { width: 230, height: 230, borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.15)" },
  imageOverlay: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.3)" },
  systemRow: { marginHorizontal: 12, marginVertical: 3, maxWidth: "80%" },
  systemPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
});
