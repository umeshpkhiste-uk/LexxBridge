import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { firstName, greetingFor } from "@/shared/lib/names";
import { AgendaItem, listAgendaItems } from "@/features/calendar/api";
import { DayAgenda } from "@/features/calendar/DayAgenda";
import { MonthCalendar } from "@/features/calendar/MonthCalendar";
import { CaseSummary, deleteCase, listCases } from "@/features/cases/api";
import { downloadCaseHandoverPdf } from "@/features/cases/caseHandover";
import { listUpcomingHearings, UpcomingHearing } from "@/features/hearings/api";
import { ConversationSummary, listConversations } from "@/features/messaging/api";
import { OnlineDot } from "@/features/presence/OnlineDot";
import { getMyProfile } from "@/features/profile/api";
import { getPendingByCase } from "@/features/transactions/api";
import { downloadCaseStatementPdf } from "@/features/transactions/shareStatement";
import { alertMessage, confirmAlert } from "@/shared/lib/alert";
import { formatHearingDate, formatINR, toDateParam } from "@/shared/lib/format";
import { ActionSheet, SheetAction } from "@/shared/ui/ActionSheet";
import { useAppWidth } from "@/shared/ui/appFrame";
import { useTheme } from "@/shared/ui/theme";

const UPCOMING_DAYS_AHEAD = 60;
const UPCOMING_DAY_LIMIT = 7;

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
/** Groups hearings (already sorted soonest-first) into one entry per day. */
function groupByDay(hearings: UpcomingHearing[]): { key: string; date: Date; hearings: UpcomingHearing[] }[] {
  const groups = new Map<string, { key: string; date: Date; hearings: UpcomingHearing[] }>();
  for (const h of hearings) {
    const key = toDateParam(h.hearing_at);
    if (!groups.has(key)) groups.set(key, { key, date: startOfDay(new Date(h.hearing_at)), hearings: [] });
    groups.get(key)!.hearings.push(h);
  }
  return [...groups.values()];
}

