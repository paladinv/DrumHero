"use client";

import { useCallback, useEffect, useState } from "react";
import { getSongCloudClient, songCloudConfigured } from "@/lib/song-cloud";
import { normalizeSong, stripOriginalMusicXml, type DrumSong } from "@/lib/song-library";
import { songRightsReviewCurrent } from "@/lib/song-library-rights";

type PublicSongSubmission = {
  id: string;
  author_id?: string;
  title: string;
  artist: string;
  attribution: string;
  license: string;
  source_url: string | null;
  state: unknown;
  status: "pending" | "published" | "rejected";
  moderation_note: string | null;
  created_at: string;
};

function safePublicCopy(song: DrumSong): DrumSong {
  const clean = stripOriginalMusicXml(song);
  return {
    ...clean,
    sharedOrigin: undefined,
    rightsReview: undefined,
    catalogReview: undefined,
    notes: "",
    source: clean.source ? { ...clean.source, authorization: "" } : undefined,
    musicXmlSource: clean.musicXmlSource ? { ...clean.musicXmlSource, originalXml: undefined } : undefined,
    kitSetup: clean.kitSetup ? { ...clean.kitSetup, profileId: undefined, notes: "" } : undefined,
    sections: clean.sections.map(section => ({
      ...section,
      notes: "",
      rehearsalCues: undefined,
      reviewComments: undefined,
      parts: section.parts.map(part => ({ ...part, notes: undefined }))
    }))
  };
}

