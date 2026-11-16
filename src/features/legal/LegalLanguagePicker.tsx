import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/shared/ui/theme";
import { LEGAL_LANGUAGES, LegalLanguage } from "./legalI18n";

/** English / हिन्दी / मराठी switch shown above the legal pages and on the
 * consent screen (DPDP Act §5(3), §6(3)). */
export function LegalLanguagePicker({ value, onChange }: { value: LegalLanguage; onChange: (lang: LegalLanguage) => void }) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel="Language">
      {LEGAL_LANGUAGES.map(({ code, label }) => {
        const selected = code === value;
        return (
          <Pressable
            key={code}
            onPress={() => onChange(code)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: selected ? colors.brand : colors.border,
              backgroundColor: selected ? colors.brand : colors.surface,
            }}
          >
            <Text style={[typography.caption, { color: selected ? colors.textInverse : colors.textPrimary, fontWeight: "600" }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
