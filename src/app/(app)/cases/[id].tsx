import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { CaseDetail, getCase } from "@/features/cases/api";
import { CaseOverview } from "@/features/cases/CaseOverview";
import { LedgerView } from "@/features/transactions/LedgerView";
import { useSwipeTabs } from "@/shared/hooks/useSwipeTabs";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { useTheme } from "@/shared/ui/theme";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "financials", label: "Financials" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const TAB_KEYS = TABS.map((t) => t.key);

export default function CaseDetailScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const { colors, spacing, typography } = useTheme();
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [isEditing, setIsEditing] = useState(edit === "1");
  const swipeHandlers = useSwipeTabs(TAB_KEYS, tab, setTab);

  const load = useCallback(() => {
    getCase(id)
      .then((data) => {
        setCaseDetail(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setIsLoading(false));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (isLoading || error || !caseDetail) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        {isLoading ? <ActivityIndicator color={colors.brand} /> : <Text style={{ color: colors.danger }}>{error ?? "Case not found"}</Text>}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: caseDetail.title,
          headerRight: isEditing
            ? undefined
            : () => (
                <Pressable
                  onPress={() => {
                    setTab("overview");
                    setIsEditing(true);
                  }}
                  hitSlop={10}
                  accessibilityLabel="Edit case"
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingRight: spacing.sm }}
                >
                  <Ionicons name="create-outline" size={20} color={colors.brand} />
                  <Text style={[typography.bodyStrong, { color: colors.brand }]}>Edit</Text>
                </Pressable>
              ),
        }}
      />
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md, flexShrink: 0 }}>
        <SegmentedControl
          segments={[...TABS]}
          value={tab}
          onChange={(key) => setTab(key as TabKey)}
          style={{ marginBottom: 0 }}
        />
      </View>

      {/* Left/right swipe moves between Overview and Financials, in addition
          to tapping the segmented control above. */}
      <View style={{ flex: 1 }} {...swipeHandlers}>
        {tab === "overview" ? (
          <CaseOverview caseDetail={caseDetail} onUpdated={load} isEditing={isEditing} setIsEditing={setIsEditing} />
        ) : (
          <LedgerView clientId={caseDetail.client_id} caseId={caseDetail.id} variant="embedded" />
        )}
      </View>
    </View>
  );
}
