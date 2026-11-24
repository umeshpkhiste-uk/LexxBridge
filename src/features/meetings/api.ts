import { supabase } from "@/shared/lib/supabase";

export type MeetingType =
  | "client_meeting"
  | "opposite_counsel_meeting"
  | "internal_meeting"
  | "court_related_meeting"
  | "consultation"
  | "other";

export type Meeting = {
  id: string;
  case_id: string | null;
  client_id: string | null;
  meeting_type: MeetingType;
  meeting_at: string;
  location: string | null;
  participants: string | null;
  discussion_notes: string | null;
  decisions: string | null;
  follow_up_actions: string | null;
};

const COLUMNS =
  "id, case_id, client_id, meeting_type, meeting_at, location, participants, discussion_notes, decisions, follow_up_actions";

export async function createMeeting(input: {
  caseId?: string;
  clientId?: string;
  meetingType: MeetingType;
  meetingAt: Date;
  location?: string;
  participants?: string;
  discussionNotes?: string;
  decisions?: string;
  followUpActions?: string;
}): Promise<Meeting> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");

  const { data, error } = await supabase
    .from("meetings")
    .insert({
      advocate_id: userData.user.id,
      case_id: input.caseId ?? null,
      client_id: input.clientId ?? null,
      meeting_type: input.meetingType,
      meeting_at: input.meetingAt.toISOString(),
      location: input.location?.trim() || null,
      participants: input.participants?.trim() || null,
      discussion_notes: input.discussionNotes?.trim() || null,
      decisions: input.decisions?.trim() || null,
      follow_up_actions: input.followUpActions?.trim() || null,
    })
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data as Meeting;
}

export async function getMeeting(id: string): Promise<Meeting> {
  const { data, error } = await supabase.from("meetings").select(COLUMNS).eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as Meeting;
}

/** Edits a meeting's details. */
export async function updateMeeting(
  id: string,
  input: {
    meetingType: MeetingType;
    meetingAt: Date;
    location?: string;
    participants?: string;
    discussionNotes?: string;
    decisions?: string;
    followUpActions?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update({
      meeting_type: input.meetingType,
      meeting_at: input.meetingAt.toISOString(),
      location: input.location?.trim() || null,
      participants: input.participants?.trim() || null,
      discussion_notes: input.discussionNotes?.trim() || null,
      decisions: input.decisions?.trim() || null,
      follow_up_actions: input.followUpActions?.trim() || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
