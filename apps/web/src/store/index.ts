import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import authReducer from './authSlice.js';
import settingsReducer from './settingsSlice.js';
import voiceReducer from './voiceSlice.js';
import callReducer from './callSlice.js';
import captionReducer from './captionSlice.js';
import activeSpeakerReducer from './activeSpeakerSlice.js';
import inCallTranslationReducer from './translationSlice.js';
import standaloneHistoryReducer from './standaloneHistorySlice.js';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    settings: settingsReducer,
    voice: voiceReducer,
    call: callReducer,
    captions: captionReducer,
    activeSpeaker: activeSpeakerReducer,
    inCallTranslation: inCallTranslationReducer,
    standaloneHistory: standaloneHistoryReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
