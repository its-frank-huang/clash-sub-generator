// 网页界面：表单 ⇄ 设置对象（与 CLI 的 JSON 格式相同）→ generate() → YAML
import { COLLECTIONS, REGIONS, RULE_SOURCES } from './catalog.js';
import { DEFAULTS, G, generate } from './generate.js';
import { parseLinks } from './parse.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'clash-sub-generator:settings';

const fresh = () => JSON.parse(JSON.stringify({ ...DEFAULTS, subscriptions: [{ name: '机场', url: '', role: 'intl', prefix: true }] }));

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw), remember: true };
  } catch {
    /* 隐私模式等情况下 localStorage 不可用 */
  }
  return fresh();
}

let state = load();

function save() {
  try {
    if (state.remember) localStorage.setItem(STORE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* 忽略 */
  }
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) n.append(c);
  return n;
}

// ---------- 订阅 ----------
function renderSubs() {
  const box = $('subs');
  box.replaceChildren(
    ...state.subscriptions.map((s, i) =>
      el(
        'div',
        { class: 'sub-row' },
        el('input', { type: 'text', class: 'sub-name', placeholder: '名称', value: s.name || '', oninput: (e) => update(() => (s.name = e.target.value)) }),
        el('input', {
          type: 'url',
          class: 'sub-url',
          placeholder: 'https://…订阅地址',
          value: s.url || '',
          spellcheck: 'false',
          oninput: (e) => update(() => (s.url = e.target.value)),
        }),
        el(
          'select',
          { class: 'sub-role', onchange: (e) => update(() => (s.role = e.target.value)) },
          el('option', { value: 'intl', selected: s.role !== 'cn' }, '出国'),
          el('option', { value: 'cn', selected: s.role === 'cn' }, '回国'),
        ),
        el(
          'label',
          { class: 'check small', title: '多个订阅时给节点名加「名称 | 」前缀，便于区分' },
          el('input', { type: 'checkbox', checked: s.prefix !== false, onchange: (e) => update(() => (s.prefix = e.target.checked)) }),
          '前缀',
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'icon',
            title: '删除',
            'aria-label': '删除这个订阅',
            onclick: () => {
              state.subscriptions.splice(i, 1);
              renderSubs();
              refresh();
            },
          },
          '✕',
        ),
      ),
    ),
  );
}

// ---------- 地区 ----------
function renderRegions() {
  $('regions').replaceChildren(
    ...REGIONS.map((r) =>
      el(
        'label',
        { class: 'chip' },
        el('input', {
          type: 'checkbox',
          checked: state.regions.includes(r.id),
          onchange: (e) =>
            update(() => {
              const set = new Set(state.regions);
              e.target.checked ? set.add(r.id) : set.delete(r.id);
              // 保持目录里的顺序
              state.regions = REGIONS.map((x) => x.id).filter((id) => set.has(id));
              renderMainDefault();
            }),
        }),
        r.name,
      ),
    ),
  );
}

// ---------- 集合与应用 ----------
const SCOPE_LABEL = { intl: '默认 → 🚀 总模式', cn: '默认 → 🏮 国内总模式', direct: '默认 → DIRECT', reject: '默认 → REJECT' };

function colEnabled(col) {
  return col.id in state.collections ? state.collections[col.id] : col.enabled !== false;
}
function appOwn(app) {
  return app.id in state.apps ? state.apps[app.id] : app.own !== false;
}

