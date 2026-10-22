export type LearnerProfile = { id: string; name: string; createdAt: string };

export const LEARNER_PROFILES_KEY = "drum-hero:learner-profiles:v1";
export const ACTIVE_LEARNER_PROFILE_KEY = "drum-hero:active-learner:v1";
export const DEFAULT_LEARNER_PROFILE: LearnerProfile = {
  id: "default",
  name: "This device",
  createdAt: "",
};
export const LEARNER_PROFILE_CHANGE_EVENT = "drum-hero:learner-profile-change";

export function readLearnerProfiles(raw: string | null): LearnerProfile[] {
  const profiles: LearnerProfile[] = [DEFAULT_LEARNER_PROFILE];
  if (!raw) return profiles;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return profiles;
    for (const item of value.slice(0, 24)) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as Partial<LearnerProfile>;
      if (typeof candidate.id !== "string" || !/^[a-z0-9-]{1,80}$/i.test(candidate.id) || candidate.id === "default") continue;
      if (typeof candidate.name !== "string" || !candidate.name.trim() || candidate.name.length > 60) continue;
      profiles.push({
        id: candidate.id,
        name: candidate.name.trim(),
        createdAt: typeof candidate.createdAt === "string" && Number.isFinite(Date.parse(candidate.createdAt)) ? candidate.createdAt : new Date(0).toISOString(),
      });
    }
  } catch { /* A damaged profile list leaves the original local profile available. */ }
  return profiles;
}

export function readActiveLearnerProfileId(raw: string | null, profiles: LearnerProfile[]): string {
  return profiles.some((profile) => profile.id === raw) ? raw! : DEFAULT_LEARNER_PROFILE.id;
}

export function learnerStorageKey(baseKey: string, profileId: string): string {
  return profileId === DEFAULT_LEARNER_PROFILE.id ? baseKey : `${baseKey}:profile:${profileId}`;
}

export function learnerProfileIdFromBrowser(): string {
  if (typeof window === "undefined") return DEFAULT_LEARNER_PROFILE.id;
  const profiles = readLearnerProfiles(window.localStorage.getItem(LEARNER_PROFILES_KEY));
  return readActiveLearnerProfileId(window.localStorage.getItem(ACTIVE_LEARNER_PROFILE_KEY), profiles);
}

export function activateLearnerProfile(profileId: string): void {
  if (typeof window === "undefined") return;
  const profiles = readLearnerProfiles(window.localStorage.getItem(LEARNER_PROFILES_KEY));
  if (!profiles.some((profile) => profile.id === profileId)) return;
  window.localStorage.setItem(ACTIVE_LEARNER_PROFILE_KEY, profileId);
  window.dispatchEvent(new CustomEvent(LEARNER_PROFILE_CHANGE_EVENT, { detail: { profileId } }));
}

export function createLearnerProfile(name: string, profiles: LearnerProfile[]): LearnerProfile | null {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!trimmed || profiles.length >= 25) return null;
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `learner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, name: trimmed, createdAt: new Date().toISOString() };
}
