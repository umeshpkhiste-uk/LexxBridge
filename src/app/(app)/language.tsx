import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { getMyProfile } from "@/features/profile/api";
import { changeAppLanguage, currentLanguageCode } from "@/shared/i18n/i18n";
import { codeForLanguageName, LanguageCode, SUPPORTED_LANGUAGES } from "@/shared/i18n/languages";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { LoadState } from "@/shared/ui/LoadState";
import { useTheme } from "@/shared/ui/theme";

/**
 * The app's display language, restricted to languages the advocate listed
 * on their own profile — the same free-text field used to say which
 * languages they practise in.
 */
export default function LanguageScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius, typography } = useTheme();
  const [available, setAvailable] = useState<{ code: LanguageCode; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<LanguageCode>(currentLanguageCode());

  useEffect(() => {
    getMyProfile()
      .then((profile) => {
        const codes = new Set(profile.languages.map(codeForLanguageName).filter((c): c is LanguageCode => !!c));
        setAvailable(SUPPORTED_LANGUAGES.filter((l) => codes.has(l.code)));
      })
      .catch((err) => setError(friendlyErrorMessage(err)));
  }, [attempt]);

  const retryLoad = () => {
    setError(null);
    setAttempt((n) => n + 1);
  };

  const choose = (code: LanguageCode) => {
    setSelected(code);
    changeAppLanguage(code);
  };

  return (
    <ScreenContainer scroll>
      <Stack.Screen options={{ title: t("language.title") }} />
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md }]}>{t("language.subtitle")}</Text>

      {available === null ? (
        <LoadState error={error} onRetry={retryLoad} />
      ) : available.length === 0 ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs }}>
          <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{t("language.noneAvailable")}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>{t("language.addInProfile")}</Text>
        </View>
      ) : (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden" }}>
          {available.map((lang, i) => (
            <Pressable
              key={lang.code}
              onPress={() => choose(lang.code)}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: spacing.md,
                  paddingVertical: 14,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceAlt : "transparent",
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: selected === lang.code }}
            >
              <Text style={[typography.body, { color: colors.textPrimary }]}>{lang.name}</Text>
              {selected === lang.code ? <Ionicons name="checkmark-circle" size={22} color={colors.brand} /> : null}
            </Pressable>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
