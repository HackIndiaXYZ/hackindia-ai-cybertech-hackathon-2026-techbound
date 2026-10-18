import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { HistoryEntry } from '../lib/standalone/index.js';

/**
 * Translation history for the Phase 3C standalone translator (plan §18: "review
 * translation history" / "clear history"). Kept IN MEMORY only — it is deliberately
 * not persisted to localStorage and never sent anywhere, because a live transcript
 * of what someone said in a public/private conversation is sensitive (§18 Rule).
 * Newest first, capped so an endless session cannot grow the array without bound.
 */
const MAX_ENTRIES = 50;

export interface StandaloneHistoryState {
  entries: HistoryEntry[];
}

const initialState: StandaloneHistoryState = { entries: [] };

const historySlice = createSlice({
  name: 'standaloneHistory',
  initialState,
  reducers: {
    addEntry(state, action: PayloadAction<HistoryEntry>) {
      state.entries.unshift(action.payload);
      if (state.entries.length > MAX_ENTRIES) state.entries.length = MAX_ENTRIES;
    },
    clearHistory(state) {
      state.entries = [];
    },
  },
});

export const { addEntry, clearHistory } = historySlice.actions;
export default historySlice.reducer;
