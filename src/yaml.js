// 极简 YAML 输出器：只覆盖 mihomo 配置需要的子集（对象、数组、字符串、数字、布尔）。
// 数组里放 { __comment: '...' } 会输出成一行注释；对象的 __comment 键同理。

const RESERVED = /^(?:true|false|yes|no|on|off|null|y|n|~)$/i;

function isPlain(s, flow) {
  if (s === '' || s !== s.trim()) return false;
  if (RESERVED.test(s)) return false;
  if (/^[-+]?(?:\d|\.\d)/.test(s)) return false; // 看起来像数字
  if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(s)) return false;
  if (/[\n\r\t"\\]/.test(s)) return false;
  if (/:(?:\s|$)/.test(s) || /\s#/.test(s)) return false;
  if (flow && /[,\[\]{}]/.test(s)) return false;
  return true;
}

export function scalar(v, flow = false) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  return isPlain(s, flow) ? s : JSON.stringify(s);
}

function key(k) {
  return isPlain(k, true) && !k.includes(':') ? k : JSON.stringify(k);
}

const isScalar = (v) => v === null || typeof v !== 'object';

function flowList(arr) {
  return `[${arr.map((v) => scalar(v, true)).join(', ')}]`;
}

// 标量数组较短时写成一行 [a, b]，否则逐行
function useFlow(arr, parentKey) {
  if (parentKey === 'rules' || arr.length === 0) return arr.length === 0;
  if (!arr.every(isScalar)) return false;
  return arr.map((v) => scalar(v, true)).join(', ').length <= 200;
}

function emitObject(obj, indent, out) {
  const pad = ' '.repeat(indent);
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (k === '__comment') {
      out.push(`${pad}# ${v}`);
      continue;
    }
    if (isScalar(v)) {
      out.push(`${pad}${key(k)}: ${scalar(v)}`);
    } else if (Array.isArray(v)) {
      if (useFlow(v, k)) out.push(`${pad}${key(k)}: ${flowList(v)}`);
      else {
        out.push(`${pad}${key(k)}:`);
        emitArray(v, indent + 2, out);
      }
    } else if (Object.keys(v).length === 0) {
      out.push(`${pad}${key(k)}: {}`);
    } else {
      out.push(`${pad}${key(k)}:`);
      emitObject(v, indent + 2, out);
    }
  }
}

function emitArray(arr, indent, out) {
  const pad = ' '.repeat(indent);
  for (const item of arr) {
    if (item && typeof item === 'object' && !Array.isArray(item) && '__comment' in item && Object.keys(item).length === 1) {
      out.push(`${pad}# ${item.__comment}`);
      continue;
    }
    if (item && item.__blank) {
      out.push('');
      continue;
    }
    if (isScalar(item)) {
      out.push(`${pad}- ${scalar(item)}`);
    } else if (Array.isArray(item)) {
      out.push(`${pad}- ${flowList(item)}`);
    } else {
      const sub = [];
      emitObject(item, indent + 2, sub);
      if (sub.length) sub[0] = `${pad}- ${sub[0].slice(indent + 2)}`;
      out.push(...sub);
    }
  }
}

// sections: [[topKey, value, comment?], ...]，顶层各段之间空一行
export function toYaml(sections, header = []) {
  const out = header.map((l) => (l ? `# ${l}` : '#'));
  let prevScalar = false;
  for (const [k, v, comment] of sections) {
    if (v === undefined) continue;
    // 连续的标量设置挤在一起，对象 / 数组段之间空一行
    const scalarNow = isScalar(v) && !comment;
    if (out.length && !(scalarNow && prevScalar)) out.push('');
    prevScalar = isScalar(v);
    if (comment) out.push(...[].concat(comment).map((c) => `# ${c}`));
    emitObject({ [k]: v }, 0, out);
  }
  return out.join('\n') + '\n';
}
