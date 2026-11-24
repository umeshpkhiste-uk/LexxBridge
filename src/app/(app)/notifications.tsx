import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationRow,
} from "@/features/notifications/api";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { LoadState } from "@/shared/ui/LoadState";
import { useTheme } from "@/shared/ui/theme";

const ICON_BY_TYPE: Record<string, keyof typeof Ionicons.glyphMap> = {
  new_message: "chatbubble-outline",
  connection_request: "person-add-outline",
  connection_accepted: "checkmark-circle-outline",
  new_follower: "person-outline",
  post_liked: "heart-outline",
  post_commented: "chatbox-outline",
  // Personal data breach notice (DPDP Act §8(6)) — sent from the SQL editor
  // per docs/BREACH_RESPONSE.md.
  security_notice: "shield-outline",
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function handleNotificationPress(notification: NotificationRow) {
  const data = notification.data as { conversation_id?: string; post_id?: string; actor_id?: string };
  if (data.conversation_id) router.push(`/(app)/messages/${data.conversation_id}`);
  else if (data.post_id) router.push(`/(app)/posts/${data.post_id}`);
  else if (data.actor_id) router.push(`/(app)/network/${data.actor_id}`);
  // A breach notice leads to where the user can raise a question about it.
  else if (notification.type === "security_notice") router.push("/(app)/privacy-grievance");
}

export default function NotificationsScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);

  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    listNotifications()
      .then(setNotifications)
      .catch((err) => setError(friendlyErrorMessage(err)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      markAllNotificationsRead().catch(() => {});
    }, [load])
  );

  const handlePress = (notification: NotificationRow) => {
    if (!notification.is_read) markNotificationRead(notification.id).catch(() => {});
    handleNotificationPress(notification);
  };

  if (notifications === null) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <LoadState error={error} onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <FlatList
      data={notifications}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: spacing.lg }}
      ListEmptyComponent={
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl }]}>
          No notifications yet.
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => handlePress(item)}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            backgroundColor: item.is_read ? colors.background : colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.md,
            padding: spacing.md,
            marginBottom: spacing.sm,
          }}
        >
          <Ionicons
            name={ICON_BY_TYPE[item.type] ?? "notifications-outline"}
            size={20}
            color={colors.textSecondary}
            style={{ marginRight: spacing.md, marginTop: 2 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{item.title}</Text>
            {item.body ? (
              <Text style={[typography.body, { color: colors.textSecondary }]}>{item.body}</Text>
            ) : null}
            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
              {timeAgo(item.created_at)}
            </Text>
          </View>
        </Pressable>
      )}
    />
  );
}
