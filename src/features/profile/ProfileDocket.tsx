import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { OnlineDot } from "@/features/presence/OnlineDot";
import { useTheme } from "@/shared/ui/theme";
import type { AdvocateProfile } from "./api";

export type DocketAudience = "private" | "public";

type Props = {
  profile: AdvocateProfile;
  email: string | null;
  audience: DocketAudience;
  caseCount: number | null;
  connectionsCount: number | null;
  /** Icon-only edit entry point next to the name — owner view only. */
  onEdit?: () => void;
};

const verificationLabel: Record<AdvocateProfile["verification_status"], string> = {
  unverified: "Not verified",
  pending: "Verification pending",
  verified: "Bar Council Verified",
  rejected: "Verification rejected",
  expired: "Verification expired",
};

const genderLabel: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

const visibilityLabel: Record<AdvocateProfile["profile_visibility"], string> = {
  public: "Public",
  connections_only: "Connections only",
  private: "Hidden",
};

function withAdvPrefix(name: string) {
  return /^adv\.?\s/i.test(name) ? name : `Adv. ${name}`;
}
function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 3)}***@${domain ?? ""}`;
}
function maskPhone(phone: string) {
  const digits = phone.replace(/\s/g, "");
  return digits.length > 6 ? `${digits.slice(0, digits.length - 8)}${digits.slice(-8, -6)}•••• ${digits.slice(-2)}` : "••••";
}
function formatDob(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Read-only "profile docket": the advocate's professional record. With
 * audience="public" it renders only what other advocates can see, so the
 * owner can preview their public bar view.
 */
export function ProfileDocket({ profile, email, audience, caseCount, connectionsCount, onEdit }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const isPrivate = audience === "private";
  const verified = profile.verification_status === "verified";
  const location = [profile.city, profile.state].filter(Boolean).join(", ");
  const practicing = profile.courts.slice(0, 2).join(" & ");

  const card = [styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }];

  return (
    <View style={{ gap: spacing.md }}>
      {/* Hero docket */}
      <View style={[card, { overflow: "hidden" }]}>
        <View style={styles.accentBar}>
          <View style={{ flex: 1, backgroundColor: colors.accent }} />
          <View style={{ flex: 1, backgroundColor: colors.brand }} />
          <View style={{ flex: 1, backgroundColor: "#F3D9A4" }} />
        </View>
        <View style={[styles.heroRow, { gap: spacing.md, marginTop: spacing.sm }]}>
          <View>
            {profile.profile_photo_url ? (
              <Image source={{ uri: profile.profile_photo_url }} style={[styles.photo, { backgroundColor: colors.surfaceAlt }]} />
            ) : (
              <View style={[styles.photo, styles.center, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="person" size={36} color={colors.brand} />
              </View>
            )}
            {verified ? (
              <View style={[styles.verifiedBadge, { backgroundColor: colors.accent, borderColor: colors.surface }]}>
                <Ionicons name="shield-checkmark" size={13} color="#FFFFFF" />
              </View>
            ) : null}
            <OnlineDot userId={isPrivate ? profile.id : null} avatarSize={80} inset={4} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <Text style={[typography.title, { color: colors.brand, flexShrink: 1 }]} numberOfLines={1}>
                {withAdvPrefix(profile.full_name)}
              </Text>
              {onEdit ? (
                <Pressable onPress={onEdit} hitSlop={8} accessibilityLabel="Edit profile details">
                  <Ionicons name="create-outline" size={20} color={colors.brand} />
                </Pressable>
              ) : null}
            </View>
            <View style={[styles.badges, { marginTop: 4 }]}>
              {isPrivate || verified ? (
                <View style={[styles.badge, { backgroundColor: verified ? "#FED488" : colors.surfaceAlt }]}>
                  <Text style={[styles.badgeText, { color: verified ? "#5D4201" : colors.textSecondary }]}>
                    {verificationLabel[profile.verification_status]}
                  </Text>
                </View>
              ) : null}
              {isPrivate ? (
                <Pressable
                  onPress={() => router.push("/(app)/settings")}
                  accessibilityLabel={`Profile visibility: ${visibilityLabel[profile.profile_visibility]}. Change in settings`}
                  style={[styles.badge, styles.inline, { backgroundColor: colors.surfaceAlt }]}
                >
                  <Ionicons
                    name={profile.profile_visibility === "public" ? "globe-outline" : profile.profile_visibility === "private" ? "eye-off-outline" : "people-outline"}
                    size={11}
                    color={colors.brand}
                  />
                  <Text style={[styles.badgeText, { color: colors.brand }]}>Profile: {visibilityLabel[profile.profile_visibility]}</Text>
                </Pressable>
              ) : null}
              {profile.courts[0] ? (
                <View style={[styles.badge, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={[styles.badgeText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {profile.courts[0]}
                  </Text>
                </View>
              ) : null}
            </View>
            {profile.headline ? (
              <Text style={[typography.bodyStrong, { color: colors.textPrimary, marginTop: spacing.sm }]}>{profile.headline}</Text>
            ) : null}
          </View>
        </View>

        {location || practicing || profile.years_of_experience || (isPrivate && profile.bar_registration_number) ? (
          <View style={[styles.detailBox, { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.md }]}>
            {location || practicing ? (
              <DetailLine icon="business-outline" text={[location, practicing ? `Practicing at ${practicing}` : null].filter(Boolean).join(" • ")} />
            ) : null}
            {profile.years_of_experience || (isPrivate && profile.bar_registration_number) ? (
              <DetailLine
                icon="id-card-outline"
                text={[
                  profile.years_of_experience ? `${profile.years_of_experience}+ years active bar practice` : null,
                  isPrivate && profile.bar_registration_number ? `Enrolment No: ${profile.bar_registration_number}` : null,
                ]
                  .filter(Boolean)
                  .join(" | ")}
              />
            ) : null}
            {profile.bar_council_state ? <DetailLine icon="ribbon-outline" text={`Bar Council of ${profile.bar_council_state}`} /> : null}
          </View>
        ) : null}

        <View style={[styles.metrics, { gap: spacing.sm, marginTop: spacing.md }]}>
          {isPrivate ? <Metric value={caseCount} label="Cases handled" color={colors.brand} /> : null}
          <Metric value={connectionsCount} label="Colleagues" color={colors.accent} />
          <Metric value={profile.years_of_experience} label="Years practice" color={colors.success} />
        </View>
      </View>

      {/* Practice areas */}
      <Section icon="scale-outline" title="Practice Areas & Specialization" badge={profile.practice_areas.length ? `${profile.practice_areas.length} areas` : undefined}>
        {profile.practice_areas.length ? (
          <View style={styles.badges}>
            {profile.practice_areas.map((area) => (
              <View key={area} style={[styles.areaChip, { backgroundColor: colors.surfaceAlt }]}>
                <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                <Text style={[typography.label, { color: colors.textPrimary }]}>{area}</Text>
              </View>
            ))}
          </View>
        ) : (
          <EmptyLine text="No practice areas added yet." />
        )}
      </Section>

      {/* Courts */}
      <Section icon="business-outline" title="Courts & Tribunals of Practice">
        {profile.courts.length ? (
          <View style={{ gap: spacing.sm }}>
            {profile.courts.map((court, i) => (
              <View key={court} style={[styles.courtRow, { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm }]}>
                <View style={[styles.dot, { width: 8, height: 8, backgroundColor: i === 0 ? colors.danger : colors.brand }]} />
                <Text style={[typography.bodyStrong, { color: colors.textPrimary, flex: 1 }]}>{court}</Text>
                <View style={[styles.badge, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={[styles.badgeText, { color: colors.textSecondary }]}>{i === 0 ? "PRIMARY" : "REGULAR"}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <EmptyLine text="No courts added yet." />
        )}
      </Section>

      {/* Credentials */}
      <Section icon="school-outline" title="Professional Credentials & Associations">
        {profile.education.length === 0 && profile.bar_memberships.length === 0 ? (
          <EmptyLine text="No qualifications or memberships added yet." />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {profile.education.map((edu, i) => (
              <View key={`${edu.degree}-${i}`} style={styles.eduRow}>
                <View style={[styles.eduIcon, styles.center, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name={i === 0 ? "ribbon-outline" : "book-outline"} size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{edu.degree}</Text>
                  {edu.institution || edu.year ? (
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>
                      {[edu.institution, edu.year ? `Batch of ${edu.year}` : null].filter(Boolean).join(" • ")}
                    </Text>
                  ) : null}
                  {edu.note ? <Text style={[typography.caption, { color: colors.accent, fontWeight: "600" }]}>{edu.note}</Text> : null}
                </View>
              </View>
            ))}
            {profile.bar_memberships.length ? (
              <View style={[{ backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, gap: 4 }]}>
                <Text style={[typography.label, { color: colors.textSecondary, textTransform: "uppercase" }]}>Bar memberships</Text>
                {profile.bar_memberships.map((m) => (
                  <View key={m} style={styles.courtRow}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
                    <Text style={[typography.body, { color: colors.textPrimary, flex: 1 }]}>{m}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </Section>

      {/* Chambers & contact — owner only */}
      {isPrivate ? (
        <Section icon="home-outline" title="Chambers & Contact" trailingIcon="lock-closed-outline">
          <View style={{ gap: spacing.sm }}>
            <ContactRow icon="business-outline" label="Court chambers" value={profile.chamber_address} />
            <ContactRow icon="mail-outline" label="Login email" value={email} masked={email ? maskEmail(email) : null} />
            <ContactRow icon="call-outline" label="Mobile" value={profile.phone} masked={profile.phone ? maskPhone(profile.phone) : null} />
            <ContactRow icon="cash-outline" label="UPI ID" value={profile.upi_id} />
          </View>
        </Section>
      ) : (
        <View style={[styles.courtRow, { justifyContent: "center", padding: spacing.sm }]}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Contact details and personal information are private.</Text>
        </View>
      )}

      {isPrivate ? (
        <Section icon="person-outline" title="Personal Details" trailingIcon="lock-closed-outline">
          <View style={{ gap: spacing.sm }}>
            <ContactRow icon="calendar-outline" label="Date of birth" value={profile.date_of_birth ? formatDob(profile.date_of_birth) : null} />
            <ContactRow icon="person-outline" label="Gender" value={profile.gender ? genderLabel[profile.gender] : null} />
            <ContactRow
              icon="location-outline"
              label="Home address"
              value={[profile.address_line, profile.city, profile.state, profile.pincode].filter(Boolean).join(", ") || null}
            />
          </View>
        </Section>
      ) : null}
    </View>
  );
}

function DetailLine({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.courtRow}>
      <Ionicons name={icon} size={16} color={colors.accent} />
      <Text style={[typography.caption, { color: colors.textSecondary, flex: 1 }]}>{text}</Text>
    </View>
  );
}

function Metric({ value, label, color }: { value: number | null; label: string; color: string }) {
  const { colors, radius, typography } = useTheme();
  return (
    <View style={[styles.metric, { backgroundColor: colors.background, borderRadius: radius.md }]}>
      <Text style={[typography.title, { color }]}>{value ?? "—"}</Text>
      <Text style={[styles.badgeText, { color: colors.textSecondary, textAlign: "center" }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

function Section({
  icon,
  title,
  badge,
  trailingIcon,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  badge?: string;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }]}>
      <View style={[styles.sectionHeader, { marginBottom: spacing.sm }]}>
        <Ionicons name={icon} size={20} color={colors.accent} />
        <Text style={[typography.subtitle, { color: colors.brand, flex: 1 }]}>{title}</Text>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>{badge}</Text>
          </View>
        ) : null}
        {trailingIcon ? <Ionicons name={trailingIcon} size={16} color={colors.accent} /> : null}
      </View>
      {children}
    </View>
  );
}

function ContactRow({
  icon,
  label,
  value,
  masked,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
  masked?: string | null;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const [revealed, setRevealed] = useState(false);
  const showMasked = !!masked && !revealed;
  return (
    <View style={[styles.contactRow, { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm }]}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.badgeText, { color: colors.textSecondary }]}>{label.toUpperCase()}</Text>
        <Text style={[typography.body, { color: value ? colors.brand : colors.textSecondary, fontWeight: value ? "500" : "400" }]}>
          {value ? (showMasked ? masked : value) : "Not added"}
        </Text>
      </View>
      {masked && value ? (
        <Pressable onPress={() => setRevealed((r) => !r)} style={[styles.revealButton, { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm }]}>
          <Text style={[typography.label, { color: colors.brand }]}>{revealed ? "Hide" : "Reveal"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function EmptyLine({ text }: { text: string }) {
  const { colors, typography } = useTheme();
  return <Text style={[typography.body, { color: colors.textSecondary }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  inline: { flexDirection: "row", alignItems: "center", gap: 4 },
  card: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  center: { alignItems: "center", justifyContent: "center" },
  accentBar: { position: "absolute", top: 0, left: 0, right: 0, height: 4, flexDirection: "row" },
  heroRow: { flexDirection: "row", alignItems: "flex-start" },
  photo: { width: 80, height: 80, borderRadius: 16 },
  verifiedBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, maxWidth: 200 },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  detailBox: { gap: 6 },
  metrics: { flexDirection: "row" },
  metric: { flex: 1, alignItems: "center", paddingVertical: 10, paddingHorizontal: 4 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  areaChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  dot: { width: 6, height: 6, borderRadius: 4 },
  courtRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eduRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  eduIcon: { width: 34, height: 34, borderRadius: 8 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  revealButton: { paddingHorizontal: 10, paddingVertical: 5 },
});
