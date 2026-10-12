import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, withAdvPrefix } from "@/features/network/NetworkCards";
import { useTheme } from "@/shared/ui/theme";
import { ConversationSummary } from "./api";
import { listTime, messagePreview } from "./chatFormat";

/** WhatsApp-style chat-list row: avatar with online dot, name, last message,
 * time, and a green unread badge. */
export function ConversationRow({ conversation, myId, onPress }: { conversation: ConversationSummary; myId: string | null; onPress: () => void }) {
  const { colors, spacing, radius, typography } = useTheme();
  const last = conversation.lastMessage;
  const unread = conversation.unreadCount;
  const isMine = !!last && last.sender_id === myId;
  const { phone } = conversation.otherParty;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, opacity: pressed ? 0.85 : 1 }]}
      accessibilityLabel={`Chat with ${conversation.otherParty.full_name}${unread ? `, ${unread} unread` : ""}`}
    >
      <Avatar name={conversation.otherParty.full_name} photoUrl={conversation.otherParty.profile_photo_url} size={50} userId={conversation.otherParty.id} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
          {withAdvPrefix(conversation.otherParty.full_name)}
        </Text>
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
            {last?.is_undecryptable ? "Message unavailable on this device" : last ? messagePreview(last) : "Tap to start chatting"}
          </Text>
          {unread ? (
            <View style={[styles.badge, { backgroundColor: colors.success }]}>
              <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[typography.caption, { fontSize: 12, color: unread ? colors.success : colors.textSecondary, fontWeight: unread ? "700" : "400" }]}>
          {listTime(last?.created_at ?? conversation.last_message_at)}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {phone ? (
          <RowIconButton icon="call-outline" accessibilityLabel="Call" onPress={() => Linking.openURL(`tel:${phone}`)} />
        ) : null}
        <RowIconButton icon="chatbubble-ellipses-outline" accessibilityLabel="Message" onPress={onPress} />
      </View>
    </Pressable>
  );
}

function RowIconButton({
  icon,
  accessibilityLabel,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
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
      <Ionicons name={icon} size={16} color={colors.brand} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  line: { flexDirection: "row", alignItems: "center", gap: 4 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  iconButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
