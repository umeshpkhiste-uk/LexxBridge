import { Ionicons } from "@expo/vector-icons";
import { router, Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { CenterFabTabBar } from "@/shared/ui/CenterFabTabBar";
import { useTheme } from "@/shared/ui/theme";

// Calendar stays a tab route (so /calendar?date=… links and the Home screen's
// calendar shortcuts keep working) but isn't shown in the bar.
const HIDDEN_TABS = ["calendar"];

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
      // React Navigation calls tabBar as a plain function, so it must return
      // an element — not be a component itself (hooks inside it would break).
      tabBar={(props) => (
        <CenterFabTabBar
          {...props}
          hiddenRoutes={HIDDEN_TABS}
          actionItem={{
            afterRoute: "cases",
            icon: "person-add-outline",
            label: t("tabs.newClient"),
            onPress: () => router.push("/(app)/clients/new"),
          }}
          fabLabel="Quick actions"
          // Functionality TBD.
          onFabPress={() => {}}
        />
      )}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.home"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cases"
        options={{
          title: t("tabs.cases"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "briefcase" : "briefcase-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t("tabs.calendar"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          title: t("tabs.network"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
