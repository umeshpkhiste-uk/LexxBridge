import { supabase } from "@/shared/lib/supabase";

export type PublicProfile = {
  id: string;
  full_name: string;
  headline: string | null;
  about: string | null;
  city: string | null;
  state: string | null;
  languages: string[];
  practice_areas: string[];
  courts: string[];
  years_of_experience: number | null;
  website: string | null;
  profile_photo_url: string | null;
  is_verified: boolean;
};

const PROFILE_COLUMNS =
  "id, full_name, headline, about, city, state, languages, practice_areas, courts, years_of_experience, website, profile_photo_url, is_verified";

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error(error?.message ?? "Not signed in");
  return data.user.id;
}

/** PostgREST's .or()/.filter() raw-string syntax treats comma, period,
 * colon, asterisk, and parentheses as filter-structure characters — a
 * search term containing any of those would otherwise be parsed as
 * additional/malformed filter clauses instead of literal text. Wrapping the
 * whole value in double quotes (per PostgREST's url_grammar) makes
 * everything inside literal; only an embedded backslash or double quote
 * needs escaping once quoted. */
function escapeOrFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export async function searchAdvocates(query: string): Promise<PublicProfile[]> {
  const me = await currentUserId();
  const trimmed = query.trim();
  let q = supabase.from("public_advocate_profiles").select(PROFILE_COLUMNS).neq("id", me).limit(30);
  if (trimmed) {
    const pattern = escapeOrFilterValue(`%${trimmed}%`);
    q = q.or(`full_name.ilike.${pattern},city.ilike.${pattern},state.ilike.${pattern}`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as PublicProfile[];
}

export async function listSuggestedAdvocates(): Promise<PublicProfile[]> {
  const me = await currentUserId();
  const { data, error } = await supabase
    .from("public_advocate_profiles")
    .select(PROFILE_COLUMNS)
    .neq("id", me)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data as PublicProfile[];
}

export async function getPublicProfile(id: string): Promise<PublicProfile> {
  const { data, error } = await supabase.from("public_advocate_profiles").select(PROFILE_COLUMNS).eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as PublicProfile;
}

export type NetworkStats = { followers_count: number; following_count: number; connections_count: number };

export async function getNetworkStats(advocateId: string): Promise<NetworkStats> {
  const { data, error } = await supabase
    .from("advocate_network_stats")
    .select("followers_count, following_count, connections_count")
    .eq("advocate_id", advocateId)
    .single();
  if (error) throw new Error(error.message);
  return data as NetworkStats;
}

/** Follower counts for several advocates at once — for the compact row view
 * on the "Find colleagues" list, so it doesn't fire one request per card. */
export async function getFollowerCounts(advocateIds: string[]): Promise<Record<string, number>> {
  if (advocateIds.length === 0) return {};
  const { data, error } = await supabase
    .from("advocate_network_stats")
    .select("advocate_id, followers_count")
    .in("advocate_id", advocateIds);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data as { advocate_id: string; followers_count: number }[]).map((r) => [r.advocate_id, r.followers_count]));
}

export async function isFollowing(targetId: string): Promise<boolean> {
  const me = await currentUserId();
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", me)
    .eq("following_id", targetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

export async function followAdvocate(targetId: string): Promise<void> {
  const me = await currentUserId();
  const { error } = await supabase.from("follows").insert({ follower_id: me, following_id: targetId });
  if (error) throw new Error(error.message);
}

export async function unfollowAdvocate(targetId: string): Promise<void> {
  const me = await currentUserId();
  const { error } = await supabase.from("follows").delete().eq("follower_id", me).eq("following_id", targetId);
  if (error) throw new Error(error.message);
}

export type ConnectionState =
  | { status: "none" }
  | { status: "pending_sent" | "pending_received" | "accepted" | "rejected"; connectionId: string };

export async function getConnectionState(targetId: string): Promise<ConnectionState> {
  const me = await currentUserId();
  const { data, error } = await supabase
    .from("connections")
    .select("id, requester_id, addressee_id, status")
    .or(`and(requester_id.eq.${me},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${me})`)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { status: "none" };

  if (data.status === "accepted") return { status: "accepted", connectionId: data.id };
  if (data.status === "rejected") return { status: "rejected", connectionId: data.id };
  return { status: data.requester_id === me ? "pending_sent" : "pending_received", connectionId: data.id };
}

export async function sendConnectionRequest(targetId: string): Promise<void> {
  const me = await currentUserId();
  const { error } = await supabase.from("connections").insert({ requester_id: me, addressee_id: targetId });
  if (error) throw new Error(error.message);
}

export async function respondToConnection(connectionId: string, accept: boolean): Promise<void> {
  const { error } = await supabase
    .from("connections")
    .update({ status: accept ? "accepted" : "rejected" })
    .eq("id", connectionId);
  if (error) throw new Error(error.message);
}

export async function removeConnection(connectionId: string): Promise<void> {
  const { error } = await supabase.from("connections").delete().eq("id", connectionId);
  if (error) throw new Error(error.message);
}

export type ConnectionRow = {
  id: string;
  status: "pending" | "accepted" | "rejected";
  isIncoming: boolean;
  otherParty: { id: string; full_name: string; profile_photo_url: string | null; phone: string | null };
};

export async function listMyConnections(): Promise<ConnectionRow[]> {
  const me = await currentUserId();
  const { data: rows, error } = await supabase
    .from("connections")
    .select("id, status, requester_id, addressee_id")
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!rows.length) return [];

  // Other-party display info must come from the public view, not the base
  // advocate_profiles table — that table's RLS only lets each advocate read
  // their own row, so an embedded join through the FK would silently return
  // null for everyone except connections involving me.
  const otherIds = [...new Set(rows.map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id)))];
  const acceptedOtherIds = [
    ...new Set(rows.filter((r) => r.status === "accepted").map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id))),
  ];
  const [profilesResult, phonesResult] = await Promise.all([
    supabase.from("public_advocate_profiles").select("id, full_name, profile_photo_url").in("id", otherIds),
    // Only accepted connections' numbers are ever returned — see migration 0040.
    acceptedOtherIds.length
      ? supabase.rpc("connection_phone_numbers", { p_ids: acceptedOtherIds })
      : Promise.resolve({ data: [] as { id: string; phone: string }[], error: null }),
  ]);
  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (phonesResult.error) throw new Error(phonesResult.error.message);

  const profileById = new Map(profilesResult.data.map((p) => [p.id, p]));
  const phones = (phonesResult.data ?? []) as { id: string; phone: string }[];
  const phoneById = new Map(phones.map((p) => [p.id, p.phone]));

  return rows
    .map((r) => {
      const otherId = r.requester_id === me ? r.addressee_id : r.requester_id;
      const otherParty = profileById.get(otherId);
      if (!otherParty) return null;
      return {
        id: r.id,
        status: r.status,
        isIncoming: r.addressee_id === me,
        otherParty: { ...otherParty, phone: phoneById.get(otherId) ?? null },
      };
    })
    .filter((r): r is ConnectionRow => r !== null);
}

/** How many of my accepted connections each target advocate is also
 * connected to. Counts only — see migration 0022. */
export async function getMutualConnectionCounts(targetIds: string[]): Promise<Record<string, number>> {
  if (targetIds.length === 0) return {};
  const { data, error } = await supabase.rpc("mutual_connection_counts", { p_targets: targetIds.slice(0, 100) });
  if (error) throw new Error(error.message);
  return Object.fromEntries((data as { target_id: string; mutual_count: number }[]).map((r) => [r.target_id, r.mutual_count]));
}
