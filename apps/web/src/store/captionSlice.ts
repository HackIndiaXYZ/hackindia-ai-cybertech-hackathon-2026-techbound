import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  applyFinal,
  applyInterim,
  clearInterim,
  emptyCaptionState,
  type CaptionLine,
  type CaptionState,
} from '../lib/speech/transcriptModel.js';
import { callStarted } from './callSlice.js';

/**
 * Live caption state for the Phase 2C speech pipeline. It is a thin Redux home
 * for the pure {@link CaptionState} model: interim text per speaker (replaceable)
 * kept separate from committed final lines (stable, de-duplicated). Nothing here
 * mutates the pure model's invariants — interim never leaks into finals.
 */
const slice = createSlice({
  name: 'captions',
  initialState: emptyCaptionState as CaptionState,
  reducers: {
    captionInterim(state, action: PayloadAction<CaptionLine>) {
      return applyInterim(state, action.payload);
    },
    captionFinal(state, action: PayloadAction<CaptionLine>) {
      return applyFinal(state, action.payload);
    },
    captionInterimCleared(state, action: PayloadAction<string>) {
      return clearInterim(state, action.payload);
    },
    captionsReset() {
      return emptyCaptionState;
    },
  },
  extraReducers: (builder) => {
    // A new call starts a clean caption slate.
    builder.addCase(callStarted, () => emptyCaptionState);
  },
});

export const { captionInterim, captionFinal, captionInterimCleared, captionsReset } = slice.actions;
export default slice.reducer;
