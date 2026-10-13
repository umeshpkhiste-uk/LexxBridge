import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { listAgendaItems } from "@/features/calendar/api";
import { supabase } from "@/shared/lib/supabase";
import { Notifications } from "./notificationsModule";
import { buildReminders } from "./reminders";

/**
 * On-device notifications:
 *  - calendar reminders (hearings / meetings / tasks) scheduled locally, so
 *    they fire even with the app closed;
 *  - banners for new messages and activity while the app is open;
 *  - registering this phone for remote push (messages etc. with the app
 *    closed) once the project has an EAS project id.
 * The status-bar icon (Android) comes from app.json → expo-notifications.
 */

const BRAND = "#1E3A5F";
const REMINDER_PREFIX = "agenda:";

let configured = false;

/** Show banners even while the app is in the foreground — except payment
 * reminders, which show a richer in-app confirm popup instead (see
 * NotificationsProvider's addNotificationReceivedListener), so the plain
 * banner would just be a redundant duplicate. */
export function configureNotifications() {
  if (configured || !Notifications) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isPayment = notification.request.content.data?.kind === "payment";
      return {
        shouldShowBanner: !isPayment,
        shouldShowList: !isPayment,
        shouldPlaySound: true,
        shouldSetBadge: false,
      };
    },
  });
  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: BRAND,
      vibrationPattern: [0, 200, 120, 200],
    });
    Notifications.setNotificationChannelAsync("default", {
      name: "Reminders & activity",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: BRAND,
    });
  }
}

export async function ensurePermission(): Promise<boolean> {
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

let registeredToken: string | null = null;

/** Registers this phone for remote push. No-op until the app has an EAS
 * project id (run `eas init`) and runs on a real device build. */
export async function registerPushToken(userId: string): Promise<boolean> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!Notifications || !projectId || !Device.isDevice) return false;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    registeredToken = token;
    await supabase
      .from("push_tokens")
      .upsert({ token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() }, { onConflict: "token" });
    return true;
  } catch (err) {
    console.warn("Push registration failed", err);
    return false;
  }
}

/** Stop pushes to this phone (on log out). */
export async function unregisterPushToken(): Promise<void> {
  if (!registeredToken) return;
  await supabase.from("push_tokens").delete().eq("token", registeredToken);
  registeredToken = null;
}

export function isPushActive() {
  return registeredToken !== null;
}

async function cancelReminders() {
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => n.identifier.startsWith(REMINDER_PREFIX)).map((n) => Notifications!.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Replaces all calendar reminders with ones for the next two weeks. */
export async function syncCalendarReminders(enabled: boolean): Promise<void> {
  if (!Notifications) return;
  await cancelReminders();
  if (!enabled) return;
  const from = new Date();
  const to = new Date(from.getTime() + 14 * 86_400_000);
  const items = await listAgendaItems({ from, to });
  for (const r of buildReminders(items)) {
    await Notifications!.scheduleNotificationAsync({
      identifier: `${REMINDER_PREFIX}${r.id}`,
      content: { title: r.title, body: r.body, data: r.data, sound: "default" },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: "default" },
    });
  }
}

/** Clear everything for this device (on log out / account switch). */
export async function clearDeviceNotifications(): Promise<void> {
  if (!Notifications) return;
  await cancelReminders();
  await Notifications.dismissAllNotificationsAsync();
}

/** Immediate banner for an in-app notification while the app is open. */
export async function presentNow(title: string, body: string, data: Record<string, unknown>, channelId = "default") {
  if (!Notifications) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: "default" },
    trigger: Platform.OS === "android" ? { channelId } : null,
  });
}
