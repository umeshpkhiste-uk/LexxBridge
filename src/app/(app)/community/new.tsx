import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { addCommunityMember, createCommunity, MAX_COMMUNITY_MEMBERS } from "@/features/community/api";
import { ConnectionRow, listMyConnections } from "@/features/network/api";
import { Avatar } from "@/features/network/NetworkCards";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

/** Create the advocate's one allowed community: a name, then pick members
 * from accepted connections only (max 50). */
export default function NewCommunityScreen() {
  const { colors, spacing, typography } = useTheme();
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    listMyConnections()
      .then((rows) => setConnections(rows.filter((r) => r.status === "accepted")))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your connections"))
      .finally(() => setIsLoading(false));
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMMUNITY_MEMBERS) next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Community name is required");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const community = await createCommunity(name);
      for (const id of selected) {
        await addCommunityMember(community.id, id);
      }
      router.replace(`/(app)/community/${community.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <TextField label="Community name *" placeholder="e.g. Delhi High Court Bar" value={name} onChangeText={setName} />

      <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
        Members ({selected.size}/{MAX_COMMUNITY_MEMBERS}) — from your accepted connections
      </Text>

      {isLoading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
      ) : connections.length === 0 ? (
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          {"You don't have any accepted connections yet — connect with colleagues first, then come back to add them here."}
        </Text>
      ) : (
        <View style={{ marginTop: spacing.sm, marginBottom: spacing.lg }}>
          {connections.map((c) => {
            const isSelected = selected.has(c.otherParty.id);
            const disabled = !isSelected && selected.size >= MAX_COMMUNITY_MEMBERS;
            return (
              <Pressable
                key={c.id}
                onPress={() => toggle(c.otherParty.id)}
                disabled={disabled}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  paddingVertical: spacing.sm,
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                <Avatar name={c.otherParty.full_name} photoUrl={c.otherParty.profile_photo_url} size={40} />
                <Text style={[typography.body, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                  {c.otherParty.full_name}
                </Text>
                <Ionicons
                  name={isSelected ? "checkbox" : "square-outline"}
                  size={22}
                  color={isSelected ? colors.brand : colors.textSecondary}
                />
              </Pressable>
            );
          })}
        </View>
      )}

      {error ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text> : null}

      <Button label="Create community" onPress={handleCreate} loading={isSubmitting} />
    </ScreenContainer>
  );
}
