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
   *
   * format 'ogg'  -> opus in an ogg container (audio/ogg;codecs=opus).
   *                  This is what Telegram voice notes require.
   * format 'wav'  -> linear16 in a wav container, for generic audio players.
   *
   * Aura caps a single request at 2000 characters, so longer text is
   * truncated at a sentence boundary rather than rejected outright.
   */
  async textToSpeech(text, { voice = 'aura-asteria-en', format = 'ogg' } = {}) {
    try {
      const spoken = this.truncateForSpeech(text);
      logger.info(`🔊 Converting text to speech (${voice}, ${format}, ${spoken.length} chars)...`);

      const mediaOptions = format === 'wav'
        ? { encoding: 'linear16', container: 'wav' }
        : { encoding: 'opus', container: 'ogg' };

      const response = await this.client.speak.request(
        { text: spoken },
        {
          // In v3 the voice is the model
          model: voice,
          ...mediaOptions
        }
      );

      const stream = await response.getStream();
      const audioBuffer = await streamToBuffer(stream);

      if (!audioBuffer.length) {
        throw new Error('Deepgram returned an empty audio stream');
      }

      logger.info(`✅ Speech generated (${audioBuffer.length} bytes)`);

      return {
        audioBuffer,
        contentType: format === 'wav' ? 'audio/wav' : 'audio/ogg',
        size: audioBuffer.length,
        truncated: spoken.length < text.length
      };
    } catch (error) {
      logger.error(`Text-to-speech error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Keep TTS input under Aura's 2000 character limit, cutting at the last
   * sentence end (or word break) so the audio doesn't stop mid-word.
   */
  truncateForSpeech(text, limit = 1900) {
    if (text.length <= limit) return text;

    const head = text.slice(0, limit);
    const sentenceEnd = Math.max(
      head.lastIndexOf('. '),
      head.lastIndexOf('! '),
      head.lastIndexOf('? ')
    );

    if (sentenceEnd > limit * 0.5) return head.slice(0, sentenceEnd + 1);

    const wordBreak = head.lastIndexOf(' ');
    return (wordBreak > 0 ? head.slice(0, wordBreak) : head) + '...';
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
