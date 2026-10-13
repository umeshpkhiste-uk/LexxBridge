import { router } from "expo-router";
import { PropsWithChildren, useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/features/auth/AuthProvider";
import { handlePaymentReminderReceived, syncPaymentReminders } from "@/features/hearings/paymentReminder";
import { toDateParam } from "@/shared/lib/format";
import { supabase } from "@/shared/lib/supabase";
import { getMyProfile } from "@/features/profile/api";
import { getActiveConversation } from "./activeChat";
import { Notifications } from "./notificationsModule";
import { configureNotifications, ensurePermission, isPushActive, presentNow, registerPushToken, syncCalendarReminders } from "./device";

/** Opens the screen a notification is about. */
function openFromNotification(data: Record<string, unknown> | undefined) {
  if (!data) return router.push("/(app)/notifications");
  if (data.kind === "agenda") {
    if (data.type === "hearing" && typeof data.itemId === "string") return router.push(`/(app)/hearings/${data.itemId}`);
    if (typeof data.caseId === "string") return router.push(`/(app)/cases/${data.caseId}`);
    if (typeof data.at === "string") return router.push(`/(app)/(tabs)/calendar?date=${toDateParam(data.at)}`);
  }
  if (data.kind === "payment" && typeof data.caseId === "string") return router.push(`/(app)/cases/${data.caseId}`);
  if (typeof data.conversation_id === "string") return router.push(`/(app)/messages/${data.conversation_id}`);
  if (typeof data.post_id === "string") return router.push(`/(app)/posts/${data.post_id}`);
  if (typeof data.actor_id === "string") return router.push(`/(app)/network/${data.actor_id}`);
  router.push("/(app)/notifications");
}

/**
 * Signed-in notification wiring: permission, calendar reminders (refreshed
 * whenever the app comes to the foreground), live banners for new messages
 * and activity, push registration, and taps that open the right screen.
 */
export function NotificationsProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId || !Notifications) return;
    const N = Notifications;
    configureNotifications();
    let enabled = true;

    const refresh = async () => {
      enabled = await getMyProfile()
        .then((p) => p.notifications_enabled !== false)
        .catch(() => true);
      if (!(await ensurePermission())) return;
      await syncCalendarReminders(enabled).catch((err) => console.warn("Reminder sync failed", err));
      await syncPaymentReminders(enabled).catch((err) => console.warn("Payment reminder sync failed", err));
    };

    refresh().then(() => registerPushToken(userId));
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });

    // While the app is open, show new messages / activity as banners. With
    // remote push active the push itself does this, so skip to avoid doubles.
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as { type: string; title: string; body: string | null; data: Record<string, unknown> | null };
          if (!enabled || isPushActive()) return;
          if (n.type === "new_message" && n.data?.conversation_id === getActiveConversation()) return;
          presentNow(n.title, n.body ?? "", { ...(n.data ?? {}), type: n.type }, n.type === "new_message" ? "messages" : "default");
        },
      )
      .subscribe();

    const tapped = N.addNotificationResponseReceivedListener((response) =>
      openFromNotification(response.notification.request.content.data as Record<string, unknown>),
    );
    // Opened the app by tapping a notification while it was closed.
    const last = N.getLastNotificationResponse();
    if (last) openFromNotification(last.notification.request.content.data as Record<string, unknown>);

    // Payment reminders show a richer in-app confirm instead of their OS
    // banner (suppressed in device.ts) while the app is foregrounded.
    const received = N.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      if (data?.kind === "payment") handlePaymentReminderReceived(data);
    });

    return () => {
      appState.remove();
      tapped.remove();
      received.remove();
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return children;
}
