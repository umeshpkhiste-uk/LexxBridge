import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { clearAppLock, getAppLockInfo, setAppLock, verifyAppLock } from "@/features/applock/appLock";
import { PatternGrid } from "@/features/applock/PatternGrid";
import { PinPad } from "@/features/applock/PinPad";
import { encodePattern, LockMethod, patternError, PIN_LENGTH, pinError } from "@/features/applock/rules";
import { useAuth } from "@/features/auth/AuthProvider";
import { alertMessage } from "@/shared/lib/alert";
import { Button } from "@/shared/ui/Button";
import { SettingsGroup, SettingsRow } from "@/shared/ui/SettingsGroup";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { LoadState } from "@/shared/ui/LoadState";
import { useTheme } from "@/shared/ui/theme";

type Step =
  | { kind: "menu" }
  | { kind: "verify"; then: "change-pin" | "change-pattern" | "off" }
  | { kind: "enter"; method: LockMethod }
  | { kind: "confirm"; method: LockMethod; first: string };

/** Settings → App lock: turn on, change or turn off a PIN / pattern lock. */
export default function AppLockScreen() {
  const { colors, spacing, typography } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [current, setCurrent] = useState<{ method: LockMethod; pinLength?: number } | null | undefined>(undefined);
  const [step, setStep] = useState<Step>({ kind: "menu" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    getAppLockInfo(userId)
      .then(setCurrent)
      .catch((err) => setLoadError(friendlyErrorMessage(err)));
  }, [userId, attempt]);

  const retryLoad = () => {
    setLoadError(null);
    setAttempt((n) => n + 1);
  };

  const go = (next: Step) => {
    setStep(next);
    setPin("");
    setMessage(null);
  };

  const afterVerify = async (then: "change-pin" | "change-pattern" | "off") => {
    if (!userId) return;
    if (then === "off") {
      await clearAppLock(userId);
      setCurrent(null);
      go({ kind: "menu" });
      alertMessage("App lock turned off");
      return;
    }
    go({ kind: "enter", method: then === "change-pin" ? "pin" : "pattern" });
  };

  // One handler for every PIN / pattern entry, depending on the step.
  const submit = async (secret: string, problem: string | null) => {
    if (!userId) return;
    if (step.kind === "verify") {
      const result = await verifyAppLock(userId, secret);
      if (result.ok) return afterVerify(step.then);
      setPin("");
      if (result.attemptsLeft <= 0) {
        setMessage("Too many wrong attempts.");
        setTimeout(() => router.back(), 1200);
      } else setMessage(`That's not your current ${current?.method === "pattern" ? "pattern" : "PIN"}. ${result.attemptsLeft} tries left.`);
      return;
    }
    if (step.kind === "enter") {
      if (problem) {
        setPin("");
        return setMessage(problem);
      }
      return go({ kind: "confirm", method: step.method, first: secret });
    }
    if (step.kind === "confirm") {
      if (secret !== step.first) {
        setPin("");
        return setMessage(`Didn't match. ${step.method === "pin" ? "Enter the PIN" : "Draw the pattern"} again.`);
      }
      await setAppLock(userId, step.method, secret);
      setCurrent({ method: step.method, pinLength: step.method === "pin" ? secret.length : undefined });
      go({ kind: "menu" });
      alertMessage(
        step.method === "pin" ? "PIN set successfully" : "Pattern registered successfully",
        `LexxBridge will ask for your ${step.method === "pin" ? "PIN" : "pattern"} when you open the app.`,
      );
    }
  };

  if (current === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <LoadState error={loadError} onRetry={retryLoad} />
      </View>
    );
  }

  if (step.kind === "menu") {
    const choose = (method: LockMethod) => {
      if (!current) return go({ kind: "enter", method });
      go({ kind: "verify", then: method === "pin" ? "change-pin" : "change-pattern" });
    };
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}>
        <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
          <Ionicons name={current ? "lock-closed" : "lock-open-outline"} size={40} color={colors.brand} />
          <Text style={[typography.subtitle, { color: colors.textPrimary, marginTop: spacing.sm }]}>
            {current ? `App lock is on (${current.method === "pin" ? "PIN" : "Pattern"})` : "App lock is off"}
          </Text>
          <Text style={[typography.caption, { color: colors.textSecondary, textAlign: "center", marginTop: 4 }]}>
            Ask for a PIN or pattern every time LexxBridge is opened. Stored securely on this phone only.
          </Text>
        </View>

        <SettingsGroup title={current ? "Change" : "Choose a lock"}>
          <SettingsRow
            icon="keypad-outline"
            label={current?.method === "pin" ? "Change PIN" : "Use a PIN"}
            subtitle={`${PIN_LENGTH}-digit PIN`}
            onPress={() => choose("pin")}
          />
          <SettingsRow
            icon="apps-outline"
            label={current?.method === "pattern" ? "Change pattern" : "Use a pattern"}
            subtitle="Connect at least 4 dots"
            onPress={() => choose("pattern")}
          />
        </SettingsGroup>

        {current ? (
          <SettingsGroup>
            <SettingsRow icon="lock-open-outline" label="Turn off app lock" onPress={() => go({ kind: "verify", then: "off" })} destructive showChevron={false} />
          </SettingsGroup>
        ) : null}
      </ScrollView>
    );
  }

  const method = step.kind === "verify" ? (current?.method ?? "pin") : step.method;
  const title =
    step.kind === "verify"
      ? `Enter your current ${method === "pin" ? "PIN" : "pattern"}`
      : step.kind === "enter"
        ? method === "pin"
          ? `Choose a ${PIN_LENGTH}-digit PIN`
          : "Draw a pattern"
        : method === "pin"
          ? "Enter the same PIN again"
          : "Draw the pattern again";
  const hint =
    step.kind === "enter" ? (method === "pin" ? `Enter a ${PIN_LENGTH}-digit PIN. Avoid 123456 or 111111.` : "Connect at least 4 dots.") : " ";

  return (
    <View style={[styles.flow, { backgroundColor: colors.background, padding: spacing.lg }]}>
      <View style={{ alignItems: "center" }}>
        <Text style={[typography.title, { color: colors.textPrimary, textAlign: "center" }]}>{title}</Text>
        <Text style={[typography.body, { color: message ? colors.danger : colors.textSecondary, textAlign: "center", marginTop: spacing.xs }]}>
          {message ?? hint}
        </Text>
      </View>

      <View style={{ flex: 1, justifyContent: "center" }}>
        {method === "pin" ? (
          <PinPad
            value={pin}
            length={step.kind === "verify" ? (current?.pinLength ?? PIN_LENGTH) : PIN_LENGTH}
            error={!!message}
            onChange={(value) => {
              setMessage(null);
              setPin(value);
              // Submit on the last digit: verify, choose (then confirm) or confirm.
              const target = step.kind === "verify" ? (current?.pinLength ?? PIN_LENGTH) : PIN_LENGTH;
              if (value.length === target) submit(value, step.kind === "enter" ? pinError(value) : null);
            }}
          />
        ) : (
          <PatternGrid error={!!message} onComplete={(dots) => submit(encodePattern(dots), patternError(dots))} />
        )}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button label="Cancel" variant="ghost" onPress={() => go({ kind: "menu" })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  flow: { flex: 1 },
});
