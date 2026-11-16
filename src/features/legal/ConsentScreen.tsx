import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { signOut } from "@/features/auth/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { CURRENT_POLICY_VERSION, recordConsent } from "@/features/legal/consent";
import { supabase } from "@/shared/lib/supabase";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { useTheme } from "@/shared/ui/theme";
import { LegalLanguagePicker } from "./LegalLanguagePicker";
import { defaultLegalLanguage, LegalLanguage } from "./legalI18n";

const COPY: Record<
  LegalLanguage,
  {
    title: string;
    updatedTitle: string;
    intro: string;
    updatedIntro: string;
    points: string[];
    age: string;
    /** Text before, between and after the two document links. */
    agree: [string, string, string];
    terms: string;
    privacy: string;
    accept: string;
    decline: string;
    saveError: string;
  }
> = {
  en: {
    title: "Before you continue",
    updatedTitle: "We've updated our Terms and Privacy Policy",
    intro: "Please review how LexxBridge uses your personal data and confirm to continue.",
    updatedIntro: "Please review the updated documents and confirm to keep using LexxBridge.",
    points: [
      "We use your profile, practice records and messages only to run LexxBridge for you — never for ads, and we never sell your data.",
      "Your clients, cases, documents and payments are private to your account. Messages are end-to-end encrypted.",
      "You can export your data, correct it, or delete your account at any time from Settings.",
      "For any concern, contact our Grievance Officer (details in the Privacy Policy). You may also complain to the Data Protection Board of India.",
    ],
    age: "I confirm I am 18 years of age or older.",
    agree: ["I have read and agree to the ", " and ", "."],
    terms: "Terms & Conditions",
    privacy: "Privacy Policy",
    accept: "Agree and continue",
    decline: "Decline and sign out",
    saveError: "Couldn't save your consent. Please check your connection and try again.",
  },
  hi: {
    title: "आगे बढ़ने से पहले",
    updatedTitle: "हमने अपनी शर्तें और गोपनीयता नीति अद्यतन की हैं",
    intro: "कृपया देखें कि LexxBridge आपके व्यक्तिगत डेटा का उपयोग कैसे करता है, और आगे बढ़ने के लिए पुष्टि करें।",
    updatedIntro: "कृपया अद्यतन दस्तावेज़ देखें और LexxBridge का उपयोग जारी रखने के लिए पुष्टि करें।",
    points: [
      "हम आपकी प्रोफ़ाइल, प्रैक्टिस के रिकॉर्ड और संदेशों का उपयोग केवल आपके लिए LexxBridge चलाने में करते हैं — विज्ञापनों के लिए कभी नहीं, और हम आपका डेटा कभी नहीं बेचते।",
      "आपके क्लाइंट, केस, दस्तावेज़ और भुगतान केवल आपके खाते तक सीमित हैं। संदेश एंड-टू-एंड एन्क्रिप्टेड हैं।",
      "आप सेटिंग्स से कभी भी अपना डेटा निर्यात कर सकते हैं, उसे सुधार सकते हैं, या अपना खाता हटा सकते हैं।",
      "किसी भी चिंता के लिए हमारे शिकायत अधिकारी से संपर्क करें (विवरण गोपनीयता नीति में है)। आप भारतीय डेटा संरक्षण बोर्ड में भी शिकायत कर सकते हैं।",
    ],
    age: "मैं पुष्टि करता/करती हूँ कि मेरी आयु 18 वर्ष या उससे अधिक है।",
    agree: ["मैंने ", " और ", " पढ़ ली हैं और मैं उनसे सहमत हूँ।"],
    terms: "नियम व शर्तें",
    privacy: "गोपनीयता नीति",
    accept: "सहमत हूँ, आगे बढ़ें",
    decline: "अस्वीकार करें और साइन आउट करें",
    saveError: "आपकी सहमति सहेजी नहीं जा सकी। कृपया अपना कनेक्शन जाँचें और फिर से प्रयास करें।",
  },
  mr: {
    title: "पुढे जाण्यापूर्वी",
    updatedTitle: "आम्ही आमच्या अटी आणि गोपनीयता धोरण अद्ययावत केले आहे",
    intro: "LexxBridge तुमचा वैयक्तिक डेटा कसा वापरते ते कृपया पाहा, आणि पुढे जाण्यासाठी पुष्टी करा.",
    updatedIntro: "कृपया अद्ययावत दस्तऐवज पाहा आणि LexxBridge वापरणे सुरू ठेवण्यासाठी पुष्टी करा.",
    points: [
      "आम्ही तुमचे प्रोफाइल, प्रॅक्टिसच्या नोंदी आणि संदेश फक्त तुमच्यासाठी LexxBridge चालवण्यासाठी वापरतो — जाहिरातींसाठी कधीही नाही, आणि आम्ही तुमचा डेटा कधीही विकत नाही.",
      "तुमचे क्लायंट, केस, दस्तऐवज आणि पेमेंट फक्त तुमच्या खात्यापुरते मर्यादित आहेत. संदेश एंड-टू-एंड एन्क्रिप्टेड आहेत.",
      "तुम्ही सेटिंग्जमधून कधीही तुमचा डेटा निर्यात करू शकता, दुरुस्त करू शकता, किंवा तुमचे खाते हटवू शकता.",
      "कोणत्याही अडचणीसाठी आमच्या तक्रार अधिकाऱ्याशी संपर्क साधा (तपशील गोपनीयता धोरणात आहे). तुम्ही भारतीय डेटा संरक्षण मंडळाकडेही तक्रार करू शकता.",
    ],
    age: "माझे वय 18 वर्षे किंवा त्याहून अधिक असल्याची मी पुष्टी करतो/करते.",
    agree: ["मी ", " आणि ", " वाचले असून मला ते मान्य आहेत."],
    terms: "नियम व अटी",
    privacy: "गोपनीयता धोरण",
    accept: "मान्य आहे, पुढे जा",
    decline: "नाकारा आणि साइन आउट करा",
    saveError: "तुमची संमती जतन करता आली नाही. कृपया तुमचे कनेक्शन तपासा आणि पुन्हा प्रयत्न करा.",
  },
};

