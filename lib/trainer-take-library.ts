export type TrainerClipSettings = { feel?: string; swingRatio?: number; pocketMs?: number; learningMode?: string; source?: string; inputProfile?: string; targetVoice?: string; beatsPerBar?: number };
export type TrainerDynamicsMarker = { timeMs: number; velocity: number };
export type TrainerClip = { blob: Blob; expectedMarkersMs: number[]; actualMarkersMs: number[]; expectedDynamics?: TrainerDynamicsMarker[]; actualDynamics?: TrainerDynamicsMarker[]; bookmarksMs?: number[]; patternId: string; patternName: string; bpm: number; createdAt: string; settings?: TrainerClipSettings };
export type TrainerCoachReviewRecord = { patternName: string; bpm: number; receivedAt: string; comments: Array<{ id: string; timeMs: number; note: string; createdAt: string }> };
export type SavedTrainerTake = TrainerClip & { id: string; name: string; pinned: boolean; notes?: string; coachReviews?: TrainerCoachReviewRecord[] };
const limit = 12;
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('drum-hero-trainer-takes', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('takes', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Drum Hero tabs and try again.'));
  });
}
export async function readTrainerTakes(): Promise<SavedTrainerTake[]> {
  const database = await open();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction('takes').objectStore('takes').getAll();
      request.onsuccess = () => resolve((request.result as SavedTrainerTake[]).filter(take => take.blob instanceof Blob).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}
export async function changeTrainerTake(action: 'save' | 'update' | 'delete', take: SavedTrainerTake) {
  const database = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('takes', 'readwrite');
      const store = transaction.objectStore('takes');
      const request = store.getAll();
      let reason = '';
      request.onsuccess = () => {
        const current = request.result as SavedTrainerTake[];
        if (action === 'save' && current.length >= limit) reason = 'Recording library is full (12 takes). Delete a take first.';
        if (action === 'update' && !current.some(item => item.id === take.id)) reason = 'This take was deleted in another tab. Refresh the library.';
        if (action !== 'delete' && take.pinned && current.filter(item => item.pinned && item.id !== take.id).length >= 4) reason = 'Unpin a reference first (maximum four).';
        if (reason) { transaction.abort(); return; }
        if (action === 'delete') store.delete(take.id);
        else store.put(take);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(new Error(reason || 'Recording could not be saved. Check available storage.'));
    });
  } finally { database.close(); }
}
