import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Community,
  CommunityMember,
  CommunityMessage,
  getCommunity,
  listCommunityMembers,
  listCommunityMessages,
  sendCommunityMessage,
  subscribeToCommunityMessages,
} from "@/features/community/api";
import { supabase } from "@/shared/lib/supabase";
import { useTheme } from "@/shared/ui/theme";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** Group chat for one community — fan-out E2E encrypted (see
 * features/community/api.ts), simple text-only, no replies/attachments. */
export default function CommunityChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing, radius, typography } = useTheme();

  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  const load = useCallback(() => {
    getCommunity(id)
      .then(async (c) => {
        setCommunity(c);
        const [memberList, messageList] = await Promise.all([listCommunityMembers(c), listCommunityMessages(c.id)]);
        setMembers(memberList);
        setMessages(messageList);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this community"));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!id) return;
    return subscribeToCommunityMessages(id, (message) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    });
  }, [id]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const isCreator = community ? community.creator_id === myId : false;

  const send = async () => {
    if (!community || !draft.trim()) return;
    const text = draft;
    setDraft("");
    setIsSending(true);
    try {
      const sent = await sendCommunityMessage(community, text);
      setMessages((prev) => [...prev, sent]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that message");
      setDraft(text);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: community?.name ?? "Community",
          headerRight: isCreator
            ? () => (
                <Pressable onPress={() => router.push(`/(app)/community/${id}/members`)} hitSlop={10} accessibilityLabel="Manage members">
                  <Ionicons name="people-outline" size={22} color={colors.brand} />
                </Pressable>
              )
            : undefined,
        }}
      />

      {error ? (
        <Text style={{ color: colors.danger, padding: spacing.md }}>{error}</Text>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const isMine = item.sender_id === myId;
          const sender = memberById.get(item.sender_id);
          return (
            <View style={{ alignItems: isMine ? "flex-end" : "flex-start" }}>
              <View
                style={{
                  maxWidth: "80%",
                  backgroundColor: isMine ? colors.brand : colors.surfaceAlt,
                  borderRadius: radius.lg,
                  padding: spacing.sm,
                }}
              >
                {!isMine ? (
                  <Text style={[typography.label, { color: colors.accent, marginBottom: 2 }]}>{sender?.full_name ?? "Advocate"}</Text>
                ) : null}
                <Text style={[typography.body, { color: isMine ? colors.textInverse : colors.textPrimary, fontStyle: item.is_undecryptable ? "italic" : "normal" }]}>
                  {item.content}
                </Text>
                <Text style={[typography.caption, { color: isMine ? colors.textInverse : colors.textSecondary, marginTop: 2, opacity: 0.8 }]}>
                  {timeLabel(item.created_at)}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl }]}>
            No messages yet — say hello to the group.
          </Text>
        }
      />

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message the community…"
          placeholderTextColor={colors.textSecondary}
          multiline
          style={[typography.body, { flex: 1, color: colors.textPrimary, maxHeight: 100, paddingVertical: spacing.sm }]}
        />
        <Pressable
          onPress={send}
          disabled={isSending || !draft.trim()}
          accessibilityLabel="Send"
          style={{ opacity: isSending || !draft.trim() ? 0.4 : 1 }}
        >
          {isSending ? <ActivityIndicator size="small" color={colors.brand} /> : <Ionicons name="send" size={22} color={colors.brand} />}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
