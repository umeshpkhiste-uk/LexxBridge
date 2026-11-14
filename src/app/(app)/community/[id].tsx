import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Community,
  CommunityMember,
  CommunityMessage,
  deleteCommunityMessage,
  editCommunityMessage,
  getCommunity,
  listCommunityMembers,
  listCommunityMessages,
  sendCommunityMessage,
  subscribeToCommunityMessages,
} from "@/features/community/api";
import { confirmAlert } from "@/shared/lib/alert";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { supabase } from "@/shared/lib/supabase";
import { ActionSheet, SheetAction } from "@/shared/ui/ActionSheet";
import { ErrorNotice } from "@/shared/ui/ErrorNotice";
import { useTheme } from "@/shared/ui/theme";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function preview(message: CommunityMessage): string {
  if (message.is_deleted) return "This message was deleted";
  return message.content;
}

/** Group chat for one community — fan-out E2E encrypted (see
 * features/community/api.ts). Reply / edit / delete mirror the direct
 * message chat's long-press menu. */
export default function CommunityChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<CommunityMessage | null>(null);
  const [editing, setEditing] = useState<CommunityMessage | null>(null);
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  // isSending-driven disabling only takes effect after a re-render, so a
  // fast double-tap on Send can fire send() twice first — this ref blocks
  // the second call synchronously, same frame.
  const isSendingRef = useRef(false);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInputInstance>(null);

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
      .catch((err) => setError(friendlyErrorMessage(err)));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!id) return;
    return subscribeToCommunityMessages(id, (message) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev.map((m) => (m.id === message.id ? message : m)) : [...prev, message]));
    });
  }, [id]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const isCreator = community ? community.creator_id === myId : false;

  const senderName = (senderId: string) => (senderId === myId ? "You" : (memberById.get(senderId)?.full_name ?? "Advocate"));

  const cancelContext = () => {
    setReplyTo(null);
    setEditing(null);
    setDraft("");
  };

  const send = async () => {
    if (!community || !draft.trim() || isSendingRef.current) return;
    isSendingRef.current = true;
    const text = draft;
    const wasEditing = editing;
    setIsSending(true);
    try {
      if (wasEditing) {
        const updated = await editCommunityMessage(community, wasEditing, text);
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      } else {
        const sent = await sendCommunityMessage(community, text, replyTo?.id ?? null);
        setMessages((prev) => [...prev, sent]);
      }
      cancelContext();
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  };

  const scrollToMessage = (messageId: string) => {
    const index = messages.findIndex((m) => m.id === messageId);
    if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  };

  const messageActions = (message: CommunityMessage): SheetAction[] => {
    if (message.is_deleted || message.is_undecryptable) return [];
    const isMine = message.sender_id === myId;
    const actions: SheetAction[] = [
      {
        label: "Reply",
        icon: "arrow-undo-outline",
        onPress: () => {
          setEditing(null);
          setReplyTo(message);
          inputRef.current?.focus();
        },
      },
      { label: "Copy", icon: "copy-outline", onPress: () => Clipboard.setStringAsync(message.content) },
    ];
    if (isMine) {
      actions.push({
        label: "Edit",
        icon: "create-outline",
        onPress: () => {
          setReplyTo(null);
          setEditing(message);
          setDraft(message.content);
          inputRef.current?.focus();
        },
      });
      actions.push({
        label: "Delete for everyone",
        icon: "trash-outline",
        destructive: true,
        onPress: () =>
          confirmAlert("Delete message?", "This removes it for everyone in the community.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                const previous = messages;
                setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, is_deleted: true, content: "" } : m)));
                try {
                  await deleteCommunityMessage(message);
                } catch (err) {
                  setMessages(previous);
                  setError(friendlyErrorMessage(err));
                }
              },
            },
          ]),
      });
    }
    return actions;
  };

  const canSend = !!draft.trim();

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={headerHeight}>
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

      {error ? <ErrorNotice message={error} /> : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: messages.length ? undefined : 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        onScrollToIndexFailed={() => {}}
        renderItem={({ item }) => {
          const isMine = item.sender_id === myId;
          const quoted = item.reply_to_id ? (byId.get(item.reply_to_id) ?? null) : null;

          if (item.is_deleted) {
            return (
              <View style={{ alignItems: isMine ? "flex-end" : "flex-start" }}>
                <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg }]}>
                  <Text style={[typography.body, { color: colors.textSecondary, fontStyle: "italic" }]}>This message was deleted</Text>
                </View>
              </View>
            );
          }

          return (
            <View style={{ alignItems: isMine ? "flex-end" : "flex-start" }}>
              <Pressable
                onLongPress={() => setMenu({ title: preview(item).slice(0, 60), actions: messageActions(item) })}
                delayLongPress={500}
                disabled={item.is_undecryptable}
                style={[styles.bubble, { maxWidth: "80%", backgroundColor: isMine ? colors.brand : colors.surfaceAlt, borderRadius: radius.lg }]}
              >
                {!isMine ? <Text style={[typography.label, { color: colors.accent, marginBottom: 2 }]}>{senderName(item.sender_id)}</Text> : null}

                {quoted ? (
                  <Pressable
                    onPress={() => scrollToMessage(quoted.id)}
                    style={[styles.quote, { backgroundColor: isMine ? "rgba(255,255,255,0.14)" : colors.surface, borderLeftColor: colors.accent }]}
                  >
                    <Text style={[typography.caption, { color: isMine ? "#FFDEA5" : colors.accent, fontWeight: "700" }]}>{senderName(quoted.sender_id)}</Text>
                    <Text style={[typography.caption, { color: isMine ? colors.textInverse : colors.textSecondary }]} numberOfLines={2}>
                      {preview(quoted)}
                    </Text>
                  </Pressable>
                ) : null}

                <Text
                  style={[
                    typography.body,
                    { color: isMine ? colors.textInverse : colors.textPrimary, fontStyle: item.is_undecryptable ? "italic" : "normal" },
                  ]}
                >
                  {item.content}
                </Text>
                <View style={[styles.inline, { alignSelf: "flex-end" }]}>
                  {item.edited_at ? (
                    <Text style={[typography.caption, { color: isMine ? colors.textInverse : colors.textSecondary, opacity: 0.8 }]}>edited</Text>
                  ) : null}
                  <Text style={[typography.caption, { color: isMine ? colors.textInverse : colors.textSecondary, opacity: 0.8 }]}>
                    {timeLabel(item.created_at)}
                  </Text>
                </View>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl }]}>
            No messages yet — say hello to the group.
          </Text>
        }
      />

      {replyTo || editing ? (
        <View style={[styles.context, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={[styles.contextRail, { backgroundColor: editing ? colors.brand : colors.accent }]} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: editing ? colors.brand : colors.accent, fontWeight: "700" }]}>
              {editing ? "Edit message" : `Replying to ${senderName(replyTo!.sender_id)}`}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
              {preview(editing ?? replyTo!)}
            </Text>
          </View>
          <Pressable onPress={cancelContext} hitSlop={10} accessibilityLabel="Cancel">
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm), backgroundColor: colors.background }]}>
        <View style={[styles.inputPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message the community…"
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={2000}
            style={[typography.body, styles.input, { color: colors.textPrimary }]}
          />
        </View>
        <Pressable
          onPress={send}
          disabled={isSending || !canSend}
          accessibilityLabel={editing ? "Save edit" : "Send"}
          style={[styles.send, { backgroundColor: canSend ? colors.brand : colors.surfaceAlt }]}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={canSend ? colors.textInverse : colors.textSecondary} />
          ) : (
            <Ionicons name={editing ? "checkmark" : "send"} size={20} color={canSend ? colors.textInverse : colors.textSecondary} />
          )}
        </Pressable>
      </View>

      <ActionSheet visible={!!menu} title={menu?.title} actions={menu?.actions ?? []} onClose={() => setMenu(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: { paddingHorizontal: 10, paddingVertical: 6, gap: 4 },
  inline: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  context: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  contextRail: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 8, paddingTop: 6 },
  inputPill: { flex: 1, flexDirection: "row", alignItems: "flex-end", borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6, minHeight: 46 },
  input: { flex: 1, maxHeight: 120, paddingHorizontal: 6, paddingTop: 12, paddingBottom: 12 },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
});
