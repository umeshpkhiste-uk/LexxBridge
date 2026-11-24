import { supabase } from "@/shared/lib/supabase";

export type CommunicationType = "phone_call" | "email" | "meeting" | "sms" | "whatsapp_manual" | "video_call" | "other";

export type Communication = {
  id: string;
  client_id: string;
  case_id: string | null;
  communication_type: CommunicationType;
  occurred_at: string;
  summary: string;
  follow_up: string | null;
};

const COLUMNS = "id, client_id, case_id, communication_type, occurred_at, summary, follow_up";

export async function createCommunication(input: {
  clientId: string;
  caseId?: string;
  communicationType: CommunicationType;
  occurredAt: Date;
  summary: string;
  followUp?: string;
}): Promise<Communication> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "Not signed in");

  const { data, error } = await supabase
    .from("communications")
    .insert({
      advocate_id: userData.user.id,
      client_id: input.clientId,
      case_id: input.caseId ?? null,
      communication_type: input.communicationType,
      occurred_at: input.occurredAt.toISOString(),
      summary: input.summary.trim(),
      follow_up: input.followUp?.trim() || null,
    })
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data as Communication;
}