/** Shown after sign-in whenever the user hasn't accepted the current Terms
 * + Privacy Policy version: accounts made with Google/Apple (which skip the
 * sign-up form), accounts created before consent was recorded, and everyone
 * again after a policy update (DPDP Act §5–6). Both boxes start unticked —
 * consent has to be a clear affirmative action. Declining signs out.
 *
 * Rendered by the root layout in place of the navigator (like the app-lock
 * screen), not as a route: as a protected route, Expo Router's fallback
 * kept bouncing to /legal/terms. So the documents open in a browser tab /
 * in-app browser sheet instead of being pushed onto a stack. */
export function ConsentScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const { session, markConsented } = useAuth();
  const [isAdult, setIsAdult] = useState(false);
  const [agrees, setAgrees] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Accepted an earlier version before → word this as a policy update.
  const [isUpdate, setIsUpdate] = useState(false);
  // DPDP Act §6(3): the consent request in English or an Eighth Schedule language.
  const [language, setLanguage] = useState<LegalLanguage>(defaultLegalLanguage);
  const copy = COPY[language];

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_consents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .neq("policy_version", CURRENT_POLICY_VERSION)
      .then(({ count }) => setIsUpdate(!!count));
  }, [userId]);

  const accept = async () => {
    if (!userId) return;
    setError(null);
    setIsSaving(true);
    const { error: saveError } = await recordConsent(userId, "prompt");
    setIsSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    markConsented();
  };

  const checkbox = (checked: boolean, onToggle: () => void, label: React.ReactNode) => (
    <Pressable onPress={onToggle} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked }} style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
      <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={checked ? colors.brand : colors.textSecondary} />
      <Text style={[typography.body, { color: colors.textPrimary, flex: 1 }]}>{label}</Text>
    </Pressable>
  );

  const link = (path: "/legal/terms" | "/legal/privacy", label: string) => (
    <Text
      style={{ color: colors.accent, fontWeight: "600" }}
      accessibilityRole="link"
      onPress={() => {
        // Open the document in the language chosen here.
        const target = `${path}?lang=${language}`;
        if (Platform.OS === "web") window.open(target, "_blank", "noopener");
        else WebBrowser.openBrowserAsync(`https://lexxbridge.app${target}`);
      }}
    >
      {label}
    </Text>
  );

  return (
    <ScreenContainer scroll>
      <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
        <LegalLanguagePicker value={language} onChange={setLanguage} />
        <Ionicons name="shield-checkmark-outline" size={40} color={colors.brand} />
        <Text style={[typography.title, { color: colors.textPrimary }]}>{isUpdate ? copy.updatedTitle : copy.title}</Text>
        <Text style={[typography.body, { color: colors.textSecondary }]}>{isUpdate ? copy.updatedIntro : copy.intro}</Text>

        <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
          {copy.points.map((point) => (
            <View key={point} style={{ flexDirection: "row", gap: spacing.sm }}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.brand} style={{ marginTop: 2 }} />
              <Text style={[typography.caption, { color: colors.textPrimary, flex: 1 }]}>{point}</Text>
            </View>
          ))}
        </View>

        {checkbox(isAdult, () => setIsAdult((v) => !v), copy.age)}
        {checkbox(
          agrees,
          () => setAgrees((v) => !v),
          <>
            {copy.agree[0]}
            {link("/legal/terms", copy.terms)}
            {copy.agree[1]}
            {link("/legal/privacy", copy.privacy)}
            {copy.agree[2]}
          </>,
        )}

        {error ? <Text style={[typography.caption, { color: colors.danger }]}>{copy.saveError}</Text> : null}

        <Button label={copy.accept} onPress={accept} loading={isSaving} disabled={!isAdult || !agrees} pill />
        <Button label={copy.decline} variant="secondary" onPress={() => signOut()} pill />
      </View>
    </ScreenContainer>
  );
}
