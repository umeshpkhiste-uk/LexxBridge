import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ConversationSummary, getOrCreateConversation, listConversations, subscribeToMyMessages } from "@/features/messaging/api";
import { ConversationRow } from "@/features/messaging/ConversationRow";
import {
  ConnectionRow,
  getFollowerCounts,
  getMutualConnectionCounts,
  listMyConnections,
  listSuggestedAdvocates,
  PublicProfile,
  respondToConnection,
  searchAdvocates,
  sendConnectionRequest,
} from "@/features/network/api";
import { Avatar, ColleagueCard, ConnectStatus, mutualLabel, PortraitAvatar, PostCard, withAdvPrefix } from "@/features/network/NetworkCards";
import { FeedPost, listFeed, toggleReaction } from "@/features/posts/api";
import { AdvocateProfile, getMyProfile } from "@/features/profile/api";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { useSwipeTabs } from "@/shared/hooks/useSwipeTabs";
import { HomeButton } from "@/shared/ui/HomeButton";
import { useTheme } from "@/shared/ui/theme";

type Segment = "feed" | "connections" | "messages";
const SEGMENTS: Segment[] = ["feed", "connections", "messages"];

export default function NetworkScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const [segment, setSegment] = useState<Segment>("feed");

  // Other screens link here as /network?segment=messages to open a tab directly.
  const { segment: segmentParam } = useLocalSearchParams<{ segment?: string }>();
  const [appliedSegmentParam, setAppliedSegmentParam] = useState<string | undefined>(undefined);
  if (segmentParam !== appliedSegmentParam) {
    setAppliedSegmentParam(segmentParam);
    // "discover" is the old tab name — its content now lives under Connections.
    // Old tab names — Discover and Requests both live under Connections now.
    if (segmentParam === "discover" || segmentParam === "requests") setSegment("connections");
    else if (SEGMENTS.includes(segmentParam as Segment)) setSegment(segmentParam as Segment);
  }

  const [me, setMe] = useState<AdvocateProfile | null>(null);
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [suggested, setSuggested] = useState<PublicProfile[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PublicProfile[] | null>(null);
  const [chip, setChip] = useState<string | null>(null);
  const [mutualCounts, setMutualCounts] = useState<Record<string, number>>({});
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({});
  const [discoverView, setDiscoverView] = useState<"grid" | "list">("grid");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    () =>
      Promise.allSettled([
        getMyProfile(),
        listFeed(),
        listSuggestedAdvocates(),
        listMyConnections(),
        listConversations(),
      ]).then(([profile, posts, people, conns, convos]) => {
        if (profile.status === "fulfilled") setMe(profile.value);
        if (posts.status === "fulfilled") setFeed(posts.value);
        if (people.status === "fulfilled") {
          setSuggested(people.value);
          const ids = people.value.map((p) => p.id);
          getMutualConnectionCounts(ids)
            .then((counts) => setMutualCounts((prev) => ({ ...prev, ...counts })))
            .catch(() => {});
          getFollowerCounts(ids)
            .then((counts) => setFollowerCounts((prev) => ({ ...prev, ...counts })))
            .catch(() => {});
        }
        if (conns.status === "fulfilled") setConnections(conns.value);
        if (convos.status === "fulfilled") setConversations(convos.value);
      }),
    []
  );

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setIsLoading(false));
    }, [load])
  );

  // Keep chat previews, ticks and unread badges live while this screen is open.
  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const unsubscribe = subscribeToMyMessages(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          listConversations().then(setConversations).catch(() => {});
        }, 400);
      });
      return () => {
        if (timer) clearTimeout(timer);
        unsubscribe();
      };
    }, [])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    load().finally(() => setIsRefreshing(false));
  };

  const clearSearch = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch("");
    setSearchResults(null);
    setChip(null);
  };

  // Each tab searches different things, so start fresh on switch — shared by
  // the segmented control and the left/right swipe gesture below.
  const changeSegment = (next: Segment) => {
    setSegment(next);
    clearSearch();
  };
  const swipeHandlers = useSwipeTabs(SEGMENTS, segment, changeSegment);
  const navigation = useNavigation();

  // Tapping the Network tab button — switching to it or re-tapping it while
  // already here — resets to Feed, so leaving it on Messages and coming
  // back later doesn't leave it stuck there. Doesn't fire for the
  // /network?segment=messages deep link (that's programmatic navigation,
  // not a tab-bar press) or for returning via the back arrow from a post/
  // profile screen.
  useEffect(() => {
    // expo-router's useNavigation() is typed generically and doesn't know
    // this screen sits directly under the bottom-tab navigator, so it
    // doesn't know about "tabPress" — it exists at runtime regardless.
    const unsubscribe = (navigation as any).addListener("tabPress", () => changeSegment("feed"));
    return unsubscribe;
    // changeSegment is re-created every render but only ever does the same
    // two setState calls — depending on it here would resubscribe constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  const onSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) {
      setSearchResults(null);
      return;
    }
    if (segment !== "connections") return;
    searchTimer.current = setTimeout(() => {
      searchAdvocates(text)
        .then((results) => {
          setSearchResults(results);
          const ids = results.map((p) => p.id);
          getFollowerCounts(ids)
            .then((counts) => setFollowerCounts((prev) => ({ ...prev, ...counts })))
            .catch(() => {});
          return getMutualConnectionCounts(ids);
        })
        .then((counts) => setMutualCounts((prev) => ({ ...prev, ...counts })))
        .catch(() => setSearchResults((prev) => prev ?? []));
    }, 300);
  };

  // Connection status per advocate, for Connect buttons.
  const statusById = useMemo(() => {
    const map = new Map<string, ConnectStatus>();
    for (const c of connections) {
      if (c.status === "accepted") map.set(c.otherParty.id, "accepted");
      else if (c.status === "pending") map.set(c.otherParty.id, "pending");
    }
    return map;
  }, [connections]);

  const nameQuery = search.trim().toLowerCase();
  const matchesName = (c: ConnectionRow) => !nameQuery || c.otherParty.full_name.toLowerCase().includes(nameQuery);
  const accepted = connections.filter((c) => c.status === "accepted");
  const incoming = connections.filter((c) => c.status === "pending" && c.isIncoming);
  const visibleAccepted = accepted.filter(matchesName);
  const visibleIncoming = incoming.filter(matchesName);
  const unreadMessages = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const chattingWith = new Set(conversations.map((c) => c.otherParty.id));
  const connectionsWithoutChat = accepted.filter((c) => !chattingWith.has(c.otherParty.id));

  // Filter chips come from real data: your own courts/practice areas first,
  // then the most common ones among advocates on the network.
  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of suggested) for (const t of [...p.courts, ...p.practice_areas]) counts.set(t, (counts.get(t) ?? 0) + 1);
    const popular = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    return [...new Set([...(me?.courts ?? []), ...(me?.practice_areas ?? []), ...popular])].slice(0, 8);
  }, [suggested, me]);

  const discoverList = useMemo(() => {
    // Suggestions skip people you're already connected to (they're listed
    // right above); explicit searches still show everyone who matches.
    const base = searchResults ?? suggested.filter((p) => statusById.get(p.id) !== "accepted");
    if (!chip) return base;
    const needle = chip.toLowerCase();
    return base.filter((p) => [...p.courts, ...p.practice_areas].some((t) => t.toLowerCase().includes(needle)));
  }, [searchResults, suggested, chip, statusById]);

  const handleEndorse = async (post: FeedPost) => {
    setFeed((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.likes_count + (p.liked_by_me ? -1 : 1) } : p
      )
    );
    try {
      await toggleReaction(post.id, "endorse", post.liked_by_me);
    } catch {
      load();
    }
  };

  const handleHeart = async (post: FeedPost) => {
    setFeed((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, hearted_by_me: !p.hearted_by_me, hearts_count: p.hearts_count + (p.hearted_by_me ? -1 : 1) } : p
      )
    );
    try {
      await toggleReaction(post.id, "heart", post.hearted_by_me);
    } catch {
      load();
    }
  };

  const handleEyes = async (post: FeedPost) => {
    setFeed((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, eyed_by_me: !p.eyed_by_me, eyes_count: p.eyes_count + (p.eyed_by_me ? -1 : 1) } : p))
    );
    try {
      await toggleReaction(post.id, "eyes", post.eyed_by_me);
    } catch {
      load();
    }
  };

  const handlePray = async (post: FeedPost) => {
    setFeed((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, prayed_by_me: !p.prayed_by_me, pray_count: p.pray_count + (p.prayed_by_me ? -1 : 1) } : p))
    );
    try {
      await toggleReaction(post.id, "pray", post.prayed_by_me);
    } catch {
      load();
    }
  };

  const bumpComments = (postId: string) =>
    setFeed((prev) => prev.map((p) => (p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p)));

  const dropComments = (postId: string) =>
    setFeed((prev) => prev.map((p) => (p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p)));

  const handleConnect = async (profile: PublicProfile) => {
    setConnections((prev) => [
      { id: `optimistic-${profile.id}`, status: "pending", isIncoming: false, otherParty: { ...profile, phone: null } },
      ...prev,
    ]);
    try {
      await sendConnectionRequest(profile.id);
      load();
    } catch (err) {
      setConnections((prev) => prev.filter((c) => c.id !== `optimistic-${profile.id}`));
      Alert.alert("Couldn't send request", err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleRespond = async (connection: ConnectionRow, accept: boolean) => {
    setConnections((prev) =>
      accept
        ? prev.map((c) => (c.id === connection.id ? { ...c, status: "accepted" } : c))
        : prev.filter((c) => c.id !== connection.id)
    );
    try {
      await respondToConnection(connection.id, accept);
    } catch {
      load();
    }
  };

  const openChat = async (otherId: string) => {
    try {
      const conversationId = await getOrCreateConversation(otherId);
      router.push(`/(app)/messages/${conversationId}`);
    } catch (err) {
      Alert.alert("Couldn't open chat", err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const myName = me ? withAdvPrefix(me.full_name) : "";
  const myForum = me?.courts[0] ?? me?.city ?? null;
  const searchBar = (placeholder: string) => (
    <View style={[styles.search, { backgroundColor: colors.surface, borderRadius: radius.sm, borderColor: colors.border }]}>
      <Ionicons name="search" size={20} color={colors.textSecondary} />
      <TextInput
        value={search}
        onChangeText={onSearchChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={[typography.body, { flex: 1, color: colors.textPrimary, paddingVertical: 11, marginLeft: spacing.sm }]}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
      />
    </View>
  );
  const emptyText = (text: string) => (
    <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl }]}>{text}</Text>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      {/* Header: who you are on the network */}
      <View style={[styles.header, { paddingHorizontal: spacing.md, backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.push("/(app)/(tabs)/profile")} style={[styles.headerLeft, { gap: spacing.sm }]}>
          <Avatar name={me?.full_name ?? "?"} photoUrl={me?.profile_photo_url} size={36} userId={me?.id} />
          <View style={{ flexShrink: 1 }}>
            <View style={styles.inline}>
              <Text style={[typography.bodyStrong, { color: colors.brand, flexShrink: 1 }]} numberOfLines={1}>
                {myName}
              </Text>
              {me?.verification_status === "verified" ? <Ionicons name="shield-checkmark" size={14} color={colors.accent} /> : null}
            </View>
            {myForum ? (
              <View style={[styles.forumChip, { backgroundColor: colors.surfaceAlt, borderRadius: 4 }]}>
                <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }]} numberOfLines={1}>
                  {myForum}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
        <HomeButton color={colors.textSecondary} />
      </View>

      {/* Left/right swipe moves between Feed / Connections / Messages, in
          addition to tapping the segmented control above. */}
      <View style={{ flex: 1 }} {...swipeHandlers}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* 0 — Sticky tabs */}
        <View style={{ backgroundColor: colors.background, paddingTop: spacing.sm }}>
          {/* Three equal tabs that always fit the screen width; only new
              requests / unread messages add a short count. */}
          <SegmentedControl
            segments={[
              { key: "feed", label: "Feed" },
              { key: "connections", label: incoming.length ? `Connections (${incoming.length})` : "Connections" },
              { key: "messages", label: unreadMessages ? `Messages (${unreadMessages})` : "Messages" },
            ]}
            value={segment}
            onChange={(key) => changeSegment(key as Segment)}
            style={{ marginBottom: spacing.sm, marginHorizontal: spacing.md }}
          />
        </View>

        {/* 1 — Content */}
        <View style={{ paddingHorizontal: spacing.md, gap: spacing.md }}>
          {isLoading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
          ) : segment === "feed" ? (
            <>
              {feed.length === 0
                ? emptyText(
                    accepted.length === 0
                      ? "Your feed shows posts from you and advocates you're connected with. Connect with colleagues to see their posts here."
                      : "No posts yet. Tap New Post to share the first one.",
                  )
                : null}
              {feed.length === 0 && accepted.length === 0 ? (
                <View style={{ alignItems: "center" }}>
                  <SmallButton icon="people-outline" label="Find colleagues" filled onPress={() => setSegment("connections")} />
                </View>
              ) : null}
              {feed.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onToggleEndorse={() => handleEndorse(post)}
                  onToggleHeart={() => handleHeart(post)}
                  onToggleEyes={() => handleEyes(post)}
                  onTogglePray={() => handlePray(post)}
                  onCommentAdded={() => bumpComments(post.id)}
                  onCommentRemoved={() => dropComments(post.id)}
                  isOwn={post.author_id === me?.id}
                  onEdited={(update) => setFeed((prev) => prev.map((p) => (p.id === post.id ? { ...p, ...update } : p)))}
                  onDeleted={() => setFeed((prev) => prev.filter((p) => p.id !== post.id))}
                />
              ))}
            </>
          ) : segment === "connections" ? (
            <>
              {searchBar("Search connections & advocates by name, city…")}
              {chips.length ? (
                <SegmentedControl
                  scrollable
                  segments={[{ key: "__all", label: "All" }, ...chips.map((c) => ({ key: c, label: c }))]}
                  value={chip ?? "__all"}
                  onChange={(key) => setChip(key === "__all" ? null : key)}
                  // The content column has side padding; let the row run edge to edge.
                  style={{ marginHorizontal: -spacing.md, marginTop: -spacing.sm, marginBottom: 0 }}
                />
              ) : null}
              {/* Your connections (hidden while searching/filtering so results come first) */}
              {/* Requests you've received — only shown when there are any. */}
              {visibleIncoming.length && !chip ? (
                <>
                  <Text style={[typography.subtitle, { color: colors.brand }]}>Connection requests ({visibleIncoming.length})</Text>
                  {visibleIncoming.map((c) => (
                    <PersonRow
                      key={c.id}
                      userId={c.otherParty.id}
                      name={c.otherParty.full_name}
                      photoUrl={c.otherParty.profile_photo_url}
                      subtitle="Wants to connect"
                      onPress={() => router.push(`/(app)/network/${c.otherParty.id}`)}
                      right={
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          <SmallButton icon="checkmark" label="Accept" filled onPress={() => handleRespond(c, true)} />
                          <SmallButton icon="close" label="" accessibilityLabel="Decline" onPress={() => handleRespond(c, false)} />
                        </View>
                      }
                    />
                  ))}
                </>
              ) : null}

              {/* Only shown once there's someone to list — no empty placeholder row. */}
              {!chip && visibleAccepted.length > 0 ? (
                <>
                  <Text style={[typography.subtitle, { color: colors.brand, marginTop: visibleIncoming.length ? spacing.sm : 0 }]}>
                    Your connections ({nameQuery ? `${visibleAccepted.length} of ${accepted.length}` : accepted.length})
                  </Text>
                  {visibleAccepted.map((c) => (
                      <PersonRow
                        key={c.id}
                        userId={c.otherParty.id}
                        name={c.otherParty.full_name}
                        photoUrl={c.otherParty.profile_photo_url}
                        onPress={() => openChat(c.otherParty.id)}
                        right={
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            {c.otherParty.phone ? (
                              <SmallButton
                                icon="call-outline"
                                label=""
                                accessibilityLabel="Call"
                                onPress={() => Linking.openURL(`tel:${c.otherParty.phone}`)}
                              />
                            ) : null}
                            <SmallButton
                              icon="chatbubble-ellipses-outline"
                              label=""
                              accessibilityLabel="Message"
                              onPress={() => openChat(c.otherParty.id)}
                            />
                          </View>
                        }
                      />
                  ))}
                </>
              ) : null}

              {/* Find colleagues — search results, chip filter, or suggestions */}
              <View style={[styles.sectionHeader, { marginTop: !chip && (visibleAccepted.length > 0 || visibleIncoming.length > 0) ? spacing.md : 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.subtitle, { color: colors.brand }]}>
                    {search.trim() ? "Search results" : chip ? chip : "Find colleagues"}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    {search.trim() || chip ? `${discoverList.length} advocate${discoverList.length === 1 ? "" : "s"}` : "Advocates you may know on LexxBridge"}
                  </Text>
                </View>
                {chip ? (
                  <Text style={[typography.label, { color: colors.accent, marginRight: spacing.sm }]} onPress={() => setChip(null)}>
                    Clear filter
                  </Text>
                ) : null}
                <View style={[styles.viewToggle, { borderColor: colors.border, borderRadius: radius.sm }]}>
                  <Pressable
                    onPress={() => setDiscoverView("grid")}
                    accessibilityLabel="Column view"
                    accessibilityState={{ selected: discoverView === "grid" }}
                    style={[styles.viewToggleBtn, { backgroundColor: discoverView === "grid" ? colors.surfaceAlt : "transparent" }]}
                  >
                    <Ionicons name="grid-outline" size={17} color={discoverView === "grid" ? colors.brand : colors.textSecondary} />
                  </Pressable>
                  <Pressable
                    onPress={() => setDiscoverView("list")}
                    accessibilityLabel="Row view"
                    accessibilityState={{ selected: discoverView === "list" }}
                    style={[styles.viewToggleBtn, { backgroundColor: discoverView === "list" ? colors.surfaceAlt : "transparent" }]}
                  >
                    <Ionicons name="list-outline" size={17} color={discoverView === "list" ? colors.brand : colors.textSecondary} />
                  </Pressable>
                </View>
              </View>
              {discoverList.length === 0 ? (
                <Text style={[typography.body, { color: colors.textSecondary }]}>
                  {chip || search ? "No advocates match." : "No advocates to show yet."}
                </Text>
              ) : discoverView === "grid" ? (
                <View style={[styles.grid, { gap: spacing.md }]}>
                  {discoverList.map((p) => (
                    <View key={p.id} style={styles.gridCell}>
                      <ColleagueCard
                        profile={p}
                        status={statusById.get(p.id) ?? "none"}
                        mutualCount={mutualCounts[p.id]}
                        onConnect={() => handleConnect(p)}
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {discoverList.map((p) => (
                    <ColleagueRow
                      key={p.id}
                      profile={p}
                      status={statusById.get(p.id) ?? "none"}
                      mutualCount={mutualCounts[p.id]}
                      followerCount={followerCounts[p.id]}
                      onConnect={() => handleConnect(p)}
                    />
                  ))}
                </View>
              )}
            </>
          ) : conversations.length === 0 && connectionsWithoutChat.length === 0 ? (
            <View style={{ alignItems: "center", gap: spacing.sm, marginTop: spacing.xl, paddingHorizontal: spacing.lg }}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="chatbubbles-outline" size={32} color={colors.brand} />
              </View>
              <Text style={[typography.subtitle, { color: colors.textPrimary }]}>No chats yet</Text>
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center" }]}>
                {"You can chat privately with advocates you're connected to. Send a connection request, and once it's accepted they'll appear here."}
              </Text>
              <SmallButton icon="people-outline" label="Find colleagues" filled onPress={() => setSegment("connections")} />
            </View>
          ) : (
            <>
              {conversations.map((c) => (
                <ConversationRow key={c.id} conversation={c} myId={me?.id ?? null} onPress={() => router.push(`/(app)/messages/${c.id}`)} />
              ))}

              {/* Accepted connections you haven't chatted with yet */}
              {connectionsWithoutChat.length ? (
                <Text style={[typography.label, { color: colors.textSecondary, textTransform: "uppercase", marginTop: conversations.length ? spacing.sm : 0 }]}>
                  Start a conversation
                </Text>
              ) : null}
              {connectionsWithoutChat.map((c) => (
                <PersonRow
                  key={c.id}
                  userId={c.otherParty.id}
                  name={c.otherParty.full_name}
                  photoUrl={c.otherParty.profile_photo_url}
                  subtitle="Connected · say hello"
                  onPress={() => openChat(c.otherParty.id)}
                  right={<SmallButton icon="chatbubble-ellipses-outline" label="Start chat" filled onPress={() => openChat(c.otherParty.id)} />}
                />
              ))}
            </>
          )}
        </View>
      </ScrollView>
      </View>

      {segment === "feed" ? (
        <Pressable
          onPress={() => router.push("/(app)/posts/new")}
          style={({ pressed }) => [styles.publish, { backgroundColor: colors.brand, opacity: pressed ? 0.9 : 1 }]}
          accessibilityLabel="New post"
        >
          <Ionicons name="create-outline" size={20} color={colors.accent} />
          <Text style={[typography.bodyStrong, { color: colors.textInverse }]}>New Post</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

/** Row-view alternative to ColleagueCard: avatar, name, mutual and follower
 * counts, and a compact connect action — no bio/specialty/tags. */
function ColleagueRow({
  profile,
  status,
  mutualCount,
  followerCount,
  onConnect,
}: {
  profile: PublicProfile;
  status: ConnectStatus;
  mutualCount?: number;
  followerCount?: number;
  onConnect: () => void;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const mutual = mutualLabel(mutualCount);
  return (
    <Pressable
      onPress={() => router.push(`/(app)/network/${profile.id}`)}
      style={({ pressed }) => [
        styles.personRow,
        { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <PortraitAvatar name={profile.full_name} photoUrl={profile.profile_photo_url} size={44} verified={profile.is_verified} userId={profile.id} />
      <View style={{ flex: 1, marginHorizontal: spacing.md }}>
        <Text style={[typography.bodyStrong, { color: colors.brand }]} numberOfLines={1}>
          {withAdvPrefix(profile.full_name)}
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
          {mutual ?? "No mutual connections yet"}
          {followerCount !== undefined ? ` · ${followerCount} follower${followerCount === 1 ? "" : "s"}` : ""}
        </Text>
      </View>
      {status === "none" ? (
        <SmallButton icon="person-add-outline" label="" accessibilityLabel="Connect" onPress={onConnect} />
      ) : (
        <Ionicons
          name={status === "accepted" ? "people" : "time-outline"}
          size={18}
          color={colors.textSecondary}
          accessibilityLabel={status === "accepted" ? "Connected" : "Requested"}
        />
      )}
    </Pressable>
  );
}

function PersonRow({
  userId,
  name,
  photoUrl,
  subtitle,
  onPress,
  right,
  bold,
}: {
  userId: string;
  name: string;
  photoUrl: string | null;
  subtitle?: string;
  onPress: () => void;
  right?: React.ReactNode;
  bold?: boolean;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const [viewerOpen, setViewerOpen] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.personRow,
        { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {photoUrl ? (
        <Pressable onPress={() => setViewerOpen(true)} hitSlop={4} accessibilityLabel={`View ${name}'s photo`}>
          <Avatar name={name} photoUrl={photoUrl} size={44} userId={userId} />
        </Pressable>
      ) : (
        <Avatar name={name} photoUrl={photoUrl} size={44} userId={userId} />
      )}
      <View style={{ flex: 1, marginHorizontal: spacing.md }}>
        <Text style={[typography.bodyStrong, { color: colors.brand }]} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text
            style={[typography.caption, { color: bold ? colors.textPrimary : colors.textSecondary, fontWeight: bold ? "600" : "400" }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}

      {photoUrl ? (
        <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
          <Pressable style={styles.photoViewer} onPress={() => setViewerOpen(false)} accessibilityLabel={`Close ${name}'s photo`}>
            <Image source={{ uri: photoUrl }} style={styles.photoViewerImage} resizeMode="contain" />
          </Pressable>
        </Modal>
      ) : null}
    </Pressable>
  );
}

function SmallButton({
  icon,
  label,
  onPress,
  filled,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  filled?: boolean;
  /** Required when label is empty (icon-only), since there's no text for screen readers to fall back on. */
  accessibilityLabel?: string;
}) {
  const { colors, radius, typography } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.smallButton,
        { borderRadius: radius.sm, backgroundColor: filled ? colors.brand : colors.surfaceAlt, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name={icon} size={16} color={filled ? colors.textInverse : colors.brand} />
      {label ? <Text style={[typography.label, { color: filled ? colors.textInverse : colors.brand }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { height: 60, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  inline: { flexDirection: "row", alignItems: "center", gap: 4 },
  forumChip: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 1, marginTop: 2 },
  dot: { position: "absolute", top: 1, right: 1, width: 8, height: 8, borderRadius: 4 },
  search: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  viewToggle: { flexDirection: "row", borderWidth: StyleSheet.hairlineWidth, padding: 2 },
  viewToggleBtn: { width: 30, height: 30, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridCell: { width: "47.5%" },
  personRow: { flexDirection: "row", alignItems: "center" },
  photoViewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  photoViewerImage: { width: "100%", height: "80%" },
  smallButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 34 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  countPill: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  publish: {
    position: "absolute",
    right: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 999,
    shadowColor: "#0F172A",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
