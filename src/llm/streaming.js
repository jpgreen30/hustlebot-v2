/**
 * PHASE 2.1: STREAMING LLM RESPONSES
 *
 * Real-time streaming output from LLM providers.
 * Enables progressive text generation without waiting for full completion.
 */

import logger from '../utils/logger.js';
import fetch from 'node-fetch';

/**
 * Streaming LLM Provider
 * Wraps OpenRouter/Anthropic APIs with streaming support
 */
class StreamingLLMProvider {
  /**
   * OpenRouter streaming completion
   * Yields text chunks in real-time
   */
  static async *openrouterStream(prompt, options = {}) {
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY not set');
      }

      const model = options.model || 'deepseek/deepseek-chat';

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://hustlebot.io',
          'X-Title': 'HustleBot v2'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 2000
        })
      });

      if (!response.ok) {
        throw new Error(`OpenRouter error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Process complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();

          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              continue;
            }

            try {
              const json = JSON.parse(data);

              // Extract token counts from usage field
              if (json.usage) {
                totalInputTokens = json.usage.prompt_tokens || 0;
                totalOutputTokens = json.usage.completion_tokens || 0;
              }

              // Yield content chunk
              if (json.choices?.[0]?.delta?.content) {
                yield {
                  type: 'chunk',
                  content: json.choices[0].delta.content
                };
              }

              // Yield token info when available
              if (json.usage) {
                yield {
                  type: 'tokens',
                  inputTokens: totalInputTokens,
                  outputTokens: totalOutputTokens
                };
              }
            } catch (e) {
              // Skip unparseable lines
            }
          }
        }

        // Keep incomplete line in buffer
        buffer = lines[lines.length - 1];
      }

      // Final token count
      yield {
        type: 'complete',
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens
      };
    } catch (error) {
      logger.error(`OpenRouter streaming error: ${error.message}`);
      yield { type: 'error', error: error.message };
    }
  }

  /**
   * Anthropic streaming completion
   * Yields text chunks in real-time
   */
  static async *anthropicStream(prompt, options = {}) {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not set');
      }

      const model = options.model || 'claude-3-5-sonnet-20241022';

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens || 2000,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature || 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Process complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();

          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            try {
              const json = JSON.parse(data);

              // Handle text delta
              if (json.type === 'content_block_delta') {
                if (json.delta?.type === 'text_delta') {
                  yield {
                    type: 'chunk',
                    content: json.delta.text
                  };
                }
              }

              // Handle message end with usage
              if (json.type === 'message_delta' && json.usage) {
                totalOutputTokens = json.usage.output_tokens || 0;
              }

              // Handle message start with usage
              if (json.type === 'message_start' && json.message?.usage) {
                totalInputTokens = json.message.usage.input_tokens || 0;
              }
            } catch (e) {
              // Skip unparseable lines
            }
          }
        }

        // Keep incomplete line in buffer
        buffer = lines[lines.length - 1];
      }

      // Final token count
      yield {
        type: 'complete',
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens
      };
    } catch (error) {
      logger.error(`Anthropic streaming error: ${error.message}`);
      yield { type: 'error', error: error.message };
    }
  }

  /**
   * OpenAI streaming completion
   * Yields text chunks in real-time
   */
  static async *openaiStream(prompt, options = {}) {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY not set');
      }

      const model = options.model || 'gpt-4o';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 2000
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Process complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();

          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              continue;
            }

            try {
              const json = JSON.parse(data);

              // Yield content chunk
              if (json.choices?.[0]?.delta?.content) {
                yield {
                  type: 'chunk',
                  content: json.choices[0].delta.content
                };
              }

              // Extract token counts from usage (only on stream end)
              if (json.usage) {
                totalInputTokens = json.usage.prompt_tokens || 0;
                totalOutputTokens = json.usage.completion_tokens || 0;
              }
            } catch (e) {
              // Skip unparseable lines
            }
          }
        }

        // Keep incomplete line in buffer
        buffer = lines[lines.length - 1];
      }

      // Final token count
      yield {
        type: 'complete',
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens
      };
    } catch (error) {
      logger.error(`OpenAI streaming error: ${error.message}`);
      yield { type: 'error', error: error.message };
    }
  }

  /**
   * Aggregate streaming response into complete text
   */
  static async aggregateStream(streamGenerator) {
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of streamGenerator) {
      if (chunk.type === 'chunk') {
        fullText += chunk.content;
      } else if (chunk.type === 'tokens') {
        inputTokens = chunk.inputTokens;
        outputTokens = chunk.outputTokens;
      } else if (chunk.type === 'complete') {
        inputTokens = chunk.inputTokens;
        outputTokens = chunk.outputTokens;
      } else if (chunk.type === 'error') {
        throw new Error(chunk.error);
      }
    }

    return {
      content: fullText,
      tokens: { input: inputTokens, output: outputTokens }
    };
  }

  /**
   * Stream to event listener callback (e.g., for WebSocket)
   */
  static async streamToCallback(streamGenerator, onChunk, onComplete, onError) {
    try {
      for await (const chunk of streamGenerator) {
        try {
          if (chunk.type === 'chunk') {
            onChunk(chunk.content);
          } else if (chunk.type === 'complete') {
            onComplete(chunk);
          } else if (chunk.type === 'error') {
            onError(chunk.error);
            return;
          }
        } catch (callbackError) {
          logger.error(`Callback error: ${callbackError.message}`);
          onError(callbackError.message);
          return;
        }
      }
    } catch (error) {
      logger.error(`Stream error: ${error.message}`);
      onError(error.message);
    }
  }
}

/**
 * Express/WebSocket integration for streaming responses
 */
class StreamingAPIResponse {
  /**
   * Middleware for streaming endpoint
   * Usage: router.post('/api/stream', StreamingAPIResponse.handler)
   */
  static async handler(req, res) {
    try {
      const { prompt, provider, options } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: 'prompt required' });
      }

      // Set streaming headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const selectedProvider = provider || process.env.OPENROUTER_API_KEY ? 'openrouter' : 'anthropic';
      let streamGenerator;

      switch (selectedProvider) {
        case 'openrouter':
          streamGenerator = StreamingLLMProvider.openrouterStream(prompt, options);
          break;
        case 'anthropic':
          streamGenerator = StreamingLLMProvider.anthropicStream(prompt, options);
          break;
        case 'openai':
          streamGenerator = StreamingLLMProvider.openaiStream(prompt, options);
          break;
        default:
          return res.status(400).json({ error: `Unknown provider: ${selectedProvider}` });
      }

      // Stream chunks to client
      for await (const chunk of streamGenerator) {
        if (chunk.type === 'chunk') {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        } else if (chunk.type === 'complete') {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          res.write('data: [DONE]\n\n');
        } else if (chunk.type === 'error') {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      }

      res.end();
    } catch (error) {
      logger.error(`Streaming handler error: ${error.message}`);
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  }

  /**
   * Client-side example: Parse streaming response
   */
  static parseClientStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return async function* parse() {
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data !== '[DONE]') {
              try {
                yield JSON.parse(data);
              } catch (e) {
                // Skip unparseable
              }
            }
          }
        }

        buffer = lines[lines.length - 1];
      }
    };
  }
}

export { StreamingLLMProvider, StreamingAPIResponse };
