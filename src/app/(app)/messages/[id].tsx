import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/AuthProvider";
import { blockAdvocate } from "@/features/blocking/api";
import {
  Attachment,
  ChatPartner,
  deleteMessage,
  editMessage,
  getAttachmentUrl,
  getChatPartner,
  listMessages,
  markConversationRead,
  Message,
  subscribeToConversation,
} from "@/features/messaging/api";
import { ChatBubble, ChatMessage } from "@/features/messaging/ChatBubble";
import { setActiveConversation } from "@/features/notifications/activeChat";
import { buildChatItems, messagePreview } from "@/features/messaging/chatFormat";
import { discardMessage, queueMessage, retryMessage, subscribeDelivered, subscribePending } from "@/features/messaging/pendingMessages";
import { alertMessage } from "@/shared/lib/alert";
import { Avatar, withAdvPrefix } from "@/features/network/NetworkCards";
import { useIsOnline } from "@/features/presence/PresenceProvider";
import { ActionSheet, SheetAction } from "@/shared/ui/ActionSheet";
import { useTheme } from "@/shared/ui/theme";

const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Like WhatsApp, a sent message can only be edited for a short while. */
function isWithinEditWindow(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;
}

/** WhatsApp-style 1-to-1 chat with a connected advocate. */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { session } = useAuth();
  const myId = session?.user.id ?? null;

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [partner, setPartner] = useState<ChatPartner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);

  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const channelRef = useRef<ReturnType<typeof subscribeToConversation> | null>(null);
  const typingSentAt = useRef(0);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPartnerOnline = useIsOnline(partner?.id ?? null);

  const upsert = useCallback((incoming: ChatMessage) => {
    setMessages((prev) => {
      if (!prev) return prev;
      const index = prev.findIndex((m) => m.id === incoming.id);
      if (index === -1) return [...prev, incoming].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const next = [...prev];
      next[index] = { ...next[index], ...incoming };
      return next;
    });
  }, []);

  // While this chat is open, its messages don't pop up as banners.
  useEffect(() => {
    setActiveConversation(id);
    return () => setActiveConversation(null);
  }, [id]);

  // Initial load + live updates (new messages, edits, deletes, read ticks, typing).
  useEffect(() => {
    let active = true;
    Promise.all([listMessages(id), getChatPartner(id)])
      .then(([rows, other]) => {
        if (!active) return;
        setMessages(rows);
        setPartner(other);
        markConversationRead(id).catch(() => {});
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "Couldn't open this chat"));

    const channel = subscribeToConversation(id, {
      onUpsert: (message: Message) => {
        upsert(message);
        if (message.sender_id !== myId && !message.read_at) markConversationRead(id).catch(() => {});
        if (message.sender_id !== myId) setPartnerTyping(false);
      },
      onTyping: (userId, isTyping) => {
        if (userId === myId) return;
        setPartnerTyping(isTyping);
        if (partnerTypingTimer.current) clearTimeout(partnerTypingTimer.current);
        // Drop "typing…" if the stop signal never arrives.
        if (isTyping) partnerTypingTimer.current = setTimeout(() => setPartnerTyping(false), 5000);
      },
    });
    channelRef.current = channel;

    return () => {
      active = false;
      channel.unsubscribe();
      channelRef.current = null;
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      if (partnerTypingTimer.current) clearTimeout(partnerTypingTimer.current);
    };
  }, [id, myId, upsert]);

  // The outbox (queued/failed/offline messages) lives outside this screen so
  // it survives navigating away and back, and keeps retrying in the
  // background as connectivity comes and goes.
  useEffect(() => {
    const unsubPending = subscribePending(id, setPending);
    const unsubDelivered = subscribeDelivered(id, upsert);
    return () => {
      unsubPending();
      unsubDelivered();
    };
  }, [id, upsert]);

  const allMessages = useMemo(() => [...(messages ?? []), ...pending], [messages, pending]);
  const byId = useMemo(() => new Map(allMessages.map((m) => [m.id, m])), [allMessages]);
  const items = useMemo(() => buildChatItems(allMessages), [allMessages]);

  const signalTyping = (text: string) => {
    if (!myId || !channelRef.current) return;
    const now = Date.now();
    if (text && now - typingSentAt.current > 2000) {
      typingSentAt.current = now;
      channelRef.current.sendTyping(myId, true);
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      typingSentAt.current = 0;
      channelRef.current?.sendTyping(myId, false);
    }, text ? 3000 : 0);
  };

  const onChangeDraft = (text: string) => {
    setDraft(text);
    if (!editing) signalTyping(text);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (editing) {
      if (!text) return;
      const target = editing;
      setEditing(null);
      setDraft("");
      upsert({ ...target, content: text, edited_at: new Date().toISOString() });
      editMessage(id, target.id, text).catch((err) => {
        upsert(target);
        alertMessage("Couldn't edit message", err instanceof Error ? err.message : "Something went wrong");
      });
      return;
    }
    if (!text && !attachment) return;
    if (!myId) return;

    const file = attachment;
    const temp: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: id,
      sender_id: myId,
      content: text,
      is_undecryptable: false,
      is_deleted: false,
      read_at: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      reply_to_id: replyTo?.id ?? null,
      attachment_path: null,
      attachment_kind: file?.kind ?? null,
      attachment_name: file?.name ?? null,
      attachment_size: file?.size ?? null,
      attachment_mime: file?.mimeType ?? null,
      localStatus: "sending",
      localUri: file?.kind === "image" ? file.uri : undefined,
    };
    setDraft("");
    setReplyTo(null);
    setAttachment(null);
    signalTyping("");
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    queueMessage(id, temp, file).catch((err) => {
      alertMessage("Couldn't send message", err instanceof Error ? err.message : "Something went wrong");
    });
  };

  /** Web only — a hardware keyboard makes Enter a natural "send" shortcut,
   * the way every web chat app treats it (Shift+Enter still inserts a
   * newline). Native keeps Enter as a newline: there's no keyboard-driven
   * send convention on a phone, and the on-screen return key already does
   * what users expect for a multiline message box. */
  const onComposerKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (Platform.OS !== "web") return;
    const nativeEvent = event.nativeEvent as unknown as { key: string; shiftKey?: boolean };
    if (nativeEvent.key !== "Enter" || nativeEvent.shiftKey) return;
    event.preventDefault();
    if (canSend) handleSend();
  };

  const retry = (message: ChatMessage) => {
    retryMessage(id, message.id)?.catch((err) => {
      alertMessage("Couldn't send message", err instanceof Error ? err.message : "Something went wrong");
    });
  };

  const pickImage = async (source: "library" | "camera") => {
    const permission =
      source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alertMessage("Permission needed", `Allow ${source === "camera" ? "camera" : "photo"} access in Settings to share photos.`);
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7 };
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setAttachment({
      uri: asset.uri,
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg",
      size: asset.fileSize,
      kind: "image",
    });
    inputRef.current?.focus();
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    const file = result.canceled ? null : result.assets?.[0];
    if (!file) return;
    if (file.size && file.size > 25 * 1024 * 1024) {
      alertMessage("File too large", "You can share files up to 25 MB.");
      return;
    }
    setAttachment({
      uri: file.uri,
      name: file.name,
      mimeType: file.mimeType ?? "application/octet-stream",
      size: file.size ?? undefined,
      kind: file.mimeType?.startsWith("image/") ? "image" : "file",
    });
  };

  const openFile = async (message: ChatMessage) => {
    if (!message.attachment_path) return;
    try {
      await Linking.openURL(await getAttachmentUrl(message.attachment_path));
    } catch (err) {
      alertMessage("Couldn't open file", err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const confirmDelete = (message: ChatMessage) =>
    Alert.alert("Delete message?", "It will be deleted for everyone in this chat.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete for everyone",
        style: "destructive",
        onPress: async () => {
          upsert({ ...message, is_deleted: true, content: "[deleted]", attachment_path: null, attachment_kind: null });
          try {
            await deleteMessage(message);
          } catch (err) {
            upsert(message);
            alertMessage("Couldn't delete message", err instanceof Error ? err.message : "Something went wrong");
          }
        },
      },
    ]);

  const explainUndecryptable = (message: ChatMessage) =>
    alertMessage(
      "Message unavailable",
      `${message.content} This can happen after reinstalling the app or signing in on a new device — messaging keys are generated on-device for end-to-end encryption and never leave it, so a message encrypted before that change can't be recovered. You can keep chatting as normal — new messages aren't affected.`
    );

  const scrollToMessage = (messageId: string) => {
    const index = items.findIndex((i) => i.type === "message" && i.message.id === messageId);
    if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  };

  const messageActions = (message: ChatMessage): SheetAction[] => {
    // Nothing to reply to, copy or edit — it's an explanatory placeholder,
    // not real content (rendered separately and never long-pressable, but
    // guarded here too in case this is ever reached another way).
    if (message.is_undecryptable) return [];
    const isMine = message.sender_id === myId;
    const isSaved = !message.localStatus;
    const actions: SheetAction[] = [];
    if (isSaved) {
      actions.push({
        label: "Reply",
        icon: "arrow-undo-outline",
        onPress: () => {
          setEditing(null);
          setReplyTo(message);
          inputRef.current?.focus();
        },
      });
    }
    if (message.content) {
      actions.push({ label: "Copy", icon: "copy-outline", onPress: () => Clipboard.setStringAsync(message.content) });
    }
    if (isMine && isSaved && message.content && isWithinEditWindow(message.created_at)) {
      actions.push({
        label: "Edit",
        icon: "create-outline",
        onPress: () => {
          setReplyTo(null);
          setAttachment(null);
          setEditing(message);
          setDraft(message.content);
          inputRef.current?.focus();
        },
      });
    }
    if (isMine && isSaved) actions.push({ label: "Delete for everyone", icon: "trash-outline", onPress: () => confirmDelete(message) });
    if (message.localStatus === "failed" || message.localStatus === "offline") {
      actions.push({ label: "Retry", icon: "refresh-outline", onPress: () => retry(message) });
      actions.push({ label: "Discard", icon: "close-circle-outline", onPress: () => discardMessage(id, message.id) });
    }
    return actions;
  };

  const handleBlock = () => {
    if (!partner) return;
    Alert.alert(`Block ${withAdvPrefix(partner.full_name)}?`, "They won't be able to message or connect with you.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          await blockAdvocate(partner.id);
          router.back();
        },
      },
    ]);
  };

  const status = partnerTyping ? "typing…" : isPartnerOnline ? "online" : "tap for profile";

  const header = (
    <Stack.Screen
      options={{
        title: "",
        headerTitleAlign: "left",
        headerTitle: () =>
          partner ? (
            <Pressable
              onPress={() => router.push(`/(app)/network/${partner.id}`)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 240 }}
              accessibilityLabel={`${partner.full_name}, ${status}`}
            >
              <Avatar name={partner.full_name} photoUrl={partner.profile_photo_url} size={36} userId={partner.id} />
              <View style={{ flexShrink: 1 }}>
                <Text style={[typography.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                  {withAdvPrefix(partner.full_name)}
                </Text>
                <Text style={[typography.caption, { color: partnerTyping || isPartnerOnline ? colors.success : colors.textSecondary }]}>
                  {status}
                </Text>
              </View>
            </Pressable>
          ) : null,
        headerRight: () => (
          <Pressable
            onPress={() => setChatMenuOpen(true)}
            hitSlop={10}
            accessibilityLabel="Chat options"
            style={{ paddingRight: spacing.sm }}
          >
            <Ionicons name="ellipsis-vertical" size={20} color={colors.textPrimary} />
          </Pressable>
        ),
      }}
    />
  );

  if (error || messages === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {header}
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : <ActivityIndicator color={colors.brand} />}
      </View>
    );
  }

  const canSend = editing ? !!draft.trim() : !!draft.trim() || !!attachment;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      {header}

      <FlatList
        ref={listRef}
        inverted
        data={items}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingVertical: spacing.sm, flexGrow: items.length ? undefined : 1 }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => setShowJump(e.nativeEvent.contentOffset.y > 400)}
        scrollEventThrottle={100}
        onScrollToIndexFailed={() => {}}
        renderItem={({ item }) => {
          if (item.type === "day") {
            return (
              <View style={[styles.dayPill, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[typography.caption, { color: colors.textSecondary, fontWeight: "600" }]}>{item.label}</Text>
              </View>
            );
          }
          const message = item.message;
          const quoted = message.reply_to_id ? (byId.get(message.reply_to_id) ?? null) : null;
          return (
            <ChatBubble
              message={message}
              isMine={message.sender_id === myId}
              replyTo={quoted}
              replyToIsMine={quoted?.sender_id === myId}
              partnerName={partner?.full_name ?? "Advocate"}
              onLongPress={() => setMenu({ title: messagePreview(message).slice(0, 60), actions: messageActions(message) })}
              onPressReply={() => quoted && scrollToMessage(quoted.id)}
              onOpenImage={setViewerUri}
              onOpenFile={() => openFile(message)}
              onRetry={() => retry(message)}
              onExplainUndecryptable={() => explainUndecryptable(message)}
            />
          );
        }}
        ListEmptyComponent={
          <View style={[styles.empty, { transform: [{ scaleY: -1 }] }]}>
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.accent} />
              <Text style={[typography.caption, { color: colors.textSecondary, textAlign: "center" }]}>
                Messages here are private between you and {partner ? withAdvPrefix(partner.full_name) : "this advocate"}. Say hello 👋
              </Text>
            </View>
          </View>
        }
      />

      {showJump ? (
        <Pressable
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          style={[styles.jump, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityLabel="Scroll to latest"
        >
          <Ionicons name="chevron-down" size={20} color={colors.brand} />
        </Pressable>
      ) : null}

      {/* Reply / edit / attachment context above the composer */}
      {replyTo || editing || attachment ? (
        <View style={[styles.context, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={[styles.contextRail, { backgroundColor: editing ? colors.brand : colors.accent }]} />
          {attachment?.kind === "image" && !editing ? <Image source={{ uri: attachment.uri }} style={styles.contextThumb} contentFit="cover" /> : null}
          {attachment?.kind === "file" && !editing ? <Ionicons name="document-attach-outline" size={28} color={colors.brand} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: editing ? colors.brand : colors.accent, fontWeight: "700" }]}>
              {editing
                ? "Edit message"
                : replyTo
                  ? `Replying to ${replyTo.sender_id === myId ? "yourself" : (partner?.full_name ?? "")}`
                  : attachment?.kind === "image"
                    ? "Photo"
                    : "File"}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
              {editing ? messagePreview(editing) : replyTo ? messagePreview(replyTo) : `${attachment?.name ?? ""} · add a caption (optional)`}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (editing) {
                setEditing(null);
                setDraft("");
              } else if (replyTo) setReplyTo(null);
              else setAttachment(null);
            }}
            hitSlop={10}
            accessibilityLabel="Cancel"
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {/* Composer */}
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm), backgroundColor: colors.background }]}>
        <View style={[styles.inputPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {!editing ? (
            <Pressable onPress={() => setAttachMenuOpen(true)} hitSlop={8} accessibilityLabel="Attach" style={styles.inputIcon}>
              <Ionicons name="attach" size={24} color={colors.textSecondary} style={{ transform: [{ rotate: "45deg" }] }} />
            </Pressable>
          ) : null}
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={onChangeDraft}
            onKeyPress={onComposerKeyPress}
            placeholder={attachment ? "Add a caption" : "Message"}
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={2000}
            style={[typography.body, styles.input, { color: colors.textPrimary }]}
          />
          {!editing && !draft ? (
            <Pressable onPress={() => pickImage("camera")} hitSlop={8} accessibilityLabel="Take photo" style={styles.inputIcon}>
              <Ionicons name="camera-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          accessibilityLabel={editing ? "Save edit" : "Send"}
          style={[styles.send, { backgroundColor: canSend ? colors.brand : colors.surfaceAlt }]}
        >
          <Ionicons name={editing ? "checkmark" : "send"} size={20} color={canSend ? colors.textInverse : colors.textSecondary} />
        </Pressable>
      </View>

      <ActionSheet
        visible={!!menu}
        title={menu?.title}
        actions={menu?.actions ?? []}
        onClose={() => setMenu(null)}
      />
      <ActionSheet
        visible={attachMenuOpen}
        title="Share"
        actions={[
          // iOS can't present a picker while the sheet is still animating closed.
          { label: "Photo from gallery", icon: "image-outline", onPress: () => setTimeout(() => pickImage("library"), 400) },
          { label: "Camera", icon: "camera-outline", onPress: () => setTimeout(() => pickImage("camera"), 400) },
          { label: "Document", icon: "document-outline", onPress: () => setTimeout(pickDocument, 400) },
        ]}
        onClose={() => setAttachMenuOpen(false)}
      />
      <ActionSheet
        visible={chatMenuOpen}
        actions={[
          ...(partner ? [{ label: "View profile", icon: "person-outline" as const, onPress: () => router.push(`/(app)/network/${partner.id}`) }] : []),
          {
            label: "Report conversation",
            icon: "flag-outline",
            onPress: () => router.push(`/(app)/reports/new?targetType=conversation&targetId=${id}&label=conversation`),
          },
          { label: "Block", icon: "ban-outline", onPress: handleBlock },
        ]}
        onClose={() => setChatMenuOpen(false)}
      />

      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewerUri(null)} accessibilityLabel="Close photo">
          {viewerUri ? <Image source={{ uri: viewerUri }} style={{ width: "100%", height: "80%" }} contentFit="contain" /> : null}
          <View style={[styles.viewerClose, { top: insets.top + 12 }]}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dayPill: { alignSelf: "center", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, marginVertical: 10 },
  empty: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, maxWidth: 320 },
  jump: {
    position: "absolute",
    right: 16,
    bottom: 96,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 3,
    shadowColor: "#0F172A",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  context: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  contextRail: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  contextThumb: { width: 40, height: 40, borderRadius: 6 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 8, paddingTop: 6 },
  inputPill: { flex: 1, flexDirection: "row", alignItems: "flex-end", borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6, minHeight: 46 },
  inputIcon: { width: 36, height: 44, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, maxHeight: 120, paddingHorizontal: 6, paddingTop: 12, paddingBottom: 12 },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerClose: { position: "absolute", right: 20 },
});
