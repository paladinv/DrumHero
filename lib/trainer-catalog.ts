import { getSongCloudClient, songCloudConfigured } from "./song-cloud";

export type TrainerEditorialRole = "reviewer" | "editor" | "admin";
export type TrainerCatalogDraft = { pattern_id: string; revision_hash: string; status: "draft" | "published"; submitted_by: string; updated_at: string };
export type TrainerCatalogPublication = { pattern_id: string; revision_hash: string; title: string; source_attribution: string; source_url: string | null; rights_license: string; published_at: string; published_by: string };
export type TrainerCatalogReview = { reviewer_id: string; decision: "approved" | "changes-requested"; notes: string; created_at: string };

export type TrainerCatalogSnapshot = {
  configured: boolean;
  signedIn: boolean;
  userId?: string;
  role?: TrainerEditorialRole;
  draft?: TrainerCatalogDraft;
  publication?: TrainerCatalogPublication;
  reviews: TrainerCatalogReview[];
};

function editorialRole(value: unknown): value is TrainerEditorialRole {
  return value === "reviewer" || value === "editor" || value === "admin";
}

export async function loadTrainerCatalogSnapshot(patternId: string, revisionHash?: string): Promise<TrainerCatalogSnapshot> {
  const client = getSongCloudClient();
  if (!client || !songCloudConfigured()) return { configured: false, signedIn: false, reviews: [] };
  const { data: userData, error: userError } = await client.auth.getSession();
  if (userError) throw userError;
  const user = userData.session?.user;
  if (!user) return { configured: true, signedIn: false, reviews: [] };

  const [membership, publication] = await Promise.all([
    client.from("drum_trainer_editorial_members").select("role").eq("user_id", user.id).maybeSingle(),
    client.from("drum_trainer_catalog").select("pattern_id,revision_hash,title,source_attribution,source_url,rights_license,published_at,published_by").eq("pattern_id", patternId).maybeSingle(),
  ]);
  if (membership.error) throw membership.error;
  if (publication.error) throw publication.error;
  const role = editorialRole(membership.data?.role) ? membership.data.role : undefined;
  if (!role) return { configured: true, signedIn: true, userId: user.id, publication: publication.data ?? undefined, reviews: [] };

  const draft = await client.from("drum_trainer_catalog_drafts").select("pattern_id,revision_hash,status,submitted_by,updated_at").eq("pattern_id", patternId).maybeSingle();
  if (draft.error) throw draft.error;
  const targetRevision = revisionHash ?? draft.data?.revision_hash;
  if (!targetRevision) return { configured: true, signedIn: true, userId: user.id, role, draft: draft.data ?? undefined, publication: publication.data ?? undefined, reviews: [] };
  const reviews = await client.from("drum_trainer_editorial_reviews").select("reviewer_id,decision,notes,created_at").eq("pattern_id", patternId).eq("revision_hash", targetRevision);
  if (reviews.error) throw reviews.error;
  return { configured: true, signedIn: true, userId: user.id, role, draft: draft.data ?? undefined, publication: publication.data ?? undefined, reviews: reviews.data ?? [] };
}

export async function trainerCatalogPatternHash(pattern: unknown): Promise<string> {
  const client = getSongCloudClient();
  if (!client) throw new Error("Cloud services are not configured for this deployment.");
  const { data, error } = await client.rpc("trainer_catalog_pattern_hash", { p_pattern: pattern });
  if (error) throw error;
  if (typeof data !== "string" || !/^[a-f0-9]{32}$/.test(data)) throw new Error("The catalog returned an invalid pattern revision.");
  return data;
}

export async function submitTrainerCatalogDraft(input: {
  patternId: string; title: string; pattern: unknown;
  sourceAttribution: string; sourceUrl?: string; rightsLicense: string;
}) {
  const client = getSongCloudClient();
  if (!client) throw new Error("Cloud services are not configured for this deployment.");
  const { error } = await client.rpc("trainer_submit_catalog_draft", {
    p_pattern_id: input.patternId,
    p_title: input.title,
    p_pattern: input.pattern,
    p_source_attribution: input.sourceAttribution,
    p_source_url: input.sourceUrl?.trim() || null,
    p_rights_license: input.rightsLicense,
  });
  if (error) throw error;
}

export async function recordTrainerCatalogReview(input: { patternId: string; revisionHash: string; decision: "approved" | "changes-requested"; notes: string }) {
  const client = getSongCloudClient();
  if (!client) throw new Error("Cloud services are not configured for this deployment.");
  const { error } = await client.rpc("trainer_record_catalog_review", {
    p_pattern_id: input.patternId,
    p_revision_hash: input.revisionHash,
    p_decision: input.decision,
    p_notes: input.notes,
  });
  if (error) throw error;
}

export async function publishTrainerCatalogRevision(patternId: string, revisionHash: string) {
  const client = getSongCloudClient();
  if (!client) throw new Error("Cloud services are not configured for this deployment.");
  const { error } = await client.rpc("trainer_publish_catalog_revision", { p_pattern_id: patternId, p_revision_hash: revisionHash });
  if (error) throw error;
}
