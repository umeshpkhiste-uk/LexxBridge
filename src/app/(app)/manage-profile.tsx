import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { AdvocateProfile, getMyProfile, updateMyProfile } from "@/features/profile/api";
import { alertMessage, confirmAlert } from "@/shared/lib/alert";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { useTheme } from "@/shared/ui/theme";

type Visibility = AdvocateProfile["profile_visibility"];

const OPTIONS: { value: Visibility; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "public", label: "Public", description: "Any advocate can find your profile in Network search.", icon: "earth-outline" },
  {
    value: "connections_only",
    label: "Connections only",
    description: "Only advocates you're already connected with can find your profile.",
    icon: "people-outline",
  },
  { value: "private", label: "Private", description: "Your profile is hidden from Network search entirely.", icon: "lock-closed-outline" },
];

/** Profile → Manage profile: who can find this advocate in Network search. */
export default function ManageProfileScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const [selected, setSelected] = useState<Visibility | null>(null);
  const [saving, setSaving] = useState<Visibility | null>(null);

  useEffect(() => {
    getMyProfile()
      .then((profile) => setSelected(profile.profile_visibility))
      .catch(() => {});
  }, []);

  const choose = (value: Visibility) => {
    if (value === selected || saving) return;
    const option = OPTIONS.find((o) => o.value === value)!;
    confirmAlert("Change profile visibility?", `Set your profile to "${option.label}" — ${option.description.toLowerCase()}`, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: () => applyVisibility(value) },
    ]);
  };

  const applyVisibility = async (value: Visibility) => {
    const previous = selected;
    setSelected(value);
    setSaving(value);
    try {
      await updateMyProfile({ profile_visibility: value });
    } catch (err) {
      setSelected(previous);
      alertMessage("Couldn't update visibility", friendlyErrorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <ScreenContainer scroll>
      <Stack.Screen options={{ title: "Manage profile" }} />
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md }]}>
        Choose who can find your profile in Network search.
      </Text>

      {selected === null ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden" }}>
          {OPTIONS.map((option, i) => (
            <Pressable
              key={option.value}
              onPress={() => choose(option.value)}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 14,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceAlt : "transparent",
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: selected === option.value }}
            >
              <Ionicons name={option.icon} size={22} color={colors.textSecondary} style={{ width: 28 }} />
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, { color: colors.textPrimary, fontWeight: "500" }]}>{option.label}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>{option.description}</Text>
              </View>
              {saving === option.value ? (
                <ActivityIndicator color={colors.brand} />
              ) : selected === option.value ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
