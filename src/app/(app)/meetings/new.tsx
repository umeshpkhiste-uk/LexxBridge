import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { createMeeting, getMeeting, MeetingType, updateMeeting } from "@/features/meetings/api";
import { Button } from "@/shared/ui/Button";
import { DateField } from "@/shared/ui/DateField";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

const MEETING_TYPES: { key: MeetingType; label: string }[] = [
  { key: "client_meeting", label: "Client" },
  { key: "consultation", label: "Consultation" },
  { key: "opposite_counsel_meeting", label: "Opposite counsel" },
  { key: "internal_meeting", label: "Internal" },
  { key: "court_related_meeting", label: "Court-related" },
  { key: "other", label: "Other" },
];

/** New meeting, or — with ?id= — edit an existing one. */
export default function NewMeetingScreen() {
  const { caseId, clientId, id } = useLocalSearchParams<{ caseId?: string; clientId?: string; id?: string }>();
  const isEdit = !!id;
  const [loaded, setLoaded] = useState(!isEdit);
  const { colors, spacing } = useTheme();
  const now = new Date();

  const [meetingType, setMeetingType] = useState<MeetingType>("client_meeting");
  const [meetingAt, setMeetingAt] = useState<Date | null>(now);
  const [location, setLocation] = useState("");
  const [participants, setParticipants] = useState("");
  const [discussionNotes, setDiscussionNotes] = useState("");
  const [decisions, setDecisions] = useState("");
  const [followUpActions, setFollowUpActions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    getMeeting(id)
      .then((m) => {
        setMeetingType(m.meeting_type);
        setMeetingAt(new Date(m.meeting_at));
        setLocation(m.location ?? "");
        setParticipants(m.participants ?? "");
        setDiscussionNotes(m.discussion_notes ?? "");
        setDecisions(m.decisions ?? "");
        setFollowUpActions(m.follow_up_actions ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this meeting"))
      .finally(() => setLoaded(true));
  }, [id]);

  const handleSave = async () => {
    if (!meetingAt) {
      setError("Choose the meeting date and time");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const details = { meetingType, meetingAt, location, participants, discussionNotes, decisions, followUpActions };
      if (id) {
        await updateMeeting(id, details);
        router.back();
        return;
      }
      await createMeeting({
        caseId,
        clientId,
        meetingType,
        meetingAt,
        location,
        participants,
        discussionNotes,
        decisions,
        followUpActions,
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ title: "Edit meeting" }} />
        <ActivityIndicator color={colors.brand} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <Stack.Screen options={{ title: isEdit ? "Edit meeting" : "New meeting" }} />
      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: spacing.xs }}>
        Meeting type
      </Text>
      <SegmentedControl
        segments={MEETING_TYPES.map((t) => ({ key: t.key, label: t.label }))}
        value={meetingType}
        onChange={(key) => setMeetingType(key as MeetingType)}
        scrollable
      />
      <DateField label="Date & time" value={meetingAt} onChange={setMeetingAt} mode="datetime" />
      <TextField label="Location" placeholder="e.g. Chamber No. 12, District Court Complex" value={location} onChangeText={setLocation} />
      <TextField label="Participants" placeholder="e.g. Client, opposing counsel Mr. Verma" value={participants} onChangeText={setParticipants} />
      <TextField
        label="Discussion notes"
        placeholder="e.g. Discussed settlement terms proposed by the other side"
        value={discussionNotes}
        onChangeText={setDiscussionNotes}
        multiline
        numberOfLines={3}
      />
      <TextField
        label="Decisions"
        placeholder="e.g. Client agreed to counter-offer of ₹5,00,000"
        value={decisions}
        onChangeText={setDecisions}
        multiline
        numberOfLines={2}
      />
      <TextField
        label="Follow-up actions"
        placeholder="e.g. Draft settlement agreement by Friday"
        value={followUpActions}
        onChangeText={setFollowUpActions}
        multiline
        numberOfLines={2}
      />

      {error ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text> : null}

      <Button label={isEdit ? "Save changes" : "Save meeting"} onPress={handleSave} loading={isSubmitting} />
    </ScreenContainer>
  );
}
