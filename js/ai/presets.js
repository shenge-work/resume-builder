/* =============================================================
 * presets.js · 模型厂商预设表（P1）
 * -------------------------------------------------------------
 * 纯数据：列出 OpenAI 兼容协议的厂商默认 baseURL / 模型名 / 单价。
 * 不发网络请求，纯函数，可单测。
 *
 * 选厂商时把 baseURL / models 一键填进 ai.config.json（用户自行改 Key）。
 * ============================================================= */
(function (global) {
  'use strict';

  var PRESETS = {
    deepseek: {
      label: 'DeepSeek',
      baseURL: 'https://api.deepseek.com',
      docs: 'https://platform.deepseek.com/api_keys',
      models: {
        fast: 'deepseek-v4-flash',
        strong: 'deepseek-v4-pro'
      },
      // 单价：人民币 / 百万 token（仅 UI 显示估算用，不进请求）
      price: { input: 1, output: 2 }
    },
    zhipu: {
      label: '智谱 GLM',
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      docs: 'https://open.bigmodel.cn/',
      models: {
        fast: 'glm-4-flash',
        strong: 'glm-4-plus'
      },
      price: { input: 0, output: 0 }
    },
    moonshot: {
      label: 'Moonshot 月之暗面',
      baseURL: 'https://api.moonshot.cn/v1',
      docs: 'https://platform.moonshot.cn/',
      models: {
        fast: 'moonshot-v1-8k',
        strong: 'moonshot-v1-32k'
      },
      price: { input: 12, output: 12 }
    },
    openai: {
      label: 'OpenAI',
      baseURL: 'https://api.openai.com/v1',
      docs: 'https://platform.openai.com/',
      models: {
        fast: 'gpt-4o-mini',
        strong: 'gpt-4o'
      },
      price: { input: 0, output: 0 }
    },
    custom: {
      label: '自定义（OpenAI 兼容网关）',
      baseURL: '',
      docs: '',
      models: { fast: '', strong: '' },
      price: { input: 0, output: 0 }
    }
  };

  function list() {
    return Object.keys(PRESETS).map(function (k) {
      return { id: k, label: PRESETS[k].label, baseURL: PRESETS[k].baseURL };
    });
  }

  function get(id) {
    return PRESETS[id] || null;
  }

  global.ResumeAIPresets = {
    PRESETS: PRESETS,
    list: list,
    get: get
  };
})(window);