/** "10:42 am" today, "Yesterday", otherwise "24 Sep". */
function formatMessageTime(iso: string) {
  const date = new Date(iso);
  const days = Math.round((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (days === 0) return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Upcoming hearings first (soonest on top), then cases with no date set. */
function sortByNextHearing(cases: CaseSummary[]): CaseSummary[] {
  const today = startOfDay(new Date()).getTime();
  const upcoming = (c: CaseSummary) => (c.next_hearing_at && new Date(c.next_hearing_at).getTime() >= today ? 0 : 1);
  return [...cases].sort((a, b) => {
    const byGroup = upcoming(a) - upcoming(b);
    if (byGroup !== 0) return byGroup;
    if (upcoming(a) === 0) return a.next_hearing_at!.localeCompare(b.next_hearing_at!);
    return b.created_at.localeCompare(a.created_at);
  });
}

export default function HomeScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  // Phone width, or the app's centred column on the web.
  const width = useAppWidth();
  const [name, setName] = useState<string | null>(null);
  const [todayItems, setTodayItems] = useState<AgendaItem[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [pendingByCase, setPendingByCase] = useState<Record<string, number>>({});
  const [upcoming, setUpcoming] = useState<UpcomingHearing[]>([]);
  const [unreadChats, setUnreadChats] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [menuCase, setMenuCase] = useState<CaseSummary | null>(null);

  const load = useCallback(() => {
    const today = new Date();
    // allSettled so one failing section (e.g. a transient network error)
    // doesn't blank out the rest of the dashboard or surface as an
    // unhandled promise rejection.
    return Promise.allSettled([
      getMyProfile(),
      listAgendaItems({ from: startOfDay(today), to: endOfDay(today) }),
      listCases(),
      getPendingByCase(),
      listUpcomingHearings({ from: startOfDay(today), to: endOfDay(new Date(today.getTime() + UPCOMING_DAYS_AHEAD * 86_400_000)) }),
      listConversations(),
    ]).then(([profile, agenda, caseList, pending, hearings, conversations]) => {
      if (profile.status === "fulfilled") setName(profile.value.full_name);
      if (agenda.status === "fulfilled") setTodayItems(agenda.value);
      if (caseList.status === "fulfilled") setCases(caseList.value);
      if (pending.status === "fulfilled") setPendingByCase(pending.value);
      if (hearings.status === "fulfilled") setUpcoming(hearings.value);
      if (conversations.status === "fulfilled") setUnreadChats(conversations.value.filter((c) => c.unreadCount > 0));

      const failures = [profile, agenda, caseList, pending, hearings, conversations].filter((r) => r.status === "rejected");
      if (failures.length > 0) console.warn("Home: some sections failed to load", failures.map((f) => f.reason));
    });
  }, []);

  // Kept in state and refreshed on focus and every minute, so it changes
  // with the time of day instead of sticking to when the app opened.
  const [greeting, setGreeting] = useState(() => greetingFor(new Date()));
  useFocusEffect(
    useCallback(() => {
      setGreeting(greetingFor(new Date()));
      const timer = setInterval(() => setGreeting(greetingFor(new Date())), 60_000);
      return () => clearInterval(timer);
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setIsLoading(false));
    }, [load])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    load().finally(() => setIsRefreshing(false));
  };

  // Same cases as the Cases tab, soonest hearing first.
  const currentCases = useMemo(() => {
    const all = sortByNextHearing(cases);
    const query = search.trim().toLowerCase();
    if (!query) return all;
    return all.filter((c) => [c.title, c.clients?.full_name, c.case_number].some((field) => field?.toLowerCase().includes(query)));
  }, [cases, search]);

  const upcomingDays = useMemo(() => groupByDay(upcoming).slice(0, UPCOMING_DAY_LIMIT), [upcoming]);
  const cardWidth = (width - spacing.lg * 2 - spacing.md) / 2;

  const openCalendar = (dateIso?: string) =>
    router.push(dateIso ? `/(app)/(tabs)/calendar?date=${toDateParam(dateIso)}` : "/(app)/(tabs)/calendar");

  const downloadCaseStatement = async (c: CaseSummary) => {
    try {
      await downloadCaseStatementPdf(c.id);
    } catch (err) {
      alertMessage("Couldn't download statement", err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const confirmDeleteCase = (c: CaseSummary) => {
    confirmAlert(
      "Delete this case permanently?",
      `This will permanently delete "${c.title}" and everything in it — hearings, documents, and all related transactions. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCase(c.id);
              setCases((prev) => prev.filter((x) => x.id !== c.id));
              alertMessage("Deleted", `"${c.title}" has been deleted.`);
            } catch (err) {
              alertMessage("Couldn't delete", err instanceof Error ? err.message : "Something went wrong");
            }
          },
        },
      ],
    );
  };

  const menuActions: SheetAction[] = menuCase
    ? [
        { label: "Open case", icon: "folder-open-outline", onPress: () => router.push(`/(app)/cases/${menuCase.id}`) },
        {
          label: "Schedule hearing",
          icon: "calendar-outline",
          onPress: () => router.push(`/(app)/hearings/new?caseId=${menuCase.id}`),
        },
        {
          label: "Transactions",
          icon: "wallet-outline",
          onPress: () => router.push(`/(app)/ledger?clientId=${menuCase.client_id}&caseId=${menuCase.id}`),
        },
        {
          label: "Add payment / fee",
          icon: "cash-outline",
          onPress: () => router.push(`/(app)/transactions/new?caseId=${menuCase.id}&clientId=${menuCase.client_id}`),
        },
        { label: "Download statement", icon: "download-outline", onPress: () => downloadCaseStatement(menuCase) },
        { label: "Download case summary", icon: "document-outline", onPress: () => downloadCaseHandoverPdf(menuCase.id) },
        ...(menuCase.next_hearing_at
          ? [{ label: "See hearing in calendar", icon: "today-outline" as const, onPress: () => openCalendar(menuCase.next_hearing_at!) }]
          : []),
        { label: "Delete case", icon: "trash-outline", destructive: true, onPress: () => confirmDeleteCase(menuCase) },
      ]
    : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <Text style={[typography.display, { color: colors.brand, fontSize: 32, lineHeight: 38 }]}>
          Hi{firstName(name) ? ` ${firstName(name)}` : ""}!
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, fontSize: 17 }]}>{greeting}</Text>

        {/* Search */}
        <View
          style={[
            styles.search,
            { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, marginTop: spacing.lg, paddingHorizontal: spacing.md },
          ]}
        >
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search cases or clients"
            placeholderTextColor={colors.textSecondary}
            style={[typography.body, { flex: 1, color: colors.textPrimary, paddingVertical: 14, marginLeft: spacing.sm }]}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* Today */}
        {!search && todayItems.length > 0 ? (
          <>
            <SectionHeader title="Today" colors={colors} typography={typography} spacing={spacing} />
            {todayItems.map((item) => (
              <Pressable
                key={`${item.type}-${item.id}`}
                onPress={() => {
                  if (item.type === "hearing") router.push(`/(app)/hearings/${item.id}`);
                  else if (item.caseId) router.push(`/(app)/cases/${item.caseId}`);
                  else if (item.type === "meeting") router.push(`/(app)/meetings/new?id=${item.id}`);
                  else router.push(`/(app)/tasks/new?id=${item.id}`);
                }}
                style={[styles.todayRow, { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md }]}
              >
                <Ionicons
                  name={item.type === "hearing" ? "briefcase-outline" : item.type === "meeting" ? "people-outline" : "checkbox-outline"}
                  size={20}
                  color={colors.brand}
                />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[typography.bodyStrong, { color: colors.textPrimary, textTransform: "capitalize" }]}>{item.title}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                    {formatHearingDate(item.at)}
                    {item.subtitle ? ` · ${item.subtitle}` : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            ))}
          </>
        ) : null}

        {/* Upcoming hearings — one card per day */}
        {!search ? (
          <>
            <SectionHeader
              title="Upcoming Hearings"
              colors={colors}
              typography={typography}
              spacing={spacing}
            />
            {isLoading ? (
              <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.sm }} />
            ) : upcomingDays.length === 0 ? (
              <Pressable
                onPress={() => openCalendar()}
                style={{ padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface }}
              >
                <Text style={[typography.body, { color: colors.textSecondary }]}>
                  No hearings scheduled in the next {UPCOMING_DAYS_AHEAD} days.
                </Text>
              </Pressable>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -spacing.lg }}
                contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
              >
                {upcomingDays.map((day, index) => (
                  <HearingDayCard
                    key={day.key}
                    date={day.date}
                    hearings={day.hearings}
                    highlighted={index === 0}
                    width={Math.min(cardWidth * 1.25, 260)}
                    onOpenCalendar={() => openCalendar(day.hearings[0].hearing_at)}
                  />
                ))}
              </ScrollView>
            )}
          </>
        ) : null}

        {/* Current cases */}
        <SectionHeader
          title={search ? "Matching cases" : `Cases (${currentCases.length})`}
          action={{ label: "View all", onPress: () => router.push("/(app)/(tabs)/cases") }}
          colors={colors}
          typography={typography}
          spacing={spacing}
        />

        {isLoading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
        ) : currentCases.length === 0 ? (
          <Pressable
            onPress={() => router.push("/(app)/(tabs)/cases")}
            style={{ padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface }}
          >
            <Text style={[typography.body, { color: colors.textSecondary }]}>
              {search
                ? "No current cases match your search."
                : "No cases yet. Tap + to add a client and their first case."}
            </Text>
          </Pressable>
        ) : (
          <View style={[styles.grid, { gap: spacing.md }]}>
            {currentCases.map((c, index) => (
              <CaseCard
                key={c.id}
                item={c}
                pending={pendingByCase[c.id] ?? 0}
                highlighted={index === 0 && !search}
                width={cardWidth}
                onOpenCalendar={openCalendar}
                onMenu={() => setMenuCase(c)}
              />
            ))}
          </View>
        )}

        {/* Calendar: this week at a glance */}
        {!search ? (
          <>
            <SectionHeader
              title="Calendar"
              colors={colors}
              typography={typography}
              spacing={spacing}
            />
            <HomeMonthCalendar />
          </>
        ) : null}

        {/* Unread messages */}
        {!search ? (
          <>
            <SectionHeader
              title="Unread Messages"
              action={{ label: "All messages", onPress: () => router.push("/(app)/(tabs)/network?segment=messages") }}
              colors={colors}
              typography={typography}
              spacing={spacing}
            />
            {isLoading ? (
              <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.sm }} />
            ) : unreadChats.length === 0 ? (
              <View style={[styles.emptyMessages, { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface }]}>
                <Ionicons name="checkmark-done-outline" size={22} color={colors.success} />
                <Text style={[typography.body, { color: colors.textSecondary, marginLeft: spacing.sm }]}>No unread messages</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md }}>
                {unreadChats.map((chat, i) => (
                  <Pressable
                    key={chat.id}
                    onPress={() => router.push(`/(app)/messages/${chat.id}`)}
                    style={({ pressed }) => [
                      styles.messageRow,
                      {
                        paddingVertical: spacing.md,
                        borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                        borderTopColor: colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <View>
                      {chat.otherParty.profile_photo_url ? (
                        <Image source={{ uri: chat.otherParty.profile_photo_url }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
                          <Text style={[typography.bodyStrong, { color: colors.brand }]}>
                            {chat.otherParty.full_name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <OnlineDot userId={chat.otherParty.id} avatarSize={44} />
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <View style={styles.messageTop}>
                        <Text style={[typography.bodyStrong, { color: colors.textPrimary, flexShrink: 1 }]} numberOfLines={1}>
                          {chat.otherParty.full_name}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary, marginLeft: spacing.sm }]}>
                          {formatMessageTime(chat.last_message_at)}
                        </Text>
                      </View>
                      <View style={[styles.messageTop, { marginTop: 2 }]}>
                        <Text style={[typography.body, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                          {chat.lastMessage?.is_deleted ? "Message deleted" : (chat.lastMessage?.content ?? "")}
                        </Text>
                        <View style={[styles.unreadPill, { backgroundColor: colors.brand, marginLeft: spacing.sm }]}>
                          <Text style={styles.badgeText}>{chat.unreadCount > 99 ? "99+" : chat.unreadCount}</Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      <ActionSheet visible={!!menuCase} title={menuCase?.title} actions={menuActions} onClose={() => setMenuCase(null)} />
    </SafeAreaView>
  );
}

type Theme = ReturnType<typeof useTheme>;

/** The month calendar (same as the Calendar page) in a card, with the
 * picked day's hearings, meetings and tasks listed right below it. */
function HomeMonthCalendar() {
  const { colors, spacing, radius } = useTheme();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const from = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
      const to = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0, 23, 59, 59, 999);
      listAgendaItems({ from, to })
        .then((rows) => active && setItems(rows))
        .catch(() => {})
        .finally(() => active && setIsLoading(false));
      return () => {
        active = false;
      };
    }, [visibleMonth]),
  );

  const today = new Date();
  const changeMonth = (delta: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + delta, 1);
    setVisibleMonth(next);
    setIsLoading(true);
    const inCurrentMonth = next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth();
    setSelectedDate(inCurrentMonth ? startOfDay(today) : next);
  };

  return (
    <View style={[styles.calendarCard, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }]}>
      <MonthCalendar
        visibleMonth={visibleMonth}
        selectedDate={selectedDate}
        items={items}
        onSelectDate={setSelectedDate}
        onChangeMonth={changeMonth}
        onToday={() => {
          setSelectedDate(startOfDay(today));
          setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
        }}
      />
      <DayAgenda selectedDate={selectedDate} items={items} isLoading={isLoading} />
    </View>
  );
}

function SectionHeader({
  title,
  action,
  colors,
  typography,
  spacing,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  colors: Theme["colors"];
  typography: Theme["typography"];
  spacing: Theme["spacing"];
}) {
  return (
    <View style={[styles.sectionHeader, { marginTop: spacing.xl, marginBottom: spacing.md }]}>
      <Text style={[typography.title, { color: colors.textPrimary }]}>{title}</Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={[typography.bodyStrong, { color: colors.textSecondary }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function HearingDayCard({
  date,
  hearings,
  highlighted,
  width,
  onOpenCalendar,
}: {
  date: Date;
  hearings: UpcomingHearing[];
  highlighted: boolean;
  width: number;
  onOpenCalendar: () => void;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const fg = highlighted ? "#FFFFFF" : colors.textPrimary;
  const muted = highlighted ? "rgba(255,255,255,0.75)" : colors.textSecondary;
  const isMultiple = hearings.length > 1;
  const first = hearings[0];

  const days = Math.round((date.getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
  const dayLabel = days === 0 ? "Today" : days === 1 ? "Tomorrow" : date.toLocaleDateString("en-IN", { weekday: "long" });
  const dateLabel = date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

  return (
    <Pressable
      // One hearing → straight to it. Several → the calendar for that day.
      onPress={() => (isMultiple ? onOpenCalendar() : router.push(`/(app)/hearings/${first.id}`))}
      style={({ pressed }) => [
        styles.card,
        {
          width,
          backgroundColor: highlighted ? colors.brand : colors.surface,
          borderRadius: radius.lg,
          padding: spacing.md,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[typography.bodyStrong, { color: fg }]}>{dayLabel}</Text>
          <Text style={[typography.caption, { color: muted }]}>{dateLabel}</Text>
        </View>
        <View style={[styles.countPill, { backgroundColor: highlighted ? "rgba(255,255,255,0.2)" : colors.surfaceAlt }]}>
          <Ionicons name="briefcase-outline" size={12} color={fg} />
          <Text style={[typography.label, { color: fg }]}>{hearings.length}</Text>
        </View>
      </View>

      {isMultiple ? (
        <>
          {hearings.slice(0, 2).map((h) => (
            <View key={h.id} style={{ marginTop: spacing.sm }}>
              <Text style={[typography.bodyStrong, { color: fg }]} numberOfLines={1}>
                {time(h.hearing_at)} · {h.cases?.title ?? "Hearing"}
              </Text>
              <Text style={[typography.caption, { color: muted }]} numberOfLines={1}>
                {[h.cases?.clients?.full_name, h.cases?.case_type].filter(Boolean).join(" · ") || "—"}
              </Text>
            </View>
          ))}
          <View style={[styles.openCalendar, { marginTop: spacing.md }]}>
            <Ionicons name="calendar-outline" size={16} color={highlighted ? "#FFFFFF" : colors.brand} />
            <Text style={[typography.label, { color: highlighted ? "#FFFFFF" : colors.brand }]}>
              {hearings.length > 2 ? `+${hearings.length - 2} more · ` : ""}Open calendar ›
            </Text>
          </View>
        </>
      ) : (
        <>
          <Text style={[typography.caption, { color: muted, marginTop: spacing.md }]}>
            {time(first.hearing_at)}
            {first.court ? ` · ${first.court}` : ""}
          </Text>
          <Text style={[typography.bodyStrong, { color: fg, fontSize: 16, marginTop: 2 }]} numberOfLines={2}>
            {first.cases?.title ?? "Hearing"}
          </Text>
          <View style={[styles.detailRow, { marginTop: spacing.sm }]}>
            <Ionicons name="person-outline" size={14} color={muted} />
            <Text
              style={[typography.caption, { color: muted, flexShrink: 1 }]}
              numberOfLines={1}
            >
              {first.cases?.clients?.full_name ?? "No client"}
            </Text>
          </View>
          <View style={[styles.detailRow, { marginTop: 4 }]}>
            <Ionicons name="pricetag-outline" size={14} color={muted} />
            <Text style={[typography.caption, { color: muted, flexShrink: 1 }]} numberOfLines={1}>
              {first.cases?.case_type ?? "Case type not set"}
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

function CaseCard({
  item,
  pending,
  highlighted,
  width,
  onOpenCalendar,
  onMenu,
}: {
  item: CaseSummary;
  pending: number;
  highlighted: boolean;
  width: number;
  onOpenCalendar: (dateIso?: string) => void;
  onMenu: () => void;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const fg = highlighted ? "#FFFFFF" : colors.textPrimary;
  const muted = highlighted ? "rgba(255,255,255,0.75)" : colors.textSecondary;
  const faint = highlighted ? "rgba(255,255,255,0.55)" : colors.textSecondary;
  const dividerColor = highlighted ? "rgba(255,255,255,0.14)" : colors.border;
  const rowIconBg = highlighted ? "rgba(255,255,255,0.1)" : colors.surfaceAlt;
  const hasUpcoming = !!item.next_hearing_at && new Date(item.next_hearing_at) >= startOfDay(new Date());
  const pendingColor = pending > 0 ? (highlighted ? "#FFD28A" : colors.warning) : muted;

  return (
    <Pressable
      onPress={() => router.push(`/(app)/cases/${item.id}`)}
      style={({ pressed }) => [
        styles.card,
        {
          width,
          backgroundColor: highlighted ? colors.brand : colors.surface,
          borderRadius: radius.lg,
          padding: spacing.md,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.cardTop}>
        {item.case_type ? (
          <Text style={[typography.label, styles.overline, { color: colors.accent, flex: 1 }]} numberOfLines={1}>
            {item.case_type.toUpperCase()}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Pressable onPress={onMenu} hitSlop={10} accessibilityLabel="Case options">
          <Ionicons name="ellipsis-vertical" size={16} color={faint} />
        </Pressable>
      </View>

      <Text style={[typography.bodyStrong, { color: fg, fontSize: 16, marginTop: spacing.xs }]} numberOfLines={2}>
        {item.title}
      </Text>

      <View style={[styles.rowDivider, { marginTop: spacing.sm, borderTopColor: dividerColor }]} />

      <Pressable
        onPress={() =>
          hasUpcoming ? onOpenCalendar(item.next_hearing_at!) : router.push(`/(app)/hearings/new?caseId=${item.id}`)
        }
        hitSlop={4}
        style={styles.statRow}
        accessibilityLabel={hasUpcoming ? "Open next hearing in calendar" : "Schedule a hearing"}
      >
        <View
          style={[
            styles.statIcon,
            { borderRadius: radius.sm },
            hasUpcoming ? { backgroundColor: rowIconBg } : [styles.statIconOutline, { borderColor: highlighted ? "rgba(255,255,255,0.35)" : colors.border }],
          ]}
        >
          <Ionicons name={hasUpcoming ? "calendar-outline" : "add"} size={13} color={hasUpcoming ? fg : faint} />
        </View>
        {hasUpcoming ? (
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: faint, fontSize: 10 }]}>Next hearing</Text>
            <Text style={[typography.bodyStrong, { color: fg, fontSize: 13 }]} numberOfLines={1}>
              {formatHearingDate(item.next_hearing_at!)}
            </Text>
          </View>
        ) : (
          <Text style={[typography.bodyStrong, { color: muted, fontSize: 13, flex: 1 }]}>Schedule hearing</Text>
        )}
      </Pressable>

      <View style={[styles.rowDivider, { borderTopColor: dividerColor }]} />

      <Pressable
        onPress={() => router.push(`/(app)/ledger?clientId=${item.client_id}&caseId=${item.id}`)}
        hitSlop={4}
        style={[styles.statRow, { paddingBottom: 2 }]}
        accessibilityLabel="Open case transactions"
      >
        <View style={[styles.statIcon, { borderRadius: radius.sm, backgroundColor: rowIconBg }]}>
          <Ionicons name="wallet-outline" size={13} color={pendingColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.caption, { color: faint, fontSize: 10 }]}>Pending</Text>
          <Text style={[typography.bodyStrong, { color: pendingColor, fontSize: 13 }]} numberOfLines={1}>
            {pending > 0 ? formatINR(pending) : "No dues"}
          </Text>
        </View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  search: { flexDirection: "row", alignItems: "center" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  todayRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  card: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  overline: { letterSpacing: 0.3 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  statRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  statIcon: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  statIconOutline: { borderWidth: 1, borderStyle: "dashed" },
  countPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  openCalendar: { flexDirection: "row", alignItems: "center", gap: 6 },
  calendarCard: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  emptyMessages: { flexDirection: "row", alignItems: "center" },
  messageRow: { flexDirection: "row", alignItems: "center" },
  messageTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  unreadPill: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
});
