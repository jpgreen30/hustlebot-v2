/**
 * DEEPGRAM VOICE INTEGRATION
 *
 * Speech-to-Text (voice → text)
 * Text-to-Speech (text → voice)
 */

import { createClient } from '@deepgram/sdk';
import logger from '../utils/logger.js';
import fetch from 'node-fetch';

class DeepgramVoiceClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = createClient({ apiKey });
  }

  /**
   * Convert voice message to text (speech-to-text)
   */
  async speechToText(audioBuffer, mimeType = 'audio/ogg') {
    try {
      logger.info('🎤 Converting speech to text...');

      const response = await this.client.listen.prerecorded(
        {
          buffer: audioBuffer,
          mimetype: mimeType
        },
        {
          model: 'nova-2',
          language: 'en',
          smart_format: true,
          punctuation: true
        }
      );

      const transcript = response.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      logger.info(`✅ Transcript: ${transcript}`);

      return {
        text: transcript,
        confidence: response.result?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0
      };
    } catch (error) {
      logger.error('Speech-to-text error:', error);
      throw error;
    }
  }

  /**
   * Convert text to speech
   */
  async textToSpeech(text, voice = 'aura-asteria-en') {
    try {
      logger.info(`🔊 Converting text to speech (${voice})...`);

      const response = await this.client.speak.request(
        {
          text: text
        },
        {
          model: 'aura',
          encoding: 'linear16',
          container: 'wav'
        }
      );

      // Get audio stream
      const audioBuffer = await response.getStream();
      logger.info('✅ Speech generated');

      return {
        audioBuffer,
        contentType: 'audio/wav',
        size: audioBuffer.length
      };
    } catch (error) {
      logger.error('Text-to-speech error:', error);
      throw error;
    }
  }

  /**
   * Get available voices
   */
  getAvailableVoices() {
    return [
      { id: 'aura-asteria-en', name: 'Asteria (Female)' },
      { id: 'aura-luna-en', name: 'Luna (Female)' },
      { id: 'aura-stella-en', name: 'Stella (Female)' },
      { id: 'aura-athena-en', name: 'Athena (Female)' },
      { id: 'aura-hera-en', name: 'Hera (Female)' },
      { id: 'aura-orion-en', name: 'Orion (Male)' },
      { id: 'aura-arcas-en', name: 'Arcas (Male)' },
      { id: 'aura-perseus-en', name: 'Perseus (Male)' },
      { id: 'aura-angus-en', name: 'Angus (Male)' },
      { id: 'aura-orpheus-en', name: 'Orpheus (Male)' }
    ];
  }
}

/**
 * Initialize Deepgram client
 */
export async function initDeepgram() {
  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      logger.warn('⚠️  DEEPGRAM_API_KEY not set, voice features unavailable');
      return null;
    }

    const client = new DeepgramVoiceClient(process.env.DEEPGRAM_API_KEY);
    logger.info('✅ Deepgram voice client ready');
    return client;
  } catch (error) {
    logger.error('Failed to initialize Deepgram:', error.message);
    return null;
  }
}

export { DeepgramVoiceClient };
