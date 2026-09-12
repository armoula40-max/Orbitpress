'use strict';
/**
 * client.js — unified AI provider adapter.
 *
 * One interface for every text provider in providers.js:
 *   chat(cfg, request)  -> { content, mode, usage, model, finishReason }
 *   probe(cfg)          -> { ok, model, latencyMs, structured, sample|message }
 *
 * Structured-output differences are absorbed here (strict json_schema for
 * OpenAI-style APIs -> {type:'json_object'} -> plain + salvage; native
 * responseMimeType/responseSchema for Gemini). Nothing in article.js needs to
 * know which provider answered.
 */
const { requestJson } = require('../http');
const { isLoopback } = require('./providers');

function httpOptions(cfg) {
  return { allowHttp: !!cfg.allowHttp || isLoopback(cfg.baseUrl), timeoutMs: 180000 };
}

function openaiEndpoint(baseUrl) {
  const root = String(baseUrl || '').replace(/\/+$/, '');
  return root.endsWith('/chat/completions') ? root : `${root}/chat/completions`;
}

function geminiUrl(cfg, action) {
  // action '' = generateContent ; key in a header instead of the URL so it
  // never lands in proxy logs.
  const model = encodeURIComponent(cfg.model);
  return `${cfg.baseUrl.replace(/\/+$/, '')}/v1beta/models/${model}:${action}`;
}

/** Gemini accepts an OpenAPI-ish schema; drop keys it rejects. */
function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return undefined;
  const convert = (node) => {
    if (Array.isArray(node)) return node.map(convert);
    if (node && typeof node === 'object') {
      const out = {};
      for (const [key, value] of Object.entries(node)) {
        if (['additionalProperties', '$schema', '$ref', 'const'].includes(key)) continue;
        out[key] = convert(value);
      }
      return out;
    }
    return node;
  };
  const converted = convert(schema);
  // Gemini requires type + properties/items for OBJECT/ARRAY roots.
  return converted;
}

async function openaiChat(cfg, req) {
  const endpoint = openaiEndpoint(cfg.baseUrl);
  const headers = {
    ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    ...(cfg.headers || {}),
  };
  const ladder = [
    req.jsonSchema ? { mode: 'json_schema', response_format: { type: 'json_schema', json_schema: { name: 'orbitpress_article', strict: true, schema: req.jsonSchema } } } : null,
    { mode: 'json_object', response_format: { type: 'json_object' } },
    { mode: 'plain', response_format: undefined },
  ].filter(Boolean);

  let lastError = null;
  for (const step of ladder) {
    // Token budget ladder: some gateways cap max_tokens far below what long
    // articles need. Repeatedly shrink the SAME request (×0.66) until it fits,
    // before giving up on the response_format mode.
    let budget = req.maxTokens || 8000;
    for (let tokenAttempt = 0; tokenAttempt < 6; tokenAttempt += 1) {
      const body = {
        model: cfg.model,
        messages: req.messages,
        temperature: req.temperature != null ? req.temperature : 0.7,
        max_tokens: budget,
      };
      if (step.response_format) body.response_format = step.response_format;
      try {
        const response = await requestJson(endpoint, 'POST', headers, body, httpOptions(cfg));
        const choice = response && response.choices && response.choices[0];
        const content = choice && choice.message && choice.message.content;
        if (typeof content !== 'string') {
          const err = new Error(`Article API error: المزوّد أعاد ردًا بلا محتوى نصي (choices[0].message.content مفقود).`);
          err.status = 502;
          throw err;
        }
        return { content, mode: step.mode, usage: response.usage || null, finishReason: choice.finish_reason || '', model: response.model || cfg.model };
      } catch (error) {
        lastError = error;
        const status = Number(error && error.status) || 0;
        const message = String(error && error.message || '').toLowerCase();
        const formatRelated = /response.format|json_schema|json schema|structured|unsupported|unknown argument|invalid.*format|not supported|response_mimetype/.test(message);
        const tokenLimit = /max_tokens|maximum|too large|context.length|token limit|longer than|exceed/.test(message);
        if (tokenLimit && (status === 400 || status === 422 || status === 413) && budget > 64) {
          budget = Math.max(64, Math.round(budget * 0.66));
          continue; // retry the same mode with a smaller budget
        }
        const retryable = (status === 400 || status === 422) && formatRelated;
        if (!retryable && !(status === 0 && formatRelated)) throw explain(error);
        break; // format refused at this ladder step -> try the next mode
      }
    }
  }
  throw explain(lastError);
}