function renderCollections() {
  $('collections').replaceChildren(
    ...COLLECTIONS.map((col) => {
      const on = colEnabled(col);
      return el(
        'div',
        { class: `collection${on ? '' : ' off'}` },
        el(
          'div',
          { class: 'col-head' },
          el(
            'label',
            { class: 'check' },
            el('input', {
              type: 'checkbox',
              checked: on,
              onchange: (e) =>
                update(() => {
                  state.collections[col.id] = e.target.checked;
                  renderCollections();
                }),
            }),
            el('strong', {}, col.name),
          ),
          el('span', { class: 'badge' }, col.id === 'cn-sites' ? '兜底：geosite:cn + geoip:cn' : SCOPE_LABEL[col.scope]),
        ),
        col.apps.length && col.scope !== 'reject'
          ? el(
              'div',
              { class: 'chips apps' },
              col.apps.map((app) =>
                el(
                  'label',
                  { class: 'chip', title: app.rules.join('\n') },
                  el('input', {
                    type: 'checkbox',
                    checked: appOwn(app),
                    disabled: !on,
                    onchange: (e) => update(() => (state.apps[app.id] = e.target.checked)),
                  }),
                  app.name,
                ),
              ),
            )
          : null,
      );
    }),
  );
}

// ---------- 总模式默认值 ----------
function renderMainDefault() {
  const opts = [
    ['auto', G.auto],
    ['low', G.low],
    ['high', G.high(state.multiplier.highFrom)],
    ...REGIONS.filter((r) => state.regions.includes(r.id)).map((r) => [r.id, r.name]),
    ['cn', G.cn],
    ['DIRECT', 'DIRECT 直连（人在境外）'],
  ];
  $('main-default').replaceChildren(...opts.map(([v, t]) => el('option', { value: v, selected: state.mainDefault === v }, t)));
}

// ---------- 简单字段 ----------
const FIELDS = [
  ['other-region', 'checked', (s) => s.otherRegion, (s, v) => (s.otherRegion = v)],
  ['low-below', 'value', (s) => s.multiplier.lowBelow, (s, v) => (s.multiplier.lowBelow = clampInt(v, 2, 9))],
  [
    'high-from',
    'value',
    (s) => s.multiplier.highFrom,
    (s, v) => {
      s.multiplier.highFrom = clampInt(v, 2, 9);
      renderMainDefault();
    },
  ],
  ['region-exclude-high', 'checked', (s) => s.multiplier.regionAutoExcludeHigh, (s, v) => (s.multiplier.regionAutoExcludeHigh = v)],
  ['cn-from-airports', 'checked', (s) => s.cnFromAirports, (s, v) => (s.cnFromAirports = v)],
  ['cn-filter', 'value', (s) => s.cnFilter, (s, v) => (s.cnFilter = v)],
  ['info-filter', 'value', (s) => s.infoFilter, (s, v) => (s.infoFilter = v)],
  ['main-default', 'value', (s) => s.mainDefault, (s, v) => (s.mainDefault = v)],
  ['domestic-default', 'value', (s) => s.domesticDefault, (s, v) => (s.domesticDefault = v)],
  ['profile', 'value', (s) => s.profile, (s, v) => (s.profile = v)],
  ['rule-source', 'value', (s) => s.ruleSource, (s, v) => (s.ruleSource = v)],
  ['mixed-port', 'value', (s) => s.mixedPort, (s, v) => (s.mixedPort = clampInt(v, 1, 65535))],
  ['secret', 'value', (s) => s.secret, (s, v) => (s.secret = v)],
  ['mlkem', 'checked', (s) => s.mlkem, (s, v) => (s.mlkem = v)],
  ['custom-rules', 'value', (s) => s.customRules, (s, v) => (s.customRules = v)],
  ['nodes-intl', 'value', (s) => s.nodes.intl, (s, v) => (s.nodes.intl = v)],
  ['nodes-cn', 'value', (s) => s.nodes.cn, (s, v) => (s.nodes.cn = v)],
  ['remember', 'checked', (s) => !!s.remember, (s, v) => (s.remember = v)],
];

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

function bindFields() {
  for (const [id, prop, , set] of FIELDS) {
    const node = $(id);
    const ev = prop === 'checked' || node.tagName === 'SELECT' ? 'change' : 'input';
    node.addEventListener(ev, () => update(() => set(state, node[prop])));
  }
}

