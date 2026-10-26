import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SmallButton } from "@/features/network/SmallButton";
import { Badge } from "@/shared/ui/Badge";
import { useTheme } from "@/shared/ui/theme";
import { CommunitySummary, listMyCommunities } from "./api";

/** "Community" segment of the Network tab: the advocate's own community (if
 * they created one) plus any others they've been added to as a member. */
export function CommunityTab() {
  const { colors, spacing, radius, typography } = useTheme();
  const [summaries, setSummaries] = useState<CommunitySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    listMyCommunities()
      .then(setSummaries)
      .catch((err) => console.warn("Community: failed to load", err))
      .finally(() => setIsLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const ownsOne = summaries.some((s) => s.isCreator);

  if (isLoading) return <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />;

  return (
    <View style={{ gap: spacing.md }}>
      {summaries.length === 0 ? (
        <View style={{ alignItems: "center", gap: spacing.sm, marginTop: spacing.xl, paddingHorizontal: spacing.lg }}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="people-circle-outline" size={32} color={colors.brand} />
          </View>
          <Text style={[typography.subtitle, { color: colors.textPrimary }]}>No community yet</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center" }]}>
            {"Create a private group with advocates you're already connected with — up to 50 members."}
          </Text>
          <SmallButton icon="add-circle-outline" label="Create a community" filled onPress={() => router.push("/(app)/community/new")} />
        </View>
      ) : (
        <>
          {summaries.map(({ community, isCreator, memberCount }) => (
            <Pressable
              key={community.id}
              onPress={() => router.push(`/(app)/community/${community.id}`)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill }]}>
                <Ionicons name="people" size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[typography.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                  {community.name}
                </Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  {memberCount} member{memberCount === 1 ? "" : "s"}
                </Text>
              </View>
              <Badge label={isCreator ? "Creator" : "Member"} tone={isCreator ? "brand" : "neutral"} />
            </Pressable>
          ))}

          {!ownsOne ? (
            <View style={{ alignItems: "center", marginTop: spacing.sm }}>
              <SmallButton icon="add-circle-outline" label="Create a community" filled onPress={() => router.push("/(app)/community/new")} />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
});
