"use client";

import { useEffect, useState } from "react";
import { activateLearnerProfile, LEARNER_PROFILES_KEY, LEARNER_PROFILE_CHANGE_EVENT, readLearnerProfiles, type LearnerProfile } from "@/lib/learner-profiles";
import { useProgress } from "@/components/ProgressProvider";

export function LearnerProfilePicker() {
  const { profileId } = useProgress();
  const [profiles, setProfiles] = useState<LearnerProfile[]>([]);
  useEffect(() => {
    const update = () => setProfiles(readLearnerProfiles(localStorage.getItem(LEARNER_PROFILES_KEY)));
    const timer = window.setTimeout(update, 0);
    window.addEventListener("storage", update);
    window.addEventListener("drum-hero:learner-profiles-change", update);
    window.addEventListener(LEARNER_PROFILE_CHANGE_EVENT, update);
    return () => { clearTimeout(timer); window.removeEventListener("storage", update); window.removeEventListener("drum-hero:learner-profiles-change", update); window.removeEventListener(LEARNER_PROFILE_CHANGE_EVENT, update); };
  }, []);
  const current = profiles.find((profile) => profile.id === profileId)?.name ?? "This device";
  return <details className="learner-profile-picker site-nav-group">
    <summary aria-label={`Learner profile: ${current}`}>Learner · {current}</summary>
    <div className="site-nav-submenu"><label>Active learner<select aria-label="Active learner profile" value={profileId} onChange={(event) => activateLearnerProfile(event.target.value)}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><small>Practice progress and Trainer history are kept separate for each learner on this device.</small></div>
  </details>;
}
