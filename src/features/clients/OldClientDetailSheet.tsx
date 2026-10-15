import { Ionicons } from "@expo/vector-icons";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { downloadCaseHandoverPdf } from "@/features/cases/caseHandover";
import { Badge } from "@/shared/ui/Badge";
import { useTheme } from "@/shared/ui/theme";
import { ClientListItem } from "./api";
import { ClientAvatar } from "./ClientAvatar";

type Props = { client: ClientListItem; onClose: () => void };

function formatDay(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Full detail popup for an "old" client (every case discontinued) — contact
 * info, both notes fields, and a per-case "Download case summary" report.
 * Opened in place of the normal navigate-to-case behaviour for old clients. */
export function OldClientDetailSheet({ client, onClose }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingHorizontal: spacing.md,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
            maxHeight: "85%",
          }}
        >
          <View style={styles.header}>
            <ClientAvatar name={client.full_name} photoPath={client.photo_path} clientType={client.client_type} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={[typography.subtitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {client.full_name}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Old client</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ marginTop: spacing.md }} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}>
            {client.phone || client.email || client.address ? (
              <View style={{ gap: spacing.xs }}>
                {client.phone ? (
                  <Pressable onPress={() => Linking.openURL(`tel:${client.phone}`)} style={styles.row}>
                    <Ionicons name="call-outline" size={16} color={colors.brand} />
                    <Text style={[typography.body, { color: colors.textPrimary }]}>{client.phone}</Text>
                  </Pressable>
                ) : null}
                {client.email ? (
                  <View style={styles.row}>
                    <Ionicons name="mail-outline" size={16} color={colors.textSecondary} />
                    <Text style={[typography.body, { color: colors.textPrimary }]}>{client.email}</Text>
                  </View>
                ) : null}
                {client.address ? (
                  <View style={styles.row}>
                    <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                    <Text style={[typography.body, { color: colors.textPrimary, flex: 1 }]}>{client.address}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {client.notes ? (
              <View>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Notes</Text>
                <Text style={[typography.body, { color: colors.textPrimary }]}>{client.notes}</Text>
              </View>
            ) : null}

            {client.private_notes ? (
              <View>
                <View style={[styles.row, { marginBottom: 2 }]}>
                  <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Private notes</Text>
                </View>
                <Text style={[typography.body, { color: colors.textPrimary }]}>{client.private_notes}</Text>
              </View>
            ) : null}

            <View>
              <Text style={[typography.subtitle, { color: colors.textPrimary, marginBottom: spacing.sm }]}>Past cases</Text>
              <View style={{ gap: spacing.sm }}>
                {client.cases.map((c) => (
                  <View key={c.id} style={{ backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
                      <Text style={[typography.bodyStrong, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                        {c.title}
                      </Text>
                      <Pressable
                        onPress={() => downloadCaseHandoverPdf(c.id)}
                        hitSlop={8}
                        accessibilityLabel={`Download case summary for ${c.title}`}
                        style={({ pressed }) => ({
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: pressed ? colors.border : colors.surfaceAlt,
                        })}
                      >
                        <Ionicons name="document-outline" size={16} color={colors.brand} />
                      </Pressable>
                    </View>
                    {c.court ? <Badge label={c.court} tone="neutral" /> : null}
                    {c.discontinued_at ? (
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>
                        Discontinued {formatDay(c.discontinued_at)}
                        {c.discontinuation_reason ? ` — ${c.discontinuation_reason}` : ""}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.4)" },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
