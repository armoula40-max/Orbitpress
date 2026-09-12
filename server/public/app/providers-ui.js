'use strict';
/**
 * providers-ui.js — browser mirror of server/lib/ai/providers.js.
 * Kept deliberately tiny (ids + labels + default URL/models); a server test
 * asserts the preset ids stay in sync with the authoritative registry.
 */
(function () {
  var PRESETS = [
    { id: '', label: '— اختاري المزوّد —', baseUrl: '', models: [], manualUrl: true },
    { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['deepseek/deepseek-chat', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct'], keyLabel: 'OpenRouter API key' },
    { id: 'deepseek', label: 'DeepSeek الرسمي', baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'], keyLabel: 'DeepSeek API key' },
    { id: 'gemini', label: 'Google Gemini (الواجهة الأصلية)', baseUrl: 'https://generativelanguage.googleapis.com', models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b'], keyLabel: 'Gemini API key (aistudio.google.com/apikey)' },
    { id: 'nvidia', label: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', models: ['deepseek-ai/deepseek-r1', 'meta/llama-3.3-70b-instruct', 'mistralai/mistral-small-24b-instruct'], keyLabel: 'NVIDIA API key' },
    { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'], keyLabel: 'Groq API key' },
    { id: 'together', label: 'Together AI', baseUrl: 'https://api.together.xyz/v1', models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V3'], keyLabel: 'Together API key' },
    { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'], keyLabel: 'OpenAI API key' },
    { id: 'cloudflare-llm', label: 'Cloudflare Workers AI (نصوص)', baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1', models: ['@cf/meta/llama-3.1-8b-instruct-fast', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'], needsAccountId: true, keyLabel: 'Cloudflare API token' },
    { id: 'ollama', label: 'Ollama (خادم محلي / VPS)', baseUrl: 'http://127.0.0.1:11434/v1', models: ['qwen2.5:14b', 'llama3.1:8b', 'gemma3:12b'], noKey: true, keyLabel: 'لا يحتاج مفتاحًا' },
    { id: 'custom', label: 'مزوّد OpenAI-compatible مخصص (رابط يدوي)', baseUrl: '', models: [], manualUrl: true, keyLabel: 'API key' },
  ];
  var NOTES = {
    gemini: 'واجهة Gemini الأصلية: JSON منظّم موثوق ومقالات طويلة؛ المفتاح من aistudio.google.com/apikey.',
    'cloudflare-llm': 'يستخدم نفس Account ID والـToken في قسم الصور، لكن النصوص والصور يبقيان قسماً مستقلين.',
    ollama: 'يجب أن يصل خادم Orbitpress إلى مضيف Ollama (نفس الـVPS أو عنوان داخلي). لا يحتاج مفتاحًا.',
    openrouter: 'يدعم موديلات كثيرة جداً من مزوّد واحد؛ اختر اسم الموديل كاملًا مثل deepseek/deepseek-chat.',
  };
  window.OrbitPressProviders = { list: PRESETS, byId: function (id) { return PRESETS.find(function (p) { return p.id === id; }) || PRESETS[0]; }, note: function (id) { return NOTES[id] || ''; } };
})();
