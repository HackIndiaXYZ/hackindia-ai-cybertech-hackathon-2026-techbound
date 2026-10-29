import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { IslIntermediateRepresentation, TranslationStartedPayload, TranslationCompletedPayload } from '@isl/shared-types';
import { callStarted } from './callSlice.js';

/**
 * In-call translation feed (plan §19 item 7, §24 translation events). Each entry
 * is attributable to the participant whose speech produced it — in a group of
 * five an unlabelled translation is useless.
 *
 * Entries mirror the wire contract: `translation:started` opens a row with the
 * source text, `translation:completed` fills in the ISL representation. A row
 * that never completes stays visibly `pending`; we never render a fabricated
 * result for a translation that did not arrive.
 */

export interface TranslationEntry {
  /** Correlation id shared by the started/completed event pair. */
  sourceTranscriptId: string;
  participantUserId: string;
  sourceText: string;
  representation: IslIntermediateRepresentation | null;
  /** True when the local translation attempt failed; never shown as pending. */
  failed: boolean;
  at: string;
}

export interface InCallTranslationState {
  entries: TranslationEntry[];
}

const MAX_ENTRIES = 30;

export const initialState: InCallTranslationState = { entries: [] };

const slice = createSlice({
  name: 'inCallTranslation',
  initialState,
  reducers: {
    translationStarted(state, action: PayloadAction<TranslationStartedPayload>) {
      const { sourceTranscriptId, participantUserId, sourceText } = action.payload;
      const existing = state.entries.find((e) => e.sourceTranscriptId === sourceTranscriptId);
      if (existing) {
        existing.sourceText = sourceText;
        return;
      }
      state.entries.push({
        sourceTranscriptId,
        participantUserId,
        sourceText,
        representation: null,
        failed: false,
        at: new Date().toISOString(),
      });
      if (state.entries.length > MAX_ENTRIES) state.entries.splice(0, state.entries.length - MAX_ENTRIES);
    },
    translationCompleted(state, action: PayloadAction<TranslationCompletedPayload>) {
      const { sourceTranscriptId, participantUserId, representation } = action.payload;
      const existing = state.entries.find((e) => e.sourceTranscriptId === sourceTranscriptId);
      if (existing) {
        existing.representation = representation;
        existing.failed = false;
        return;
      }
      // Completed without a started (e.g. joined mid-call): still show it,
      // attribution intact, source text unknown but never guessed.
      state.entries.push({
        sourceTranscriptId,
        participantUserId,
        sourceText: '',
        representation,
        failed: false,
        at: new Date().toISOString(),
      });
      if (state.entries.length > MAX_ENTRIES) state.entries.splice(0, state.entries.length - MAX_ENTRIES);
    },
    /** Local-only: the sender's own translation attempt threw. Mark it visibly. */
    translationFailed(state, action: PayloadAction<string>) {
      const existing = state.entries.find((e) => e.sourceTranscriptId === action.payload);
      if (existing) existing.failed = true;
    },
    translationsReset() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    // A new call starts with an empty translation feed.
    builder.addCase(callStarted, () => initialState);
  },
});

export const { translationStarted, translationCompleted, translationFailed, translationsReset } = slice.actions;
export default slice.reducer;
