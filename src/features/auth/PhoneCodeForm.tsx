import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { mobileError } from "@/shared/lib/validation";
import { Button } from "@/shared/ui/Button";
import { ErrorNotice } from "@/shared/ui/ErrorNotice";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";
import type { AuthResult } from "./api";
import { toE164 } from "./phone";

const CODE_LENGTH = 6;
/** Supabase refuses a second text to the same number sooner than this. */
const RESEND_SECONDS = 60;

type Props = {
  onSend: (phone: string) => Promise<AuthResult>;
  onVerify: (phone: string, code: string) => Promise<AuthResult>;
  onVerified?: () => void;
  /** Shown once a code has been asked for. */
  sentText: (phone: string) => string;
  verifyLabel: string;
};

/** Mobile number, then the 6-digit code texted to it. */
export function PhoneCodeForm({ onSend, onVerify, onVerified, sentText, verifyLabel }: Props) {
  const { colors, spacing, typography } = useTheme();
  const [input, setInput] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  // `busy` only disables after a re-render; this stops a double-tap sending
  // two texts or using up the code twice.
  const actingRef = useRef(false);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const run = async (action: () => Promise<AuthResult>): Promise<boolean> => {
    if (actingRef.current) return false;
    actingRef.current = true;
    setError(null);
    setBusy(true);
    try {
      const result = await action();
      setError(result.error);
      return !result.error;
    } finally {
      actingRef.current = false;
      setBusy(false);
    }
  };

  const send = async () => {
    const phone = toE164(input);
    if (!phone) return setError(mobileError(input) ?? "Enter your mobile number");
    if (await run(() => onSend(phone))) {
      setSentTo(phone);
      setCode("");
      setWait(RESEND_SECONDS);
    }
  };

  const verify = async () => {
    if (!sentTo) return;
    if (code.length !== CODE_LENGTH) return setError(`Enter the ${CODE_LENGTH}-digit code`);
    if (await run(() => onVerify(sentTo, code))) onVerified?.();
    else setCode("");
  };

  const notice = error ? <ErrorNotice message={error} style={{ paddingHorizontal: 0 }} /> : null;

  if (!sentTo) {
    return (
      <View>
        <TextField
          label="Mobile number"
          placeholder="98765 43210"
          keyboardType="phone-pad"
          autoComplete="tel"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={send}
        />
        {notice}
        <Button label="Send code" onPress={send} loading={busy} />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.body, { color: colors.textSecondary }]}>{sentText(sentTo)}</Text>
      <TextField
        label={`${CODE_LENGTH}-digit code`}
        placeholder="000000"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={CODE_LENGTH}
        autoFocus
        value={code}
        onChangeText={(text) => setCode(text.replace(/\D/g, ""))}
        onSubmitEditing={verify}
      />
      {notice}
      <Button label={verifyLabel} onPress={verify} loading={busy} />
      <Button label={wait > 0 ? `Resend code in ${wait}s` : "Resend code"} variant="ghost" onPress={send} disabled={wait > 0 || busy} />
      <Button
        label="Use a different number"
        variant="ghost"
        disabled={busy}
        onPress={() => {
          setSentTo(null);
          setError(null);
          setWait(0);
        }}
      />
    </View>
  );
}
