import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTheme } from "@/shared/ui/theme";
import { LegalLanguagePicker } from "./LegalLanguagePicker";
import { defaultLegalLanguage, LEGAL_LANGUAGES, LEGAL_UI, LegalDoc, LegalLanguage, legalSections } from "./legalI18n";

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { colors, spacing, radius, typography } = useTheme();
  // ?lang=hi / ?lang=mr opens a specific translation (the consent screen
  // links this way); otherwise follow the app's language.
  const { lang } = useLocalSearchParams<{ lang?: string }>();
  const [language, setLanguage] = useState<LegalLanguage>(() =>
    LEGAL_LANGUAGES.some((l) => l.code === lang) ? (lang as LegalLanguage) : defaultLegalLanguage(),
  );
  const ui = LEGAL_UI[language];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
    >
      <View style={{ marginBottom: spacing.md }}>
        <LegalLanguagePicker value={language} onChange={setLanguage} />
      </View>
      <Text style={[typography.title, { color: colors.textPrimary }]}>{ui.titles[doc]}</Text>
      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg }]}>
        {ui.lastUpdated}: {ui.updatedDate}
      </Text>
      {ui.prevails ? (
        <Text
          style={[
            typography.caption,
            { color: colors.textSecondary, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.lg },
          ]}
        >
          {ui.prevails}
        </Text>
      ) : null}
      {legalSections(doc, language).map((section) => (
        <View key={section.heading} style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.subtitle, { color: colors.textPrimary, marginBottom: spacing.xs }]}>{section.heading}</Text>
          {section.paragraphs.map((p, i) => (
            <Text key={i} style={[typography.body, { color: colors.textSecondary, marginTop: i > 0 ? spacing.xs : 0 }]}>
              {p}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
