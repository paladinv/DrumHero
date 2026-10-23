"use client";

import { useState } from "react";
import { collectionSongIds, reorderCollection, smartRulesFromFilters, type LibraryFilters, type SmartPracticeState } from "@/lib/song-library-next";
import { allSongs, type SongLibraryState } from "@/lib/song-library";

const practiceOptions: Array<{ value: SmartPracticeState; label: string }> = [
  { value: "any", label: "Any practice history" },
  { value: "unpracticed", label: "Not practiced yet" },
  { value: "recent-needs-work", label: "Recent scored attempts below 80%" },
  { value: "due-review", label: "Due for review" }
];

export function SongSearchTools({ state, filters, tags, save, apply }: {
  state: SongLibraryState;
  filters: LibraryFilters;
  tags: string[];
  save: (state: SongLibraryState) => void;
  apply: (filters: LibraryFilters) => void;
}) {
  const [name, setName] = useState("");
  const [drag, setDrag] = useState("");
  const [practiceSelection, setPracticeSelection] = useState<{ collectionId: string; value: SmartPracticeState }>({ collectionId: "", value: "any" });
  const collection = state.collections.find((item) => item.id === filters.collection);
  const practiceState = practiceSelection.collectionId === (collection?.id ?? "")
    ? practiceSelection.value
    : collection?.smartRules?.practiceState ?? "any";
  const songs = allSongs(state);
  const collectionMembers = collection ? collectionSongIds(collection, songs, state) : [];
  const createSmartCollection = () => {
    if (!name.trim() || state.collections.length >= 100) return;
    save({ ...state, collections: [...state.collections, {
      id: crypto.randomUUID(),
      name: name.trim(),
      songIds: [],
      smartRules: smartRulesFromFilters(filters, practiceState)
    }] });
    setName("");
  };
  const updateSmartCollection = () => {
    if (!collection?.smartRules) return;
    save({ ...state, collections: state.collections.map((item) => item.id === collection.id
      ? { ...item, smartRules: smartRulesFromFilters(filters, practiceState) }
      : item) });
  };

  return <details className="song-tool-panel">
    <summary>Saved searches, smart collections and tags</summary>
    <fieldset>
      <legend>Require all selected tags</legend>
      {tags.map((tag) => <label key={tag}>
        <input type="checkbox" checked={filters.tags.includes(tag)} onChange={(event) => apply({ ...filters, tags: event.target.checked ? [...filters.tags, tag] : filters.tags.filter((item) => item !== tag) })} />
        {tag}
      </label>)}
    </fieldset>
    <label>Search or collection name<input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Practice progress rule
      <select value={practiceState} onChange={(event) => setPracticeSelection({ collectionId: collection?.id ?? "", value: event.target.value as SmartPracticeState })}>
        {practiceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <div className="song-actions">
      <button type="button" disabled={!name.trim() || (state.savedSearches?.length ?? 0) >= 100} onClick={() => {
        save({ ...state, savedSearches: [...(state.savedSearches ?? []), { id: crypto.randomUUID(), name: name.trim(), filters }].slice(-100) });
        setName("");
      }}>Save current search</button>
      <button type="button" disabled={!name.trim() || state.collections.length >= 100} onClick={createSmartCollection}>Create smart collection</button>
    </div>
    <p>Smart collections combine arrangement filters with the selected progress rule. “Recent scored attempts below 80%” looks at the last 90 days. Text search, favorites, archive visibility, and sort order remain view-only.</p>
    {state.savedSearches?.map((search) => <div className="song-actions" key={search.id}>
      <button type="button" onClick={() => apply(search.filters)}>Load search: {search.name}</button>
      <button type="button" onClick={() => save({ ...state, savedSearches: state.savedSearches?.filter((item) => item.id !== search.id) })}>Delete search: {search.name}</button>
    </div>)}
    {collection && <>
      {collection.smartRules ? <>
        <p>{collection.name} is rule-driven. It currently matches {collectionMembers.length} song{collectionMembers.length === 1 ? "" : "s"} and updates as practice changes.</p>
        <button type="button" onClick={updateSmartCollection}>Update rules from current filters and progress rule</button>
      </> : <>
        <p>Drag songs to reorder this collection, or use the move buttons. Choose Collection order in Sort to browse this order.</p>
        <ol>{collection.songIds.map((id, index) => <li key={id} draggable onDragStart={() => setDrag(id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
          event.preventDefault();
          if (drag) save(reorderCollection(state, collection.id, drag, id));
          setDrag("");
        }}>
          <span>{songs.find((song) => song.id === id)?.title ?? "Unavailable song"}</span>
          <button type="button" disabled={index === 0} onClick={() => save(reorderCollection(state, collection.id, id, collection.songIds[index - 1]))}>Move collection song {index + 1} up</button>
          <button type="button" disabled={index === collection.songIds.length - 1} onClick={() => save(reorderCollection(state, collection.id, id, collection.songIds[index + 1]))}>Move collection song {index + 1} down</button>
        </li>)}</ol>
      </>}
    </>}
  </details>;
}
