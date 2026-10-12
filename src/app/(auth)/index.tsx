import { Ionicons } from "@expo/vector-icons";
import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getEnabledProviders, signInWithProvider, SOCIAL_LABEL, SocialProvider } from "@/features/auth/socialLogin";
import { SignInForm } from "@/features/auth/SignInForm";
import { getLastLockedAccountMethod } from "@/features/applock/appLock";
import { getSavedLoginUser } from "@/features/biometric/biometric";
import { BiometricLoginButton } from "@/features/biometric/BiometricLoginButton";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { AppLogo } from "@/shared/ui/AppLogo";
import { useAppWidth } from "@/shared/ui/appFrame";
import { useTheme } from "@/shared/ui/theme";

const SLIDES = [
  { title: "LexxBridge", body: "Create an account to start your practice journey" },
  { title: "Grow your network", body: "Connect with advocates, chambers and firms across the bar" },
  { title: "Run your practice", body: "Track matters, hearings and clients in one place" },
  { title: "Stay on schedule", body: "Never miss a date with your hearing calendar" },
];

const SOCIAL: { provider: SocialProvider; icon: keyof typeof Ionicons.glyphMap; color?: string }[] = [
  { provider: "google", icon: "logo-google", color: "#EA4335" },
  { provider: "facebook", icon: "logo-facebook", color: "#1877F2" },
  { provider: "apple", icon: "logo-apple" },
];

export default function WelcomeScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const { justSignedUp } = useLocalSearchParams<{ justSignedUp?: string }>();
  // Phone width, or the app's centred column on the web.
  const width = useAppWidth();
  const [page, setPage] = useState(0);
  // ScreenContainer pads the content by spacing.lg on each side.
  const slideWidth = width - spacing.lg * 2;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
    if (next !== page) setPage(next);
  };

  const [enabled, setEnabled] = useState<Record<SocialProvider, boolean> | null>(null);
  const [busy, setBusy] = useState<SocialProvider | null>(null);

  // A PIN / pattern is set on this phone but there's no saved sign-in for it
  // to unlock (e.g. the session ended): explain that one password login
  // brings the PIN back.
  const [lockHint, setLockHint] = useState<"pin" | "pattern" | null>(null);

  useEffect(() => {
    getEnabledProviders().then(setEnabled);
    Promise.all([getLastLockedAccountMethod(), getSavedLoginUser()])
      .then(([method, savedUser]) => setLockHint(method && !savedUser ? method : null))
      .catch(() => {});
  }, []);

  const onSocial = async (provider: SocialProvider) => {
    const label = SOCIAL_LABEL[provider];
    // Re-check in case it was switched on after this screen loaded.
    const current = enabled?.[provider] ? enabled : await getEnabledProviders();
    setEnabled(current);
    if (!current[provider]) {
      Alert.alert(`${label} sign-in unavailable`, `${label} sign-in isn't available yet. Please continue with your email for now.`);
      return;
    }
    setBusy(provider);
    try {
      const result = await signInWithProvider(provider);
      // On success the auth listener switches the app to the signed-in screens.
      if (result.status === "error") Alert.alert(`Couldn't sign in with ${label}`, result.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScreenContainer scroll style={styles.container}>
      <View style={styles.hero}>
        <View style={{ marginBottom: spacing.lg }}>
          <AppLogo size={112} />
        </View>
        {/* Exactly one slide wide: inside the centred column a horizontal
            ScrollView would otherwise grow to fit all slides (on the web it
            then showed the gap between two slides). */}
        <ScrollView
          horizontal
          pagingEnabled
          style={{ width: slideWidth, flexGrow: 0 }}
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {SLIDES.map((slide) => (
            <View key={slide.title} style={[styles.slide, { width: slideWidth }]}>
              <Text style={[typography.display, { color: colors.textPrimary, textAlign: "center" }]}>{slide.title}</Text>
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.sm, maxWidth: 240 }]}>
                {slide.body}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Page indicator right under the slides; the current page is a pill. */}
        <View style={[styles.dots, { marginTop: spacing.lg }]} accessibilityLabel={`Slide ${page + 1} of ${SLIDES.length}`}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.title}
              style={[
                styles.dot,
                {
                  width: i === page ? 22 : 7,
                  backgroundColor: i === page ? colors.brand : colors.border,
                  borderRadius: radius.pill,
                },
              ]}
            />
          ))}
        </View>

        <View style={[styles.swipeHint, { marginTop: spacing.md }]}>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Swipe to learn more</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
        </View>
      </View>

      <View style={{ gap: spacing.md }}>
        <BiometricLoginButton />
        {lockHint ? (
          <View style={[styles.lockHint, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.brand} />
            <Text style={[typography.caption, { color: colors.textSecondary, flex: 1 }]}>
              Your {lockHint === "pin" ? "PIN" : "pattern"} is set on this phone. Log in once with your password and LexxBridge will ask for
              your {lockHint === "pin" ? "PIN" : "pattern"} from then on.
            </Text>
          </View>
        ) : null}
        {justSignedUp ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: spacing.sm,
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.lg,
              padding: spacing.md,
            }}
          >
            <Ionicons name="mail-outline" size={20} color={colors.brand} />
            <Text style={[typography.caption, { color: colors.textPrimary, flex: 1 }]}>
              Account created. We sent a confirmation link to your email — verify it, then sign in below.
            </Text>
          </View>
        ) : null}
        <SignInForm />

        <Link href="/(auth)/sign-up">
          <Text style={[typography.caption, { color: colors.textSecondary, textAlign: "center" }]}>
            Don&apos;t have an account? <Text style={{ color: colors.accent, fontWeight: "600" }}>Sign Up</Text>
          </Text>
        </Link>

        <View
          style={[
            styles.connectCard,
            {
              borderColor: colors.border,
              borderRadius: radius.lg,
              padding: spacing.md,
              marginTop: spacing.sm,
            },
          ]}
        >
          <Text style={[typography.body, { color: colors.textPrimary }]}>Connect with</Text>
          <View style={[styles.socialRow, { gap: spacing.md, marginTop: spacing.md }]}>
            {SOCIAL.map(({ provider, icon, color }) => (
              <Pressable
                key={provider}
                accessibilityLabel={`Continue with ${SOCIAL_LABEL[provider]}`}
                disabled={!!busy}
                onPress={() => onSocial(provider)}
                style={({ pressed }) => [
                  styles.socialButton,
                  { backgroundColor: colors.surface, borderRadius: radius.pill, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                {busy === provider ? (
                  <ActivityIndicator color={color ?? colors.textPrimary} />
                ) : (
                  <Ionicons name={icon} size={24} color={color ?? colors.textPrimary} />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: "space-between" },
  hero: { alignItems: "center", flexGrow: 1, justifyContent: "center" },
  slide: { alignItems: "center", justifyContent: "center" },
  swipeHint: { flexDirection: "row", alignItems: "center", gap: 4 },
  dots: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { height: 7 },
  connectCard: { alignItems: "center", borderWidth: StyleSheet.hairlineWidth * 2 },
  lockHint: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  socialRow: { flexDirection: "row", justifyContent: "center" },
  socialButton: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
});
