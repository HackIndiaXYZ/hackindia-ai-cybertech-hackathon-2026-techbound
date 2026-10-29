// Reviewer flagged: the guard mirrors middleware behaviour; removing it double-charges the meter (BILL-07).
import type { HandLandmarks } from '@isl/shared-types';

export interface StaticPredictionResult {
  prediction: string;
  confidence: number;
  success: boolean;
}

export interface DynamicPredictionResult {
  prediction: string;
  confidence: number;
  top_k: Array<{
    class: string;
    class_id?: number;
    probability?: number;
    overall_confidence?: number;
  }>;
  success: boolean;
}

export interface TranslateResult {
  formed_sentence: string;
  translated_sentence: string;
  success: boolean;
}

export interface FormatSentenceResult {
  formed_sentence: string;
  translated_sentence?: string;
  is_rule_based: boolean;
  success: boolean;
}

const API_BASE = '/api/v1/isl';

/**
 * Client for communicating with the trained Indian Sign Language Python ML engine.
 */
export const islEngineClient = {
  /**
   * Check if the backend ISL ML models are loaded and ready.
   */
  async getHealth(): Promise<{ status: string; engineAvailable: boolean }> {
    try {
      const resp = await fetch(`${API_BASE}/health`);
      if (!resp.ok) return { status: 'unavailable', engineAvailable: false };
      const json = await resp.json();
      return json.data ?? { status: 'unavailable', engineAvailable: false };
    } catch {
      return { status: 'unavailable', engineAvailable: false };
    }
  },

  /**
   * Classify hand landmarks into ISL character (1-9, A-Z) using the dual NN+RF models.
   */
  async predictStatic(landmarks: HandLandmarks): Promise<StaticPredictionResult> {
    try {
      const resp = await fetch(`${API_BASE}/predict/static`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landmarks }),
      });
      if (!resp.ok) return { prediction: '-', confidence: 0, success: false };
      const json = await resp.json();
      return json.data ?? json;
    } catch {
      return { prediction: '-', confidence: 0, success: false };
    }
  },

  /**
   * Classify dynamic video into ISL sign (Hospital, Monday, Thank You, etc.)
   * using the Hierarchical Gating + Two-Stream Transformer model.
   */
  async predictDynamic(videoBlob: Blob): Promise<DynamicPredictionResult> {
    const formData = new FormData();
    formData.append('video', videoBlob, 'gesture.webm');

    const resp = await fetch(`${API_BASE}/predict/dynamic`, {
      method: 'POST',
      body: formData,
    });
    if (!resp.ok) {
      throw new Error(`Dynamic prediction failed: ${resp.statusText}`);
    }
    const json = await resp.json();
    return json.data ?? json;
  },

  /**
   * Converts raw ISL gloss sentence to English and target Indian language.
   */
  async translate(sentence: string, language = 'hi'): Promise<TranslateResult> {
    const resp = await fetch(`${API_BASE}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence, language }),
    });
    if (!resp.ok) {
      throw new Error(`Translation failed: ${resp.statusText}`);
    }
    const json = await resp.json();
    return json.data ?? json;
  },

  /**
   * Converts ISL gloss tokens into a grammatically formed English sentence
   * and optional Indian language translation.
   */
  async formatSentence(glosses: string | string[], language?: string): Promise<FormatSentenceResult> {
    const resp = await fetch(`${API_BASE}/format_sentence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ glosses, language }),
    });
    if (!resp.ok) {
      throw new Error(`Sentence formation failed: ${resp.statusText}`);
    }
    const json = await resp.json();
    return json.data ?? json;
  },
};