export function SongPublicCatalog({ song, songs, onImport }: { song: DrumSong; songs: DrumSong[]; onImport: (song: DrumSong) => void }) {
  const [rows, setRows] = useState<PublicSongSubmission[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState("");
  const [reviewer, setReviewer] = useState(false);
  const [license, setLicense] = useState("");
  const [attested, setAttested] = useState(false);
  const [query, setQuery] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const client = getSongCloudClient();
    if (!client) return;
    const { data: auth } = await client.auth.getUser();
    setSignedIn(Boolean(auth.user));
    setUserId(auth.user?.id ?? "");
    let data: unknown[] | null;
    if (auth.user) {
      const result = await client.from("drum_song_catalog").select("id,author_id,title,artist,attribution,license,source_url,state,status,moderation_note,created_at").order("created_at", { ascending: false }).limit(100);
      if (result.error) throw result.error;
      data = result.data as unknown[] | null;
      const { data: role, error: roleError } = await client.from("drum_song_catalog_reviewers").select("user_id").eq("user_id", auth.user.id).maybeSingle();
      if (roleError && roleError.code !== "PGRST116") throw roleError;
      setReviewer(Boolean(role));
    } else {
      setReviewer(false);
      const result = await client.from("drum_song_catalog_public").select("id,title,artist,attribution,license,source_url,state,created_at").order("created_at", { ascending: false }).limit(100);
      if (result.error) throw result.error;
      data = (result.data ?? []).map(row => ({ ...row, status: "published", author_id: undefined })) as unknown[];
    }
    setRows((data ?? []) as PublicSongSubmission[]);
  }, []);

  useEffect(() => {
    let active = true;
    void refresh().catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Could not load the public repertoire catalog."); });
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    const client = getSongCloudClient();
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange(() => {
      window.setTimeout(() => { void refresh().catch(error => setMessage(error instanceof Error ? error.message : "Could not refresh catalog access.")); }, 0);
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const act = async (operation: () => Promise<void>, success: string) => {
    setBusy(true);
    setMessage("");
    try { await operation(); await refresh(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The catalog action could not be completed."); }
    finally { setBusy(false); }
  };

  const submit = () => {
    const client = getSongCloudClient();
    if (!client || !songRightsReviewCurrent(song) || !license.trim() || !attested) return;
    const sourceUrl = song.source?.url.trim() || null;
    const payload = { format: "drum-hero-public-song-v1", version: 1, song: safePublicCopy(song) };
    void act(async () => {
      const { error } = await client.rpc("submit_drum_song_catalog", {
        p_title: song.title,
        p_artist: song.artist,
        p_attribution: song.source?.attribution.trim() ?? "",
        p_license: license.trim(),
        p_source_url: sourceUrl,
        p_state: payload,
        p_rights_attested: true
      });
      if (error) throw error;
      setLicense(""); setAttested(false);
    }, "Submitted for independent moderation. It will not appear publicly until approved.");
  };

  const moderate = (row: PublicSongSubmission, status: "published" | "rejected") => {
    const client = getSongCloudClient();
    if (!client) return;
    void act(async () => {
      const { error } = await client.rpc("review_drum_song_catalog_submission", { p_submission_id: row.id, p_status: status, p_note: reviewNote.trim() });
      if (error) throw error;
      setReviewNote("");
    }, status === "published" ? "Submission published." : "Submission returned to its author.");
  };

  const importSong = (row: PublicSongSubmission) => {
    const payload = row.state as { song?: unknown } | null;
    const candidate = normalizeSong(payload?.song);
    if (!candidate) { setMessage("This catalog entry failed local song validation and was not imported."); return; }
    const duplicate = songs.find(existing => existing.title.trim().toLocaleLowerCase() === row.title.trim().toLocaleLowerCase() && existing.artist.trim().toLocaleLowerCase() === row.artist.trim().toLocaleLowerCase());
    if (duplicate) { setMessage(`A song by this title and artist is already in your library (${duplicate.title}).`); return; }
    onImport({
      ...candidate,
      id: crypto.randomUUID(),
      title: row.title,
      artist: row.artist,
      bundled: false,
      sharedOrigin: undefined,
      rightsReview: undefined,
      catalogReview: undefined,
      source: { url: row.source_url ?? "", title: "Public repertoire catalog", attribution: row.attribution, authorization: row.license },
      tags: [...new Set([...candidate.tags, "public repertoire"])].slice(-12),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setMessage(`Added ${row.title} as a new local copy.`);
  };

  const shownRows = rows.filter(row => {
    const text = `${row.title} ${row.artist} ${row.attribution} ${row.license}`.toLocaleLowerCase();
    return text.includes(query.toLocaleLowerCase());
  });
  const reviewRows = shownRows.filter(row => row.status !== "published" && (reviewer || row.author_id === userId));

  return <details className="song-public-catalog">
    <summary>Public repertoire catalog · reviewed submissions</summary>
    {!songCloudConfigured() ? <p>Cloud services are not configured. The local library remains available.</p> : <>
      <p>Browse published drum arrangements, or submit a rights-reviewed song for independent moderation. Submissions omit personal notes, rehearsal comments, and original MusicXML files. Published scores include attribution and license details.</p>
      {signedIn ? <fieldset disabled={busy || !songRightsReviewCurrent(song)}>
        <legend>Submit “{song.title}” for review</legend>
        <label>License or permission terms<input maxLength={500} value={license} onChange={event => setLicense(event.target.value)} placeholder="Original work · CC BY 4.0 · documented permission" /></label>
        <label className="song-public-catalog-attest"><input type="checkbox" checked={attested} onChange={event => setAttested(event.target.checked)} />I have the rights to submit this arrangement for public distribution under the license above.</label>
        {!songRightsReviewCurrent(song) && <p>Complete the song’s current rights checklist before submitting it.</p>}
        <button type="button" className="button-secondary" disabled={!license.trim() || !attested || !songRightsReviewCurrent(song)} onClick={submit}>Submit for moderation</button>
      </fieldset> : <p>Sign in with your Drum Hero account to submit an arrangement. Browsing published songs is public.</p>}
      <div className="song-actions"><label>Search published songs<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, drummer, source, or license" /></label><button type="button" className="button-secondary" disabled={busy} onClick={() => void refresh().catch(error => setMessage(error instanceof Error ? error.message : "Could not refresh catalog."))}>Refresh catalog</button></div>
      {shownRows.filter(row => row.status === "published").map(row => <article className="song-public-catalog-item" key={row.id}>
        <div><h4>{row.title}</h4><p>{row.artist} · {row.attribution} · {row.license}</p>{row.source_url && <a href={row.source_url} target="_blank" rel="noreferrer">View source</a>}</div>
        <button type="button" className="button-secondary" onClick={() => importSong(row)}>Add local copy</button>
      </article>)}
      {shownRows.filter(row => row.status === "published").length === 0 && <p>No published arrangements match this search yet.</p>}
      {signedIn && reviewRows.length > 0 && <details className="song-public-catalog-review-queue">
        <summary>{reviewer ? "Moderation queue" : "Your submissions"}</summary>
        {reviewRows.map(row => <article key={row.id}>
          <h4>{row.title} · {row.status}</h4><p>{row.artist} · {row.attribution} · {row.license}</p>
          {row.moderation_note && <p>Review note: {row.moderation_note}</p>}
          {reviewer && row.status === "pending" && <><label>Moderator note<textarea maxLength={1000} value={reviewNote} onChange={event => setReviewNote(event.target.value)} /></label><div className="song-actions"><button type="button" disabled={busy || row.author_id === userId} onClick={() => moderate(row, "published")}>Approve and publish</button><button type="button" disabled={busy || row.author_id === userId} onClick={() => moderate(row, "rejected")}>Return to author</button></div>{row.author_id === userId && <p>Independent review required. You cannot moderate your own submission.</p>}</>}
        </article>)}
      </details>}
    </>}
    <p role="status">{busy ? "Working…" : message}</p>
  </details>;
}
