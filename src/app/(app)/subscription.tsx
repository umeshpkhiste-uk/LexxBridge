import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { cancelSubscription, countMyClients, FREE_CLIENT_LIMIT, getMyPlan, getPlanPrice, MyPlan } from "@/features/subscription/api";
import { openCheckout } from "@/features/subscription/checkout";
import { alertMessage, confirmAlert } from "@/shared/lib/alert";
import { formatINR } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { ErrorNotice } from "@/shared/ui/ErrorNotice";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { useTheme } from "@/shared/ui/theme";

const formatDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

const PAID_FEATURES = [
  "Unlimited clients",
  "Payment reminders with your UPI link",
  "Fee statements by WhatsApp, email, SMS and PDF",
  "Everything else in LexxBridge",
];

/** Profile → Plan & Subscription: what plan you're on, and subscribe / cancel. */
export default function SubscriptionScreen() {
  const { colors, spacing, typography } = useTheme();
  const [plan, setPlan] = useState<MyPlan | null>(null);
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activating, setActivating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, count] = await Promise.all([getMyPlan(), countMyClients()]);
      setPlan(p);
      setClientCount(count);
      setError(null);
      return p;
    } catch {
      setError("Couldn't load your plan. Please try again.");
      return null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      getPlanPrice()
        .then((p) => setPrice(p.amount))
        .catch(() => setPrice(null));
    }, [load]),
  );

  const subscribe = async () => {
    setBusy(true);
    try {
      const result = await openCheckout();
      if (result !== "paid") return;
      // The payment is done; the plan turns "paid" once Razorpay's webhook
      // reaches the server — usually a few seconds.
      setActivating(true);
      for (let i = 0; i < 15; i++) {
        const p = await load();
        if (p?.plan === "paid") {
          alertMessage("You're subscribed", "Thank you! Unlimited clients and every feature are now unlocked.");
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      alertMessage("Payment received", "Your subscription is being activated — this can take a minute. Check this page again shortly.");
    } catch (err) {
      alertMessage("Couldn't subscribe", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
      setActivating(false);
    }
  };

  const cancel = () => {
    confirmAlert(
      "Cancel subscription?",
      plan?.paidUntil
        ? `You won't be charged again. Everything stays unlocked until ${formatDay(plan.paidUntil)}, then your account moves to the free plan. Your data stays.`
        : "You won't be charged again. Your data stays.",
      [
        { text: "Keep subscription", style: "cancel" },
        {
          text: "Cancel subscription",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await cancelSubscription();
              // Wait briefly for the webhook so the page shows the new state.
              for (let i = 0; i < 5; i++) {
                const p = await load();
                if (p?.status === "cancelled") break;
                await new Promise((r) => setTimeout(r, 2000));
              }
            } catch (err) {
              alertMessage("Couldn't cancel", err instanceof Error ? err.message : "Please try again.");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  if (!plan) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        {error ? <ErrorNotice message={error} /> : <ActivityIndicator color={colors.brand} />}
      </ScreenContainer>
    );
  }

  const cancelled = plan.plan === "paid" && plan.status === "cancelled";
  const card = { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm };

  return (
    <ScreenContainer scroll>
      {error ? <ErrorNotice message={error} style={{ marginBottom: spacing.md }} /> : null}

      <View style={[card, { marginBottom: spacing.lg }]}>
        {plan.plan === "paid" ? (
          <>
            <Badge label={cancelled ? "Monthly plan · cancelled" : "Monthly plan"} tone={cancelled ? "warning" : "success"} />
            <Text style={[typography.body, { color: colors.textPrimary }]}>
              {cancelled
                ? `Everything stays unlocked until ${plan.paidUntil ? formatDay(plan.paidUntil) : "the end of the paid month"}. After that, your account moves to the free plan.`
                : plan.paidUntil
                  ? `Unlimited clients and every feature. Renews on ${formatDay(plan.paidUntil)}.`
                  : "Unlimited clients and every feature."}
            </Text>
          </>
        ) : plan.plan === "trial" ? (
          <>
            <Badge label={`Free trial · ${daysLeft(plan.trialEndsAt)} days left`} tone="brand" />
            <Text style={[typography.body, { color: colors.textPrimary }]}>
              Everything is unlocked until {formatDay(plan.trialEndsAt)}. After that you move to the free plan — up to{" "}
              {FREE_CLIENT_LIMIT} clients — unless you subscribe. No card needed for the trial.
            </Text>
          </>
        ) : (
          <>
            <Badge label="Free plan" tone="neutral" />
            <Text style={[typography.body, { color: colors.textPrimary }]}>
              {clientCount ?? 0} of {FREE_CLIENT_LIMIT} clients used. Payment reminders and fee statements need the monthly plan. All
              your existing clients, cases and records stay available.
            </Text>
          </>
        )}
      </View>

      {plan.plan !== "paid" ? (
        <View style={[card, { marginBottom: spacing.lg }]}>
          <Text style={[typography.subtitle, { color: colors.textPrimary }]}>
            Monthly plan{price != null ? ` · ${formatINR(price)} / month` : ""}
          </Text>
          {PAID_FEATURES.map((f) => (
            <Text key={f} style={[typography.body, { color: colors.textSecondary }]}>
              ✓ {f}
            </Text>
          ))}
          <View style={{ marginTop: spacing.sm }}>
            {Platform.OS === "web" ? (
              <Button label={activating ? "Activating…" : "Subscribe monthly"} onPress={subscribe} loading={busy} />
            ) : (
              <Text style={[typography.body, { color: colors.textSecondary }]}>
                Subscribing in the phone app is coming soon. For now, subscribe on lexxbridge.app with the same account — it
                unlocks the phone app too.
              </Text>
            )}
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>
            Renews every month by UPI Autopay or card. Cancel anytime from this page.{" "}
            <Text style={{ color: colors.brand, fontWeight: "600" }} onPress={() => router.push("/legal/refund")}>
              Refund & Cancellation Policy
            </Text>
          </Text>
        </View>
      ) : null}

      {plan.plan === "paid" && !cancelled ? <Button label="Cancel subscription" variant="secondary" onPress={cancel} loading={busy} /> : null}
      {plan.plan === "paid" ? (
        <Text
          style={[typography.caption, { color: colors.brand, fontWeight: "600", textAlign: "center", marginTop: spacing.md }]}
          onPress={() => router.push("/legal/refund")}
        >
          Refund & Cancellation Policy
        </Text>
      ) : null}
    </ScreenContainer>
  );
}
