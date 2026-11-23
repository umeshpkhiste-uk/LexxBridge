import { Platform } from "react-native";
import { createSubscription } from "./api";

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayInstance = { open: () => void; on: (event: string, cb: (response: unknown) => void) => void };
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

function loadCheckoutScript(): Promise<RazorpayConstructor> {
  const w = window as unknown as { Razorpay?: RazorpayConstructor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Checkout didn't load")));
    script.onerror = () => reject(new Error("Couldn't load the payment page. Check your connection and try again."));
    document.body.appendChild(script);
  });
}

/** Opens Razorpay Checkout (web only for now — the Play Store build will use
 * Google Play Billing). Resolves "paid" once the payment goes through,
 * "closed" if the user closes it. The subscription only shows as active once
 * Razorpay's webhook has reached the server — the caller polls for that. */
export async function openCheckout(): Promise<"paid" | "closed"> {
  if (Platform.OS !== "web") throw new Error("Subscribing is available on lexxbridge.app for now.");
  const [Razorpay, { subscriptionId, keyId, email }] = await Promise.all([loadCheckoutScript(), createSubscription()]);
  return new Promise((resolve) => {
    const checkout = new Razorpay({
      key: keyId,
      subscription_id: subscriptionId,
      name: "LexxBridge",
      description: "Monthly plan",
      prefill: email ? { email } : undefined,
      theme: { color: "#1E3A5F" },
      handler: () => resolve("paid"),
      modal: { ondismiss: () => resolve("closed") },
    });
    checkout.open();
  });
}
