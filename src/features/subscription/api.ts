import { supabase } from "@/shared/lib/supabase";

/** Clients allowed on the free plan — must match the clients_free_plan_limit
 * trigger (migration 0086), which is what actually enforces it. */
export const FREE_CLIENT_LIMIT = 5;

export type PlanName = "trial" | "free" | "paid";
export type MyPlan = {
  plan: PlanName;
  trialEndsAt: string;
  /** End of the period already paid for, if they've ever subscribed. */
  paidUntil: string | null;
  /** Razorpay's status of their latest subscription, if any. */
  status: string | null;
};

export async function getMyPlan(): Promise<MyPlan> {
  const { data, error } = await supabase.rpc("my_plan").single<{ plan: PlanName; trial_ends_at: string; paid_until: string | null; status: string | null }>();
  if (error || !data) throw new Error(error?.message ?? "No plan");
  return { plan: data.plan, trialEndsAt: data.trial_ends_at, paidUntil: data.paid_until, status: data.status };
}

/** True when the error came from the free plan's client limit trigger. */
export function isClientLimitError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("FREE_PLAN_CLIENT_LIMIT");
}

export async function countMyClients(): Promise<number> {
  const { count, error } = await supabase.from("clients").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function callSubscription<T>(action: "plan" | "create" | "cancel"): Promise<T> {
  const { data, error } = await supabase.functions.invoke("razorpay-subscription", { body: { action } });
  if (error) {
    // The function's own message ("You already have an active subscription."
    // etc.) is written for the user; fall back to a generic one.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? "Couldn't reach the payment service. Please try again.");
  }
  return data as T;
}

export function getPlanPrice() {
  return callSubscription<{ amount: number; currency: string; period: string; interval: number }>("plan");
}

export function createSubscription() {
  return callSubscription<{ subscriptionId: string; keyId: string; email: string | null }>("create");
}

export function cancelSubscription() {
  return callSubscription<{ ok: true }>("cancel");
}
