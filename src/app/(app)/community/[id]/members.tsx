import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  addCommunityMember,
  Community,
  CommunityMember,
  getCommunity,
  listCommunityMembers,
  MAX_COMMUNITY_MEMBERS,
  removeCommunityMember,
} from "@/features/community/api";
import { ConnectionRow, listMyConnections } from "@/features/network/api";
import { Avatar } from "@/features/network/NetworkCards";
import { confirmAlert } from "@/shared/lib/alert";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { useTheme } from "@/shared/ui/theme";
import { supabase } from "@/shared/lib/supabase";

/** Manage a community's roster — creator only can add or remove; other
 * members see a read-only list. */
export default function CommunityMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing, typography } = useTheme();

  const [community, setCommunity] = useState<Community | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    Promise.all([getCommunity(id), listMyConnections(), supabase.auth.getUser()])
      .then(async ([c, conns, user]) => {
        setCommunity(c);
        setMyId(user.data.user?.id ?? null);
        setConnections(conns.filter((r) => r.status === "accepted"));
        setMembers(await listCommunityMembers(c));
      })
      .catch((err) => console.warn("Community members: failed to load", err))
      .finally(() => setIsLoading(false));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isCreator = community ? community.creator_id === myId : false;
  const memberIds = new Set(members.map((m) => m.id));
  const addable = connections.filter((c) => !memberIds.has(c.otherParty.id));

  const addMember = async (advocateId: string) => {
    if (!community) return;
    setBusyId(advocateId);
    try {
      await addCommunityMember(community.id, advocateId);
      load();
    } catch (err) {
      console.warn("Community members: failed to add", err);
    } finally {
      setBusyId(null);
    }
  };

  const removeMember = (member: CommunityMember) => {
    if (!community) return;
    confirmAlert(`Remove ${member.full_name}?`, "They'll lose access to this community's chat.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusyId(member.id);
          try {
            await removeCommunityMember(community.id, member.id);
            load();
          } catch (err) {
            console.warn("Community members: failed to remove", err);
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ title: "Members" }} />
        <ActivityIndicator color={colors.brand} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <Stack.Screen options={{ title: "Members" }} />

      <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
        {members.length}/{MAX_COMMUNITY_MEMBERS + 1} members
      </Text>

      {members.map((m) => (
        <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm }}>
          <Avatar name={m.full_name} photoUrl={m.profile_photo_url} size={40} />
          <Text style={[typography.body, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
            {m.full_name}
            {m.isCreator ? " · Creator" : ""}
          </Text>
          {isCreator && !m.isCreator ? (
            <Pressable onPress={() => removeMember(m)} disabled={busyId === m.id} hitSlop={10} accessibilityLabel={`Remove ${m.full_name}`}>
              {busyId === m.id ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="close-circle-outline" size={22} color={colors.danger} />}
            </Pressable>
          ) : null}
        </View>
      ))}

      {isCreator && members.length < MAX_COMMUNITY_MEMBERS + 1 && addable.length > 0 ? (
        <>
          <Text style={[typography.label, { color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
            Add from your connections
          </Text>
          {addable.map((c) => (
            <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm }}>
              <Avatar name={c.otherParty.full_name} photoUrl={c.otherParty.profile_photo_url} size={40} />
              <Text style={[typography.body, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                {c.otherParty.full_name}
              </Text>
              <Pressable
                onPress={() => addMember(c.otherParty.id)}
                disabled={busyId === c.otherParty.id}
                hitSlop={10}
                accessibilityLabel={`Add ${c.otherParty.full_name}`}
              >
                {busyId === c.otherParty.id ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
                )}
              </Pressable>
            </View>
          ))}
        </>
      ) : null}
    </ScreenContainer>
  );
}
