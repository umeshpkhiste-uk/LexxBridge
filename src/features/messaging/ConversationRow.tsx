import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, withAdvPrefix } from "@/features/network/NetworkCards";
import { PinIcon } from "@/shared/ui/PinIcon";
import { useTheme } from "@/shared/ui/theme";
import { ConversationSummary } from "./api";
import { listTime, messagePreview } from "./chatFormat";

/** WhatsApp-style chat-list row: avatar with online dot, name, last message,
 * time, and a green unread badge. Press and hold for half a second to
 * select it — the row gets a brand-coloured border and Pin / Delete appear on the name line,
 * in place of the call and message buttons. */
export function ConversationRow({
  conversation,
  myId,
  onPress,
  onLongPress,
  selected = false,
  onPin,
  onDelete,
}: {
  conversation: ConversationSummary;
  myId: string | null;
  onPress: () => void;
  /** Press-and-hold for half a second (touch or mouse) — selects the row. */
  onLongPress?: () => void;
  selected?: boolean;
  onPin?: () => void;
  onDelete?: () => void;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const last = conversation.lastMessage;
  const unread = conversation.unreadCount;
  const isMine = !!last && last.sender_id === myId;
  const { phone } = conversation.otherParty;
  const pinned = !!conversation.pinned_at;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: selected ? colors.brand : "transparent",
          borderRadius: radius.md,
          padding: spacing.md,
          opacity: pressed && !selected ? 0.85 : 1,
        },
      ]}
      accessibilityState={{ selected }}
      accessibilityLabel={`Chat with ${conversation.otherParty.full_name}${pinned ? ", pinned" : ""}${unread ? `, ${unread} unread` : ""}`}
    >
      <Avatar name={conversation.otherParty.full_name} photoUrl={conversation.otherParty.profile_photo_url} size={50} userId={conversation.otherParty.id} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.line}>
          <Text style={[typography.bodyStrong, { flex: 1, color: colors.textPrimary }]} numberOfLines={1}>
            {withAdvPrefix(conversation.otherParty.full_name)}
          </Text>
          {selected ? (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <RowIconButton
                icon={<PinIcon size={16} color={colors.brand} off={pinned} cutoutColor={colors.surfaceAlt} />}
                accessibilityLabel={pinned ? "Unpin chat" : "Pin chat"}
                onPress={() => onPin?.()}
              />
              <RowIconButton icon="trash-outline" accessibilityLabel="Delete chat" color={colors.danger} onPress={() => onDelete?.()} />
            </View>
          ) : null}
        </View>
        <View style={styles.line}>
          {isMine && last && !last.is_deleted ? (
            <Ionicons name={last.read_at ? "checkmark-done" : "checkmark"} size={16} color={last.read_at ? "#53BDEB" : colors.textSecondary} />
          ) : null}
          {last?.attachment_kind && !last.is_deleted ? (
            <Ionicons name={last.attachment_kind === "image" ? "camera" : "document-text"} size={14} color={colors.textSecondary} />
          ) : null}
          {last?.is_deleted ? <Ionicons name="ban-outline" size={14} color={colors.textSecondary} /> : null}
          {last?.is_undecryptable ? <Ionicons name="lock-closed-outline" size={12} color={colors.textSecondary} /> : null}
          <Text
            style={[
              typography.caption,
              {
                flex: 1,
                color: unread ? colors.textPrimary : colors.textSecondary,
                fontWeight: unread ? "600" : "400",
                fontStyle: last?.is_deleted || last?.is_undecryptable ? "italic" : "normal",
              },
            ]}
            numberOfLines={1}
          >
            {last?.is_undecryptable ? "Message is encrypted and can not see on this device" : last ? messagePreview(last) : "Tap to start chatting"}
          </Text>
          {unread ? (
            <View style={[styles.badge, { backgroundColor: colors.success }]}>
              <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.line}>
          {pinned ? <PinIcon size={13} color={colors.textSecondary} filled /> : null}
          <Text style={[typography.caption, { fontSize: 12, color: unread ? colors.success : colors.textSecondary, fontWeight: unread ? "700" : "400" }]}>
            {listTime(last?.created_at ?? conversation.last_message_at)}
          </Text>
        </View>
      </View>
      {selected ? null : (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {phone ? (
            <RowIconButton icon="call-outline" accessibilityLabel="Call" onPress={() => Linking.openURL(`tel:${phone}`)} />
          ) : null}
          <RowIconButton icon="chatbubble-ellipses-outline" accessibilityLabel="Message" onPress={onPress} />
        </View>
      )}
    </Pressable>
  );
}

function RowIconButton({
  icon,
  accessibilityLabel,
  onPress,
  color,
}: {
  /** An Ionicons name, or a ready-made icon element (e.g. PinIcon). */
  icon: keyof typeof Ionicons.glyphMap | React.ReactElement;
  accessibilityLabel: string;
  onPress: () => void;
  color?: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        { borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {typeof icon === "string" ? <Ionicons name={icon} size={16} color={color ?? colors.brand} /> : icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1 },
  line: { flexDirection: "row", alignItems: "center", gap: 4 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  iconButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
