import { router } from "expo-router";
import { confirmAlert } from "@/shared/lib/alert";
import { countMyClients, FREE_CLIENT_LIMIT, getMyPlan } from "./api";

const goToSubscription = () => router.push("/(app)/subscription");

/** The popup shown when a free-plan advocate tries to add a 6th client. */
export function showClientLimitPopup() {
  confirmAlert(
    "Free plan limit reached",
    `You've added ${FREE_CLIENT_LIMIT} clients — the most the free plan allows. Subscribe to the monthly plan for unlimited clients and full use of every feature.`,
    [
      { text: "Not now", style: "cancel" },
      { text: "Subscribe", onPress: goToSubscription },
    ],
  );
}

/** Call before opening the new-client form. Shows the limit popup and
 * returns false when a free-plan advocate already has the maximum. Lets the
 * user through if the check itself fails — the database still enforces the
 * limit when the client is saved. */
export async function canAddClient(): Promise<boolean> {
  try {
    const { plan } = await getMyPlan();
    if (plan !== "free") return true;
    if ((await countMyClients()) < FREE_CLIENT_LIMIT) return true;
    showClientLimitPopup();
    return false;
  } catch {
    return true;
  }
}

/** Payment reminders and fee statements are part of the monthly plan (and
 * the trial). Returns false — after showing the popup unless `silent` — on
 * the free plan. Fails open: if the plan can't be checked, the feature works. */
export async function canUseMoneyTools(opts: { silent?: boolean } = {}): Promise<boolean> {
  try {
    const { plan } = await getMyPlan();
    if (plan !== "free") return true;
  } catch {
    return true;
  }
  if (!opts.silent) {
    confirmAlert(
      "Part of the monthly plan",
      "Payment reminders and fee statements (WhatsApp, email, SMS and PDF) are included in the monthly plan. Subscribe for unlimited clients and full use of every feature.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Subscribe", onPress: goToSubscription },
      ],
    );
  }
  return false;
}
