import assert from 'node:assert/strict';
import test from 'node:test';
import { generateWithGemini, publicGeminiError, safeGeminiDiagnostic } from './gemini.js';

test('generateWithGemini uses the official SDK and structured response config', async () => {
  let request;
  const result = await generateWithGemini('test prompt', { type: 'OBJECT' }, {
    apiKey: 'test-key',
    createClient: (apiKey) => {
      assert.equal(apiKey, 'test-key');
      return {
        models: {
          generateContent: async (params) => {
            request = params;
            return { text: '{"ok":true}' };
          },
        },
      };
    },
  });

  assert.equal(result, '{"ok":true}');
  assert.equal(request.model, 'gemini-flash-latest');
  assert.equal(request.contents, 'test prompt');
  assert.equal(request.config.responseMimeType, 'application/json');
  assert.deepEqual(request.config.responseSchema, { type: 'OBJECT' });
  assert.match(request.config.systemInstruction, /BizPlan AI/);
  assert.match(request.config.systemInstruction, /Jangan mengarang riset pasar/);
  assert.match(request.config.systemInstruction, /roadmap 7\/30\/90 hari dan 12 bulan/);
  assert.match(request.config.systemInstruction, /Jangan samakan omzet dengan laba/);
  assert.equal(request.config.httpOptions.timeout, 60000);
  assert.equal(request.config.httpOptions.retryOptions.attempts, 1);
});

test('generateWithGemini explicitly rejects a missing API key', async () => {
  await assert.rejects(
    generateWithGemini('test prompt', undefined, { apiKey: '' }),
    (error) => error.code === 'AI_NOT_CONFIGURED',
  );
});

test('provider authentication errors become safe actionable messages', () => {
  const error = publicGeminiError({ status: 403, message: 'sensitive provider details' });
  assert.equal(error.status, 401);
  assert.equal(error.code, 'GEMINI_KEY_INVALID');
  assert.match(error.message, /GEMINI_API_KEY/);
  assert.doesNotMatch(error.message, /sensitive provider details/);
});

test('provider quota errors are surfaced as rate-limit errors', () => {
  const error = publicGeminiError({ status: 429, message: 'quota exceeded' });
  assert.equal(error.status, 429);
  assert.equal(error.code, 'GEMINI_QUOTA_EXCEEDED');
  assert.match(error.message, /Kuota/);
});

test('JSON-encoded provider timeout and unavailable errors retain their classification', () => {
  const timeout = publicGeminiError({
    name: 'ApiError',
    message: JSON.stringify({
      error: { code: 504, message: 'Deadline expired before operation could complete.', status: 'DEADLINE_EXCEEDED' },
    }),
  });
  assert.equal(timeout.status, 504);
  assert.equal(timeout.code, 'GEMINI_TIMEOUT');

  const unavailable = publicGeminiError({
    name: 'ApiError',
    message: JSON.stringify({
      error: { code: 503, message: 'The service is temporarily unavailable.', status: 'UNAVAILABLE' },
    }),
  });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.code, 'GEMINI_TEMPORARILY_UNAVAILABLE');
});

test('temporary model capacity errors ask users to retry', () => {
  const error = publicGeminiError({
    status: 503,
    message: 'This model is currently experiencing high demand.',
  });
  assert.equal(error.status, 503);
  assert.equal(error.code, 'GEMINI_TEMPORARILY_UNAVAILABLE');
  assert.match(error.message, /coba lagi/);
});

test('model access errors are reported separately from invalid API keys', () => {
  const error = publicGeminiError({ status: 404, message: 'model not found' });
  assert.equal(error.status, 404);
  assert.equal(error.code, 'GEMINI_MODEL_UNAVAILABLE');
  assert.match(error.message, /Model Gemini/);

  const retired = publicGeminiError({
    status: 404,
    message: 'This model models/gemini-2.5-flash is no longer available to new users.',
  });
  assert.equal(retired.code, 'GEMINI_MODEL_UNAVAILABLE');
});

test('generateWithGemini rejects an empty provider response explicitly', async () => {
  await assert.rejects(
    generateWithGemini('test prompt', undefined, {
      apiKey: 'test-key',
      createClient: () => ({ models: { generateContent: async () => ({ text: '  ' }) } }),
    }),
    (error) => error.code === 'AI_EMPTY_RESPONSE',
  );
});

test('network errors from the SDK are marked as Gemini provider errors', async () => {
  let thrown;
  try {
    await generateWithGemini('test prompt', undefined, {
      apiKey: 'test-key',
      createClient: () => ({
        models: { generateContent: async () => { throw new TypeError('fetch failed'); } },
      }),
    });
  } catch (error) {
    thrown = error;
  }
  assert.equal(thrown.geminiProviderError, true);
  assert.equal(publicGeminiError(thrown).code, 'GEMINI_NETWORK_ERROR');
});

test('invalid provider keys and nested HTTP errors are classified', () => {
  const invalidKey = publicGeminiError({ status: 400, message: 'API key not valid' });
  assert.equal(invalidKey.status, 401);
  assert.equal(invalidKey.code, 'GEMINI_KEY_INVALID');

  const missingModel = publicGeminiError({ response: { status: 404 }, message: 'Not found' });
  assert.equal(missingModel.code, 'GEMINI_MODEL_UNAVAILABLE');
});

test('Gemini timeouts and network errors return actionable messages', () => {
  const timeout = publicGeminiError({ code: 'ETIMEDOUT', message: 'request timed out' });
  assert.equal(timeout.status, 504);
  assert.equal(timeout.code, 'GEMINI_TIMEOUT');

  const providerDeadline = publicGeminiError({
    status: 504,
    message: 'Deadline expired before operation could complete.',
  });
  assert.equal(providerDeadline.code, 'GEMINI_TIMEOUT');

  const network = publicGeminiError({ code: 'ECONNREFUSED', message: 'fetch failed' });
  assert.equal(network.status, 502);
  assert.equal(network.code, 'GEMINI_NETWORK_ERROR');
});

test('Gemini diagnostics redact API keys', () => {
  const diagnostic = safeGeminiDiagnostic({
    name: 'ProviderError',
    status: 400,
    message: 'Invalid API key AQ.test-secret-value-1234567890',
  }, 'AQ.test-secret-value-1234567890');
  assert.equal(diagnostic.status, 400);
  assert.doesNotMatch(diagnostic.message, /test-secret-value/);
  assert.match(diagnostic.message, /\[REDACTED\]/);
});
