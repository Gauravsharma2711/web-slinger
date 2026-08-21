import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

/**
 * Initializes the Vertex AI client using Application Default Credentials (ADC).
 * Location defaults to 'global' and model to 'gemini-3.7-flash'.
 * No Gemini API keys or service-account JSON files are used.
 * Note: Gemini is prepared here but not called yet in Day 2 foundation.
 */
export function createGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: config.googleCloudProject || undefined,
    location: config.googleCloudLocation,
  });
}

export const geminiModel = config.geminiModelId;