function fillFields() {
  for (const [id, prop, get] of FIELDS) $(id)[prop] = get(state) ?? '';
}

// ---------- 输出 ----------
let last = null;

function nodeStatus(id, text) {
  const { nodes, errors } = parseLinks(text, state);
  const s = $(id);
  s.textContent = !text.trim() ? '' : `识别 ${nodes.length} 个节点${errors.length ? `，${errors.length} 行无法识别` : ''}`;
  s.classList.toggle('bad', errors.length > 0);
}

function renderTree(layers) {
  const titles = { 4: '第四层 · 总模式', 3: '第三层 · 应用集合', 2: '第二层 · 应用', 1: '第一层 · 地区 / 节点' };
  $('tree').replaceChildren(
    ...[4, 3, 2, 1].map((n) =>
      el('div', { class: 'layer-box' }, el('h3', {}, titles[n], el('span', { class: 'count' }, String(layers[n].length))), el('div', { class: 'pills' }, layers[n].map((x) => el('span', { class: 'pill' }, x)))),
    ),
  );
}

function refresh() {
  try {
    last = generate(state);
  } catch (e) {
    $('warnings').replaceChildren(el('li', { class: 'error' }, `生成失败：${e.message}`));
    return;
  }
  const { stats, warnings, yaml, layers } = last;
  $('stats').textContent = `${stats.subscriptions} 个订阅 · ${stats.nodes} 个单节点 · ${stats.groups} 个分组 · ${stats.rules} 条规则 · ${stats.ruleProviders} 个规则集`;
  $('warnings').replaceChildren(...warnings.map((w) => el('li', {}, w)));
  $('yaml').textContent = yaml;
  renderTree(layers);
  nodeStatus('nodes-intl-status', state.nodes.intl);
  nodeStatus('nodes-cn-status', state.nodes.cn);
  save();
}

let timer;
function update(mutate) {
  mutate();
  clearTimeout(timer);
  timer = setTimeout(refresh, 120);
}

function renderAll() {
  renderSubs();
  renderRegions();
  renderCollections();
  renderMainDefault();
  fillFields();
  refresh();
}

// ---------- 按钮 ----------
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1200);
}

$('add-sub').addEventListener('click', () => {
  state.subscriptions.push({ name: `订阅${state.subscriptions.length + 1}`, url: '', role: 'intl', prefix: true });
  renderSubs();
  refresh();
});

$('download').addEventListener('click', () => last && download('config.yaml', last.yaml, 'text/yaml;charset=utf-8'));

$('copy').addEventListener('click', async (e) => {
  if (!last) return;
  try {
    await navigator.clipboard.writeText(last.yaml);
    flash(e.target, '已复制');
  } catch {
    flash(e.target, '复制失败');
  }
});

$('export').addEventListener('click', () => {
  const { remember, ...rest } = state;
  download('clash-sub-generator.json', JSON.stringify(rest, null, 2), 'application/json');
});

$('import').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse((await f.text()).replace(/^﻿/, ''));
    state = { ...fresh(), ...data, remember: state.remember };
    state.multiplier = { ...DEFAULTS.multiplier, ...(data.multiplier || {}) };
    state.nodes = { ...DEFAULTS.nodes, ...(data.nodes || {}) };
    renderAll();
  } catch (err) {
    alert(`导入失败：${err.message}`);
  }
  e.target.value = '';
});

$('reset').addEventListener('click', () => {
  if (!confirm('恢复默认会清空当前填写的所有内容，确定吗？')) return;
  state = { ...fresh(), remember: state.remember };
  renderAll();
});

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t === tab);
    $('tree').hidden = tab.dataset.tab !== 'tree';
    $('yaml').hidden = tab.dataset.tab !== 'yaml';
  });
}

$('rule-source').replaceChildren(...Object.entries(RULE_SOURCES).map(([k, v]) => el('option', { value: k }, v.label)));
bindFields();
renderAll();
