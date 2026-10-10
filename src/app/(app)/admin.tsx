import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import {
  AdminProfileRow,
  AdminReportRow,
  AdminVerificationRequest,
  blockUser,
  getVerificationDocumentUrl,
  isCurrentUserAdmin,
  listProfiles,
  listReports,
  listVerificationRequests,
  setReportStatus,
  setVerificationStatus,
  unblockUser,
} from "@/features/admin/api";
import { alertMessage, confirmAlert } from "@/shared/lib/alert";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { SettingsGroup, SettingsRow } from "@/shared/ui/SettingsGroup";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

/** Admin-only user directory + moderation. The RLS policies added in
 * supabase/migrations/0046_admin_and_blocking.sql are the real gate — a
 * non-admin's queries here would just come back empty/denied — this
 * up-front check only exists so a non-admin never sees a broken screen. */
export default function AdminScreen() {
  const { colors, spacing, typography } = useTheme();
  const [checking, setChecking] = useState(true);
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState<AdminProfileRow[] | null>(null);
  const [reports, setReports] = useState<AdminReportRow[] | null>(null);
  const [verificationRequests, setVerificationRequests] = useState<AdminVerificationRequest[] | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isCurrentUserAdmin()
      .then((isAdmin) => {
        if (!isAdmin) {
          alertMessage("Not available", "This section is only available to admins.");
          router.back();
          return;
        }
        setChecking(false);
      })
      .catch(() => router.back());
  }, []);

  const load = useCallback(() => {
    if (checking) return;
    setError(null);
    Promise.all([listProfiles(search), listReports(), listVerificationRequests()])
      .then(([p, r, v]) => {
        setProfiles(p);
        setReports(r);
        setVerificationRequests(v);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"));
  }, [checking, search]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleToggleBlock = (profile: AdminProfileRow) => {
    confirmAlert(
      profile.is_blocked ? "Unblock this user" : "Block this user",
      profile.is_blocked
        ? `${profile.full_name} will be able to send and receive connection requests, follows, and messages again.`
        : `${profile.full_name} won't be able to send or receive connection requests, follows, or messages with anyone on the network.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: profile.is_blocked ? "Unblock" : "Block",
          style: profile.is_blocked ? "default" : "destructive",
          onPress: async () => {
            setActingId(profile.id);
            try {
              if (profile.is_blocked) await unblockUser(profile.id);
              else await blockUser(profile.id);
              load();
            } catch (err) {
              alertMessage("Couldn't update", err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  };

  const handleDismissReport = (report: AdminReportRow) => {
    setReportStatus(report.id, "dismissed")
      .then(load)
      .catch((err) => alertMessage("Couldn't update", err instanceof Error ? err.message : "Something went wrong"));
  };

  const handleViewVerificationDocument = (request: AdminVerificationRequest) => {
    getVerificationDocumentUrl(request.document_storage_path)
      .then((url) => Linking.openURL(url))
      .catch((err) => alertMessage("Couldn't open document", err instanceof Error ? err.message : "Something went wrong"));
  };

  const handleApproveVerification = (request: AdminVerificationRequest) => {
    confirmAlert(`Verify ${request.full_name}?`, "They'll get the Verified badge on their profile.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Verify",
        onPress: async () => {
          setActingId(request.id);
          try {
            await setVerificationStatus(request.id, "verified");
            load();
          } catch (err) {
            alertMessage("Couldn't update", err instanceof Error ? err.message : "Something went wrong");
          } finally {
            setActingId(null);
          }
        },
      },
    ]);
  };

  const handleRejectVerification = async (request: AdminVerificationRequest, reason: string) => {
    if (!reason.trim()) {
      alertMessage("Reason required", "Add a short reason so the advocate knows what to fix before resubmitting.");
      return;
    }
    setActingId(request.id);
    try {
      await setVerificationStatus(request.id, "rejected", reason);
      load();
    } catch (err) {
      alertMessage("Couldn't update", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setActingId(null);
    }
  };

  if (checking) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brand} />
      </ScreenContainer>
    );
  }

  const openReports = reports?.filter((r) => r.status === "open") ?? [];
  const pendingVerifications = verificationRequests?.filter((r) => r.status === "pending") ?? [];

  return (
    <ScreenContainer scroll>
      <TextField
        label="Search by name or email"
        value={search}
        onChangeText={setSearch}
        placeholder="Search advocates"
        autoCapitalize="none"
      />

      {error ? <Text style={[typography.body, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text> : null}

      {pendingVerifications.length > 0 ? (
        <View style={{ marginBottom: spacing.lg, gap: spacing.sm }}>
          <Text style={[typography.label, { color: colors.textSecondary, paddingHorizontal: spacing.xs }]}>
            Verification requests ({pendingVerifications.length})
          </Text>
          {pendingVerifications.map((request) => (
            <View
              key={request.id}
              style={{ padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{request.full_name}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {request.bar_registration_number} · {request.bar_council_state}
              </Text>
              <Pressable onPress={() => handleViewVerificationDocument(request)} style={{ marginTop: spacing.sm }}>
                <Text style={[typography.label, { color: colors.brand }]}>View submitted document</Text>
              </Pressable>

              {actingId === request.id ? (
                <View style={{ marginTop: spacing.md, alignItems: "center" }}>
                  <ActivityIndicator color={colors.brand} />
                </View>
              ) : (
                <>
                  <TextField
                    label="Rejection reason (required to reject)"
                    value={rejectReasons[request.id] ?? ""}
                    onChangeText={(text) => setRejectReasons((prev) => ({ ...prev, [request.id]: text }))}
                    placeholder="e.g. Document is unreadable"
                  />
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Button label="Verify" onPress={() => handleApproveVerification(request)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Reject"
                        variant="secondary"
                        onPress={() => handleRejectVerification(request, rejectReasons[request.id] ?? "")}
                      />
                    </View>
                  </View>
                </>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {openReports.length > 0 ? (
        <View style={{ marginBottom: spacing.lg }}>
          <SettingsGroup title={`Open reports (${openReports.length})`}>
            {openReports.map((report) => (
              <SettingsRow
                key={report.id}
                icon="flag-outline"
                label={`${report.target_type} report`}
                subtitle={report.reason}
                onPress={() => handleDismissReport(report)}
                right={<Badge label="Dismiss" tone="warning" />}
              />
            ))}
          </SettingsGroup>
        </View>
      ) : null}

      <SettingsGroup title={`Users${profiles ? ` (${profiles.length})` : ""}`}>
        {profiles === null ? (
          <View style={{ padding: spacing.lg, alignItems: "center" }}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : profiles.length === 0 ? (
          <Text style={[typography.body, { color: colors.textSecondary, padding: spacing.md }]}>No users found.</Text>
        ) : (
          profiles.map((profile) => (
            <SettingsRow
              key={profile.id}
              icon={profile.is_blocked ? "ban-outline" : "person-outline"}
              label={profile.full_name}
              subtitle={[[profile.city, profile.state].filter(Boolean).join(", ") || profile.verification_status, profile.email]
                .filter(Boolean)
                .join(" · ")}
              onPress={() => handleToggleBlock(profile)}
              destructive={profile.is_blocked}
              right={
                actingId === profile.id ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <Badge label={profile.is_blocked ? "Unblock" : "Block"} tone={profile.is_blocked ? "success" : "danger"} />
                )
              }
            />
          ))
        )}
      </SettingsGroup>
    </ScreenContainer>
  );
}
