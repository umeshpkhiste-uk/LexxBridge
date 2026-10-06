import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CaseSummary, listCases } from "@/features/cases/api";
import { CaseBriefCard } from "@/features/cases/CaseBriefCard";
import { ClientListItem, listClients, uploadClientPhoto } from "@/features/clients/api";
import { clientCaseTargets } from "@/features/clients/clientCases";
import { useSwipeTabs } from "@/shared/hooks/useSwipeTabs";
import { ActionSheet, SheetAction } from "@/shared/ui/ActionSheet";
import { ClientAvatar } from "@/features/clients/ClientAvatar";
import { Badge } from "@/shared/ui/Badge";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { TextField } from "@/shared/ui/TextField";
import { HomeButton } from "@/shared/ui/HomeButton";
import { useTheme } from "@/shared/ui/theme";

const CASES_SEGMENTS = ["cases", "clients"] as const;

export default function CasesScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const [segment, setSegment] = useState<"cases" | "clients">("cases");
  const [search, setSearch] = useState("");
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [clients, setClients] = useState<ClientListItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientMenu, setClientMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const swipeHandlers = useSwipeTabs(CASES_SEGMENTS, segment, setSegment);
  const navigation = useNavigation();

  // Tapping the Cases tab button — whether switching to it from elsewhere or
  // re-tapping it while already here — resets to the default segment, so
  // leaving it on "clients" and coming back later doesn't leave the picker
  // stuck there. This only fires for the tab button itself, not for
  // returning via the back arrow from a case/client detail screen.
  useEffect(() => {
    // expo-router's useNavigation() is typed generically and doesn't know
    // this screen sits directly under the bottom-tab navigator, so it
    // doesn't know about "tabPress" — it exists at runtime regardless.
    const unsubscribe = (navigation as any).addListener("tabPress", () => setSegment("cases"));
    return unsubscribe;
  }, [navigation]);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const request = segment === "cases" ? listCases({ search }) : listClients({ search });
    request
      .then((data) => (segment === "cases" ? setCases(data as CaseSummary[]) : setClients(data as ClientListItem[])))
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setIsLoading(false));
  }, [segment, search]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // A client opens straight onto their case; with several open cases, pick one.
  const openClient = (client: ClientListItem) => {
    const targets = clientCaseTargets(client.cases);
    if (targets.length === 0) return router.push(`/(app)/cases/new?clientId=${client.id}`);
    if (targets.length === 1) return router.push(`/(app)/cases/${targets[0].id}`);
    setClientMenu({
      title: `${client.full_name} · choose a case`,
      actions: targets.map((c) => ({
        label: c.title,
        icon: "briefcase-outline" as const,
        onPress: () => router.push(`/(app)/cases/${c.id}`),
      })),
    });
  };

  const changePhoto = async (client: ClientListItem) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission needed", "Allow photo access in Settings to add a client photo.");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    try {
      await uploadClientPhoto(client, asset.uri, asset.mimeType ?? "image/jpeg");
      load();
    } catch (err) {
      Alert.alert("Couldn't save photo", err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
          <Text style={[typography.title, { color: colors.textPrimary }]}>Cases</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Pressable
              onPress={() => router.push(segment === "cases" ? "/(app)/cases/new" : "/(app)/clients/new")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={segment === "cases" ? "New case" : "New client"}
            >
              <Ionicons name="add-circle-outline" size={26} color={colors.textPrimary} />
            </Pressable>
            <HomeButton />
          </View>
        </View>
        <SegmentedControl
          segments={[
            { key: "cases", label: "Cases" },
            { key: "clients", label: "Clients" },
          ]}
          value={segment}
          onChange={(key) => setSegment(key as "cases" | "clients")}
        />
        <TextField
          label=""
          placeholder={segment === "cases" ? "Search cases" : "Search clients"}
          value={search}
          onChangeText={setSearch}
          style={{ marginBottom: 0 }}
        />
      </View>

      {/* Left/right swipe moves between Cases and Clients, in addition to
          tapping the segmented control above. */}
      <View style={{ flex: 1 }} {...swipeHandlers}>
      {isLoading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
      ) : error ? (
        <Text style={[typography.body, { color: colors.danger, padding: spacing.lg }]}>{error}</Text>
      ) : segment === "cases" ? (
        <FlatList
          data={cases ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96 }}
          ListEmptyComponent={
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl }]}>
              No cases yet. Tap + above to add one.
            </Text>
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          renderItem={({ item }) => (
            <CaseBriefCard
              caseItem={item}
              onPress={() => router.push(`/(app)/cases/${item.id}`)}
              onEdit={() => router.push(`/(app)/cases/${item.id}?edit=1`)}
              onHearingChanged={load}
            />
          )}
        />
      ) : (
        <FlatList
          data={clients ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96 }}
          ListEmptyComponent={
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl }]}>
              No clients yet. Tap + above to add one.
            </Text>
          }
          renderItem={({ item }) => {
            const targets = clientCaseTargets(item.cases);
            const shown = targets[0];
            const more = targets.length - 1;
            return (
              <Pressable
                onPress={() => openClient(item)}
                onLongPress={() =>
                  setClientMenu({
                    title: item.full_name,
                    actions: [
                      { label: "Edit client", icon: "create-outline", onPress: () => router.push(`/(app)/clients/new?id=${item.id}`) },
                      {
                        label: item.photo_path ? "Change photo" : "Add photo",
                        icon: "camera-outline",
                        onPress: () => setTimeout(() => changePhoto(item), 400),
                      },
                      { label: "New case", icon: "add-circle-outline", onPress: () => router.push(`/(app)/cases/new?clientId=${item.id}`) },
                    ],
                  })
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                }}
              >
                <ClientAvatar name={item.full_name} photoPath={item.photo_path} clientType={item.client_type} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.full_name}
                  </Text>
                  {item.phone ? <Text style={[typography.caption, { color: colors.textSecondary }]}>{item.phone}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end", maxWidth: "45%", gap: 4 }}>
                  {shown ? (
                    <>
                      <Text style={[typography.bodyStrong, { color: colors.brand, textAlign: "right" }]} numberOfLines={1}>
                        {shown.title}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {shown.court ? <Badge label={shown.court} tone="neutral" /> : null}
                        {more > 0 ? <Text style={[typography.caption, { color: colors.textSecondary }]}>+{more} more</Text> : null}
                      </View>
                    </>
                  ) : (
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>No cases yet</Text>
                  )}
                </View>
                <Pressable
                  onPress={() => router.push(`/(app)/clients/new?id=${item.id}`)}
                  hitSlop={8}
                  accessibilityLabel={`Edit ${item.full_name}`}
                  style={({ pressed }) => ({
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed ? colors.border : colors.surfaceAlt,
                  })}
                >
                  <Ionicons name="create-outline" size={18} color={colors.brand} />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
      </View>

      <ActionSheet
        visible={!!clientMenu}
        title={clientMenu?.title}
        actions={clientMenu?.actions ?? []}
        onClose={() => setClientMenu(null)}
      />
    </SafeAreaView>
  );
}
