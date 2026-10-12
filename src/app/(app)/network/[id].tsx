import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { blockAdvocate, isBlocked, unblockAdvocate } from "@/features/blocking/api";
import { getOrCreateConversation } from "@/features/messaging/api";
import {
  ConnectionState,
  followAdvocate,
  getConnectionState,
  getMutualConnectionCounts,
  getNetworkStats,
  getPublicProfile,
  isFollowing,
  NetworkStats,
  PublicProfile,
  removeConnection,
  respondToConnection,
  sendConnectionRequest,
  unfollowAdvocate,
} from "@/features/network/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { AdvocateIdentity, ConnectButton, mutualLabel } from "@/features/network/NetworkCards";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { useTheme } from "@/shared/ui/theme";

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing, radius, typography } = useTheme();
  const { session } = useAuth();
  const isMe = !!session && session.user.id === id;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [following, setFollowing] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>({ status: "none" });
  const [blocked, setBlocked] = useState(false);
  const [mutualCount, setMutualCount] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  // `isActing`-driven pointerEvents only takes effect after a re-render, so
  // a fast double-tap can fire an onPress twice before that commits (seen
  // in practice: two overlapping handleMessage() calls each navigating to
  // the chat screen crashed Fabric with "addViewAt ... already has a
  // parent"). This ref blocks the second call synchronously, same frame.
  const isActingRef = useRef(false);

  // Your own name opens your own profile docket instead.
  useEffect(() => {
    if (isMe) router.replace("/(app)/basic-info");
  }, [isMe]);

  const load = useCallback(() => {
    if (isMe) return;
    setIsLoading(true);
    getMutualConnectionCounts([id])
      .then((counts) => setMutualCount(counts[id] ?? 0))
      .catch(() => {});
    Promise.all([getPublicProfile(id), getNetworkStats(id), isFollowing(id), getConnectionState(id), isBlocked(id)])
      .then(([profileData, statsData, followingData, connectionData, blockedData]) => {
        setProfile(profileData);
        setStats(statsData);
        setFollowing(followingData);
        setConnection(connectionData);
        setBlocked(blockedData);
      })
      // Hidden, private or deleted profiles come back empty — show the
      // "not available" state rather than an unhandled error.
      .catch(() => setProfile(null))
      .finally(() => setIsLoading(false));
  }, [id, isMe]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleToggleFollow = async () => {
    if (isActingRef.current) return;
    isActingRef.current = true;
    setIsActing(true);
    try {
      if (following) await unfollowAdvocate(id);
      else await followAdvocate(id);
      setFollowing(!following);
      getNetworkStats(id).then(setStats).catch(() => {});
    } finally {
      isActingRef.current = false;
      setIsActing(false);
    }
  };

  const handleConnect = async () => {
    if (isActingRef.current) return;
    isActingRef.current = true;
    setIsActing(true);
    try {
      await sendConnectionRequest(id);
      load();
    } finally {
      isActingRef.current = false;
      setIsActing(false);
    }
  };

  const handleAccept = async () => {
    if (connection.status !== "pending_received" || isActingRef.current) return;
    isActingRef.current = true;
    setIsActing(true);
    try {
      await respondToConnection(connection.connectionId, true);
      load();
    } finally {
      isActingRef.current = false;
      setIsActing(false);
    }
  };

  const handleRemoveOrCancel = async () => {
    if (connection.status === "none" || connection.status === "rejected" || isActingRef.current) return;
    isActingRef.current = true;
    setIsActing(true);
    try {
      await removeConnection(connection.connectionId);
      load();
    } finally {
      isActingRef.current = false;
      setIsActing(false);
    }
  };

  const handleMessage = async () => {
    if (isActingRef.current) return;
    isActingRef.current = true;
    setIsActing(true);
    try {
      const conversationId = await getOrCreateConversation(id);
      router.push(`/(app)/messages/${conversationId}`);
    } catch (err) {
      Alert.alert("Couldn't start conversation", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      isActingRef.current = false;
      setIsActing(false);
    }
  };

  const handleToggleBlock = () => {
    Alert.alert(
      blocked ? "Unblock this advocate" : "Block this advocate",
      blocked ? "They'll be able to follow, connect, and message you again." : "They won't be able to follow, connect, or message you.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: blocked ? "Unblock" : "Block",
          style: blocked ? "default" : "destructive",
          onPress: async () => {
            if (isActingRef.current) return;
            isActingRef.current = true;
            setIsActing(true);
            try {
              if (blocked) await unblockAdvocate(id);
              else await blockAdvocate(id);
              load();
            } finally {
              isActingRef.current = false;
              setIsActing(false);
            }
          },
        },
      ]
    );
  };

  const handleReport = () => {
    router.push(`/(app)/reports/new?targetType=advocate&targetId=${id}&label=advocate`);
  };

  if (isLoading) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brand} />
      </ScreenContainer>
    );
  }

  if (!profile) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="lock-closed-outline" size={32} color={colors.textSecondary} />
        <Text style={[typography.subtitle, { color: colors.textPrimary, marginTop: spacing.sm }]}>Profile not available</Text>
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs }]}>
          This advocate&apos;s profile is private or no longer on LexxBridge.
        </Text>
      </ScreenContainer>
    );
  }

  const connectStatus = connection.status === "accepted" ? "accepted" : connection.status === "pending_sent" ? "pending" : "none";
  const primaryAction =
    connection.status === "pending_received"
      ? { label: "Accept connection request", onPress: handleAccept, status: "none" as const }
      : connection.status === "none" || connection.status === "rejected"
        ? { label: undefined, onPress: handleConnect, status: "none" as const }
        : connection.status === "pending_sent"
          ? { label: "Requested · tap to cancel", onPress: handleRemoveOrCancel, status: "pending" as const }
          : { label: "Connected", onPress: handleRemoveOrCancel, status: "accepted" as const };

  const confirmRemove = () =>
    Alert.alert("Remove connection", `Remove ${profile.full_name} from your connections?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: handleRemoveOrCancel },
    ]);
  const mutual = mutualLabel(mutualCount);

  return (
    <ScreenContainer scroll>
      {/* Identity card — same design as the Discover colleague card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg }]}>
        <AdvocateIdentity profile={profile} large />
        {profile.headline && profile.headline !== profile.practice_areas[0] ? (
          <Text style={[typography.body, { color: colors.textPrimary, textAlign: "center", marginTop: spacing.sm }]}>
            {profile.headline}
          </Text>
        ) : null}
        {profile.state && profile.state !== profile.city ? (
          <Text style={[typography.caption, { color: colors.textSecondary, textAlign: "center" }]}>
            {[profile.city, profile.state].filter(Boolean).join(", ")}
          </Text>
        ) : null}

        {stats ? (
          <View style={[styles.stats, { borderColor: colors.border, marginTop: spacing.lg, paddingVertical: spacing.md }]}>
            <StatBlock label="Followers" value={stats.followers_count} colors={colors} typography={typography} />
            <StatBlock label="Following" value={stats.following_count} colors={colors} typography={typography} />
            <StatBlock label="Connections" value={stats.connections_count} colors={colors} typography={typography} />
          </View>
        ) : null}

        {mutual ? (
          <Text style={[typography.label, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.md }]}>{mutual}</Text>
        ) : null}

        <View style={{ marginTop: spacing.sm, opacity: isActing ? 0.6 : 1 }} pointerEvents={isActing ? "none" : "auto"}>
          <ConnectButton
            status={primaryAction.status}
            label={primaryAction.label}
            onPress={connection.status === "accepted" ? confirmRemove : primaryAction.onPress}
          />
          <View style={[styles.secondaryRow, { gap: spacing.sm, marginTop: spacing.sm }]}>
            <SecondaryButton
              icon={following ? "checkmark" : "add"}
              label={following ? "Following" : "Follow"}
              onPress={handleToggleFollow}
            />
            {connectStatus === "accepted" ? (
              <SecondaryButton icon="chatbubble-ellipses-outline" label="Message" onPress={handleMessage} />
            ) : null}
          </View>
        </View>
      </View>

      {profile.about ? (
        <Section title="About">
          <Text style={[typography.body, { color: colors.textPrimary, lineHeight: 22 }]}>{profile.about}</Text>
        </Section>
      ) : null}
      {profile.practice_areas.length > 0 ? (
        <Section title="Practice areas">
          <Tags items={profile.practice_areas} />
        </Section>
      ) : null}
      {profile.courts.length > 0 ? (
        <Section title="Courts">
          <Tags items={profile.courts} />
        </Section>
      ) : null}
      {profile.languages.length > 0 ? (
        <Section title="Languages">
          <Tags items={profile.languages} />
        </Section>
      ) : null}
      {profile.website ? (
        <Section title="Website">
          <Text
            style={[typography.body, { color: colors.brand }]}
            onPress={() => Linking.openURL(/^https?:\/\//.test(profile.website!) ? profile.website! : `https://${profile.website}`)}
          >
            {profile.website}
          </Text>
        </Section>
      ) : null}

      <View style={{ flexDirection: "row", justifyContent: "center", gap: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.lg }}>
        <Text style={[typography.caption, { color: colors.textSecondary }]} onPress={handleReport}>
          Report
        </Text>
        <Text style={[typography.caption, { color: colors.danger }]} onPress={handleToggleBlock}>
          {blocked ? "Unblock" : "Block"}
        </Text>
      </View>
    </ScreenContainer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md }]}>
      <Text style={[typography.label, { color: colors.textSecondary, textTransform: "uppercase", marginBottom: spacing.sm }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Tags({ items }: { items: string[] }) {
  const { colors, radius, typography } = useTheme();
  return (
    <View style={styles.tags}>
      {items.map((t, i) => (
        <View key={`${t}-${i}`} style={[styles.tag, { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm }]}>
          <Text style={[typography.label, { color: colors.brand }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function SecondaryButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors, radius, typography } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        { borderRadius: radius.sm, borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.brand} />
      <Text style={[typography.bodyStrong, { color: colors.brand }]}>{label}</Text>
    </Pressable>
  );
}

function StatBlock({
  label,
  value,
  colors,
  typography,
}: {
  label: string;
  value: number;
  colors: ReturnType<typeof useTheme>["colors"];
  typography: ReturnType<typeof useTheme>["typography"];
}) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={[typography.subtitle, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  stats: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  secondaryRow: { flexDirection: "row" },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderWidth: 1,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 5 },
});
