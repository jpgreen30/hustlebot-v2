/**
 * DEEPGRAM VOICE INTEGRATION
 *
 * Speech-to-Text (voice → text)
 * Text-to-Speech (text → voice)
 *
 * Targets @deepgram/sdk v3.x.
 */

import { createClient } from '@deepgram/sdk';
import logger from '../utils/logger.js';

/**
 * Collect a Deepgram audio stream into a Buffer.
 * speak.request().getStream() returns a web ReadableStream.
 */
async function streamToBuffer(stream) {
  if (!stream) {
    throw new Error('Deepgram returned no audio stream');
  }

  const chunks = [];

  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
  } else {
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
  }

  return Buffer.concat(chunks);
}

class DeepgramVoiceClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    // v3 takes the key as a string, not { apiKey }
    this.client = createClient(apiKey);
  }

  /**
   * Convert voice message to text (speech-to-text)
   */
  async speechToText(audioBuffer, mimeType = 'audio/ogg') {
    try {
      logger.info(`🎤 Converting speech to text (${audioBuffer.length} bytes, ${mimeType})...`);

      const { result, error } = await this.client.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: 'nova-2',
          language: 'en',
          smart_format: true,
          punctuate: true,
          mimetype: mimeType
        }
      );

      if (error) {
        throw new Error(`Deepgram transcription failed: ${error.message || JSON.stringify(error)}`);
      }

      const alternative = result?.results?.channels?.[0]?.alternatives?.[0];
      const transcript = alternative?.transcript || '';
      logger.info(`✅ Transcript: ${transcript}`);

      return {
        text: transcript,
        confidence: alternative?.confidence || 0
      };
    } catch (error) {
      logger.error(`Speech-to-text error: ${error.message}`);
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
        { text },
        {
          // In v3 the voice is the model
          model: voice,
          encoding: 'linear16',
          container: 'wav'
        }
      );

      const stream = await response.getStream();
      const audioBuffer = await streamToBuffer(stream);
      logger.info(`✅ Speech generated (${audioBuffer.length} bytes)`);

      return {
        audioBuffer,
        contentType: 'audio/wav',
        size: audioBuffer.length
      };
    } catch (error) {
      logger.error(`Text-to-speech error: ${error.message}`);
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
