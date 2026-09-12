'use strict';
/**
 * providers.js — official registry of AI text providers.
 *
 * Every provider is described declaratively; the adapter in client.js turns a
 * resolved config into real HTTP requests. Adding a provider is a one-entry
 * change here instead of new branching inside article generation.
 *
 * kind:
 *   'openai'        OpenAI-compatible /chat/completions API (most providers)
 *   'openai-account' same, but the base URL contains an {accountId} segment
 *   'gemini'        Google's native generateContent API
 */

const PRESETS = [
  {
    id: 'gemini', kind: 'gemini',
    label: 'Google Gemini (الواجهة الأصلية)',
    baseUrl: 'https://generativelanguage.googleapis.com',
    keyLabel: 'Gemini API key',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b'],
    structured: 'native', vision: true,
    note: 'مفتاح من aistudio.google.com/apikey — دعم JSON المنظّم ممتاز.',
  },
  {
    id: 'openrouter', kind: 'openai',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyLabel: 'OpenRouter API key',
    models: ['deepseek/deepseek-chat', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct'],
    structured: 'json_schema', vision: true,
    headers: { 'HTTP-Referer': 'https://orbitpress.local', 'X-Title': 'OrbitPress' },
  },
  {
    id: 'deepseek', kind: 'openai',
    label: 'DeepSeek الرسمي',
    baseUrl: 'https://api.deepseek.com',
    keyLabel: 'DeepSeek API key',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    structured: 'json_object', vision: false,
  },
  {
    id: 'nvidia', kind: 'openai',
    label: 'NVIDIA NIM (build.nvidia.com)',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    keyLabel: 'NVIDIA API key',
    models: ['deepseek-ai/deepseek-r1', 'meta/llama-3.3-70b-instruct', 'mistralai/mistral-small-24b-instruct'],
    structured: 'json_object', vision: false,
  },
  {
    id: 'groq', kind: 'openai',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyLabel: 'Groq API key',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    structured: 'json_object', vision: false,
  },
  {
    id: 'together', kind: 'openai',
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    keyLabel: 'Together API key',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V3'],
    structured: 'json_object', vision: false,
  },
  {
    id: 'openai', kind: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyLabel: 'OpenAI API key',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    structured: 'json_schema', vision: true,
  },
  {
    id: 'cloudflare-llm', kind: 'openai-account',
    label: 'Cloudflare Workers AI (نصوص)',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1',
    keyLabel: 'Cloudflare API token',
    needsAccountId: true,
    models: ['@cf/meta/llama-3.1-8b-instruct-fast', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'],
    structured: 'json_object', vision: false,
    note: 'نفس Account ID والـToken المستخدمين لقسم الصور؛ النصوص والصور يبقيان قسمين مستقلين.',
  },
  {
    id: 'ollama', kind: 'openai',
    label: 'Ollama (خادم محلي / VPS)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    keyLabel: 'لا يحتاج مفتاحًا (اتركه فارغًا)',
    models: ['qwen2.5:14b', 'llama3.1:8b', 'gemma3:12b'],
    structured: 'json_object', vision: false, noKey: true, allowHttp: true,
    note: 'يجب أن يصل خادم OrbitPress إلى مضيف Ollama (على نفس الـVPS أو عنوان داخلي).',
  },
  {
    id: 'custom', kind: 'openai',
    label: 'مزوّد OpenAI-compatible مخصص (رابط يدوي)',
    baseUrl: '',
    keyLabel: 'API key',
    models: [],
    structured: 'json_object', vision: false, manualUrl: true,
  },
];

const PRESET_MAP = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

function preset(id) {
  return PRESET_MAP[id] || PRESET_MAP.custom;
}

function isLoopback(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)([:/]|$)/i.test(String(url || ''));
}

/**
 * Resolve the effective text-provider config from saved settings. Backward
 * compatible: when no textProvider is set, the legacy free-form
 * articleBaseUrl/Model/ApiKey fields behave exactly like 'custom'.
 */
function resolveTextConfig(settings = {}, { fallback = false } = {}) {
  const pfx = fallback ? 'articleFallback' : 'article';
  const presetId = String(settings[fallback ? 'textFallbackProvider' : 'textProvider'] || '').trim();
  const p = preset(presetId || (settings.articleBaseUrl && !presetId ? 'custom' : 'custom'));
  const field = (name) => settings[`${pfx}${name}`] ?? '';
  const model = String(field('Model') || '').trim();
  const apiKey = String(field('ApiKey') || '').trim();
  const accountId = String(field('AccountId') || '').trim();
  // Native APIs always use their fixed host; the free-form URL only applies to
  // OpenAI-compatible providers.
  let baseUrl = p.kind === 'gemini'
    ? p.baseUrl
    : String(field('BaseUrl') || '').trim() || p.baseUrl;
  if (p.id === 'cloudflare-llm') {
    if (accountId) baseUrl = p.baseUrl.replace('{accountId}', encodeURIComponent(accountId));
    else baseUrl = '';
  }
  baseUrl = baseUrl.replace(/\/+$/, '');
  return {
    presetId: p.id,
    kind: p.kind,
    label: p.label,
    baseUrl,
    apiKey,
    model,
    accountId,
    needsAccountId: !!p.needsAccountId,
    noKey: !!p.noKey,
    allowHttp: !!p.allowHttp,
    manualUrl: !!p.manualUrl,
    structured: p.structured,
    vision: !!p.vision,
    headers: p.headers || {},
    fallback: false,
  };
}

function resolvePrimaryAndFallback(settings = {}) {
  const primary = resolveTextConfig(settings, { fallback: false });
  let secondary = null;
  if (String(settings.textFallbackProvider || '').trim() && String(settings.articleFallbackModel || '').trim()) {
    secondary = resolveTextConfig(settings, { fallback: true });
    secondary.fallback = true;
  }
  return { primary, fallback: secondary };
}

function validateConfig(cfg) {
  const problems = [];
  if (!cfg.model) problems.push('اسم الموديل مطلوب.');
  if (!cfg.baseUrl) {
    problems.push(cfg.needsAccountId ? 'معرّف الحساب (Account ID) مطلوب.' : 'رابط الـ API مطلوب.');
  }
  if (!cfg.noKey && !cfg.apiKey) problems.push('مفتاح الـ API مطلوب.');
  if (cfg.baseUrl && !/^https?:\/\//.test(cfg.baseUrl)) problems.push('رابط الـ API يجب أن يبدأ بـ https://');
  if (cfg.baseUrl && /^http:\/\//.test(cfg.baseUrl) && !cfg.allowHttp && !isLoopback(cfg.baseUrl)) {
    problems.push('روابط HTTP غير المشفّرة ممنوعة إلا لخادم محلي (Ollama).');
  }
  return problems;
}

module.exports = { PRESETS, PRESET_MAP, preset, resolveTextConfig, resolvePrimaryAndFallback, validateConfig, isLoopback };
