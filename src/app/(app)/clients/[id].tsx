import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { listCases } from "@/features/cases/api";
import { clientCaseTargets } from "@/features/clients/clientCases";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { LoadState } from "@/shared/ui/LoadState";
import { useTheme } from "@/shared/ui/theme";

/**
 * There is no separate client page: a client is always viewed through their
 * case. Old links to /clients/[id] land here and are sent on to the client's
 * latest open case, or to "New case" if they have none.
 */
export default function ClientRedirectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // listCases skips archived cases, matching the Clients tab.
    listCases({ clientId: id })
      .then((cases) => {
        const [target] = clientCaseTargets(cases.map((c) => ({ ...c, is_archived: false, discontinued_at: null, discontinuation_reason: null })));
        router.replace(target ? `/(app)/cases/${target.id}` : `/(app)/cases/new?clientId=${id}`);
      })
      .catch((err) => setError(friendlyErrorMessage(err)));
  }, [id, attempt]);

  const retryLoad = () => {
    setError(null);
    setAttempt((n) => n + 1);
  };

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "" }} />
      <LoadState error={error} onRetry={retryLoad} />
    </View>
  );
}