async function geminiChat(cfg, req) {
  const endpoint = geminiUrl(cfg, 'generateContent');
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey };
  const [systemMessage, ...rest] = req.messages;
  const systemInstruction = systemMessage && systemMessage.role === 'system'
    ? { parts: [{ text: systemMessage.content }] }
    : undefined;
  const contents = (systemInstruction ? rest : req.messages)
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const attempts = [
    req.jsonSchema
      ? { mode: 'native-schema', generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(req.jsonSchema) } }
      : null,
    { mode: 'native-json', generationConfig: { responseMimeType: 'application/json' } },
    { mode: 'plain', generationConfig: {} },
  ].filter(Boolean);

  let lastError = null;
  for (const attempt of attempts) {
    const body = {
      ...(systemInstruction ? { systemInstruction } : {}),
      contents,
      generationConfig: {
        temperature: req.temperature != null ? req.temperature : 0.7,
        maxOutputTokens: req.maxTokens || 8000,
        ...attempt.generationConfig,
      },
    };
    try {
      const response = await requestJson(endpoint, 'POST', headers, body, httpOptions(cfg));
      if (response.promptFeedback && response.promptFeedback.blockReason) {
        throw Object.assign(new Error(`Gemini حجب الطلب: ${response.promptFeedback.blockReason}`), { status: 422 });
      }
      const candidate = response && response.candidates && response.candidates[0];
      const parts = candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
      const content = parts.map((p) => p.text || '').join('').trim();
      if (!content) throw Object.assign(new Error('Gemini أعاد ردًا فارغًا.'), { status: 502 });
      return { content, mode: attempt.mode, usage: response.usageMetadata || null, finishReason: candidate.finishReason || '', model: cfg.model };
    } catch (error) {
      lastError = error;
      const message = String(error && error.message || '').toLowerCase();
      const formatRelated = /responseschema|response_mimetype|schema|unsupported|invalid argument/.test(message);
      const status = Number(error && error.status) || 0;
      // Drop the schema, then drop the JSON mime; otherwise surface.
      if (!formatRelated && status !== 400) throw explain(error);
    }
  }
  throw explain(lastError);
}

function explain(error) {
  if (error && error.providerExplained) return error;
  const status = error && error.status ? ` (HTTP ${error.status})` : '';
  const raw = String((error && error.message) || error || '').trim();
  const snippet = raw.replace(/^Request failed \(\d+\):\s*/i, '').slice(0, 400);
  const explained = new Error(`Article API error${status}: ${snippet || 'لا يوجد رد من المزوّد'}`);
  explained.providerExplained = true;
  explained.status = error && error.status;
  return explained;
}

/** Unified entry point. */
async function chat(cfg, request) {
  const problems = require('./providers').validateConfig(cfg);
  if (problems.length) throw new Error(`إعدادات مزوّد النصوص غير مكتملة: ${problems.join(' · ')}`);
  if (cfg.kind === 'gemini') return geminiChat(cfg, request);
  return openaiChat(cfg, request);
}

/**
 * Connectivity + capability probe: auth works, model answers, and whether a
 * JSON-mode response was accepted by THIS model (so the UI can say so instead
 * of guessing).
 */
async function probe(cfg) {
  const started = Date.now();
  const messages = [
    { role: 'user', content: 'Reply with exactly the JSON object {"ok":true} and nothing else.' },
  ];
  try {
    // First the JSON-mode probe — its success/failure reveals structured support.
    const result = await chat(cfg, { messages, temperature: 0, maxTokens: 64, jsonSchema: undefined });
    const structured = /json/.test(result.mode);
    return {
      ok: true, preset: cfg.presetId, label: cfg.label, model: cfg.model,
      latencyMs: Date.now() - started, structured, mode: result.mode,
      vision: !!cfg.vision, kind: cfg.kind,
      sample: String(result.content || '').replace(/\s+/g, ' ').slice(0, 80),
    };
  } catch (error) {
    return {
      ok: false, preset: cfg.presetId, label: cfg.label, model: cfg.model,
      latencyMs: Date.now() - started, vision: !!cfg.vision, kind: cfg.kind,
      message: String(error.message || error),
    };
  }
}

module.exports = { chat, probe, openaiChat, geminiChat, toGeminiSchema, openaiEndpoint };
