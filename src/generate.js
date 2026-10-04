// 核心：把用户设置（见 examples/config.example.json）生成为 mihomo / Clash Meta 配置。
//
// 分组分四层，面板里从上到下：
//   第四层 总模式    🚀 总模式（境外默认） / 🏮 国内总模式（国内默认：直连或回国）
//   第三层 应用集合  🤖 国外 AI / 🐼 国内 AI / 🌍 国外媒体 / 🏮 国内媒体 / 💬 通讯软件 …
//   第二层 应用      ▶️ YouTube / 🎬 Netflix / 📺 哔哩哔哩 …（默认跟随所属集合）
//   第一层 地区      ♻️ 自动选择 / ⚡ 1x / 💎 3x / 各地区 / 🇨🇳 回国 / 👆 手动选择
// 默认值链：应用 → 集合 → 总模式 → 地区（自动测速）。任何一层都可以手动改。

import { COLLECTIONS, DEFAULT_CN_FILTER, DEFAULT_INFO_FILTER, DEFAULT_REGIONS, REGIONS, RULE_SOURCES } from './catalog.js';
import { parseLinks } from './parse.js';
import { toYaml } from './yaml.js';

export const G = {
  main: '🚀 总模式',
  domestic: '🏮 国内总模式',
  auto: '♻️ 自动选择',
  low: '⚡ 1x 自动选择',
  high: (n) => `💎 ${n}x 自动选择`,
  manual: '👆 手动选择',
  other: '🌐 其他地区',
  cn: '🇨🇳 回国',
  cnAuto: '🇨🇳 回国 自动',
  cnAirport: '🇨🇳 机场回国',
};

export const DEFAULTS = {
  subscriptions: [],
  nodes: { intl: '', cn: '' },
  regions: DEFAULT_REGIONS,
  otherRegion: true,
  multiplier: { lowBelow: 2, highFrom: 3, regionAutoExcludeHigh: true },
  cnFromAirports: false,
  cnFilter: DEFAULT_CN_FILTER,
  infoFilter: DEFAULT_INFO_FILTER,
  collections: {}, // { id: true/false }，缺省用目录里的 enabled
  apps: {}, // { id: true/false }：是否单独成组；false 时规则直接指向所属集合
  mainDefault: 'auto', // auto / low / high / <地区 id> / cn / DIRECT
  domesticDefault: 'DIRECT', // DIRECT / cn
  profile: 'client', // client / openclash
  ruleSource: 'github',
  testUrl: 'https://www.gstatic.com/generate_204',
  cnTestUrl: 'https://www.baidu.com/',
  interval: 300,
  mixedPort: 7890,
  secret: '',
  mlkem: true,
  customRules: '',
};

// 倍率 ≥ n 的正则（n 为 2..9 的整数），兼容 "3x" "3X" "x3" "×3" "3倍" "3.0x" "倍率:3"
export function multiplierRegex(n) {
  const num = `(?:[${n}-9]|[1-9][0-9])(?:\\.[0-9]+)?`;
  return [
    `(?:^|[^0-9.])${num}\\s*(?:[xX×]|倍)`,
    `[xX×]${num}(?:[^0-9.]|$)`,
    `倍率\\s*[:：]?\\s*${num}`,
  ].join('|');
}

const or = (...parts) => parts.filter(Boolean).map((p) => `(?:${p})`).join('|');
const jsRe = (re) => new RegExp(re);

function merge(cfg) {
  const c = { ...DEFAULTS, ...cfg };
  c.multiplier = { ...DEFAULTS.multiplier, ...(cfg.multiplier || {}) };
  c.nodes = { ...DEFAULTS.nodes, ...(cfg.nodes || {}) };
  return c;
}

function uniqueNames(nodes, taken) {
  for (const n of nodes) {
    let name = n.name;
    for (let i = 2; taken.has(name); i++) name = `${n.name} ${i}`;
    n.name = name;
    taken.add(name);
  }
}

function providerKey(name, i, used) {
  let k = (name || '').trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || `sub${i + 1}`;
  while (used.has(k)) k += '_';
  used.add(k);
  return k;
}

export function generate(userCfg = {}) {
  const c = merge(userCfg);
  const warnings = [];
  const src = RULE_SOURCES[c.ruleSource] || RULE_SOURCES.github;

  // ---------- 节点来源 ----------
  const usedKeys = new Set();
  const subs = (c.subscriptions || [])
    .filter((s) => s && s.url && s.url.trim())
    .map((s, i) => ({ ...s, key: providerKey(s.name, i, usedKeys), role: s.role === 'cn' ? 'cn' : 'intl' }));
  const intlSubs = subs.filter((s) => s.role === 'intl').map((s) => s.key);
  const cnSubs = subs.filter((s) => s.role === 'cn').map((s) => s.key);

  const parsed = { intl: parseLinks(c.nodes.intl, c), cn: parseLinks(c.nodes.cn, c) };
  for (const role of ['intl', 'cn']) {
    for (const e of parsed[role].errors) warnings.push(`${role === 'cn' ? '回国' : '出国'}节点第 ${e.line} 行：${e.error}（${e.text}…）`);
  }
  const taken = new Set(['DIRECT', 'REJECT', 'COMPATIBLE', 'PASS']);
  const intlNodes = parsed.intl.nodes;
  const cnNodes = parsed.cn.nodes;
  uniqueNames([...intlNodes, ...cnNodes], taken);
  const nodeNames = (arr) => arr.map((n) => n.name);

  // 机场里识别出来的回国节点不进出国的自动组
  const cnRe = c.cnFromAirports ? c.cnFilter : '';
  const highRe = multiplierRegex(c.multiplier.highFrom);
  const lowExcl = multiplierRegex(c.multiplier.lowBelow);

  const hasIntl = intlSubs.length > 0 || intlNodes.length > 0;
  const hasCn = cnSubs.length > 0 || cnNodes.length > 0 || (c.cnFromAirports && intlSubs.length > 0);
  if (!hasIntl && !hasCn) warnings.push('还没有任何订阅或节点，配置里只有 DIRECT。');

  const urlTest = (extra) => ({
    type: 'url-test',
    url: c.testUrl,
    interval: c.interval,
    tolerance: 50,
    lazy: true,
    ...extra,
  });
  const withUse = (g, keys) => {
    if (keys.length) return { ...g, use: keys };
    // 没有订阅时 filter 无意义（filter 只作用于订阅里的节点，单节点已在本地筛好）
    const { filter, "exclude-filter": _x, ...rest } = g;
    return rest;
  };
  const groupHasMembers = (g) => (g.proxies && g.proxies.length) || (g.use && g.use.length);

  // ---------- 第一层：地区 ----------
  const layer1 = [];
  const hidden = [];
  const regionChoices = []; // 供上层引用的第一层组名（有成员的才放）

  if (hasIntl) {
    layer1.push(
      withUse({ name: G.auto, ...urlTest({}), proxies: nodeNames(intlNodes), 'exclude-filter': cnRe || undefined }, intlSubs),
    );
    regionChoices.push(G.auto);

    const lowNodes = intlNodes.filter((n) => !jsRe(lowExcl).test(n.name));
    if (intlSubs.length || lowNodes.length) {
      layer1.push(
        withUse({ name: G.low, ...urlTest({}), proxies: nodeNames(lowNodes), 'exclude-filter': or(lowExcl, cnRe) }, intlSubs),
      );
      regionChoices.push(G.low);
    }
    const highNodes = intlNodes.filter((n) => jsRe(highRe).test(n.name));
    if (intlSubs.length || highNodes.length) {
      layer1.push(
        withUse(
          { name: G.high(c.multiplier.highFrom), ...urlTest({}), proxies: nodeNames(highNodes), filter: highRe, 'exclude-filter': cnRe || undefined },
          intlSubs,
        ),
      );
      regionChoices.push(G.high(c.multiplier.highFrom));
    }
  }

  const regions = REGIONS.filter((r) => (c.regions || []).includes(r.id));
  const autoExclude = c.multiplier.regionAutoExcludeHigh ? highRe : '';
  for (const r of regions) {
    const own = intlNodes.filter((n) => jsRe(r.filter).test(n.name));
    if (!intlSubs.length && !own.length) continue;
    const autoName = `${r.name} 自动`;
    hidden.push(
      withUse(
        { name: autoName, ...urlTest({ hidden: true }), proxies: nodeNames(own), filter: r.filter, 'exclude-filter': or(autoExclude, cnRe) || undefined },
        intlSubs,
      ),
    );
    layer1.push(withUse({ name: r.name, type: 'select', proxies: [autoName, ...nodeNames(own)], filter: r.filter, 'exclude-filter': cnRe || undefined }, intlSubs));
    regionChoices.push(r.name);
  }

  if (c.otherRegion && hasIntl) {
    const allRegionRe = or(...REGIONS.map((r) => r.filter));
    const own = intlNodes.filter((n) => !jsRe(allRegionRe).test(n.name));
    if (intlSubs.length || own.length) {
      layer1.push(withUse({ name: G.other, type: 'select', proxies: nodeNames(own), 'exclude-filter': or(allRegionRe, cnRe) }, intlSubs));
      regionChoices.push(G.other);
    }
  }

  if (hasCn) {
    // 回国节点连不上 Google，测速必须用国内网站
    const airportCn = c.cnFromAirports ? intlSubs : [];
    const cnAuto = withUse({ name: G.cnAuto, ...urlTest({ hidden: true, url: c.cnTestUrl }), proxies: nodeNames(cnNodes) }, cnSubs);
    const cnSel = withUse({ name: G.cn, type: "select", proxies: [G.cnAuto, ...nodeNames(cnNodes)], url: c.cnTestUrl }, cnSubs);
    if (airportCn.length && !cnSubs.length) {
      // 没有专门的回国订阅：直接从机场订阅里按关键词筛
      Object.assign(cnAuto, { use: airportCn, filter: c.cnFilter });
      Object.assign(cnSel, { use: airportCn, filter: c.cnFilter });
    } else if (airportCn.length) {
      // 两类都有：专门订阅不筛选，机场里的回国节点单独成一个测速组再并进来
      hidden.push({ name: G.cnAirport, ...urlTest({ hidden: true, url: c.cnTestUrl }), use: airportCn, filter: c.cnFilter });
      cnAuto.proxies.push(G.cnAirport);
      cnSel.proxies.splice(1, 0, G.cnAirport);
    }
    hidden.push(cnAuto);
    layer1.push(cnSel);
  }

  if (hasIntl || hasCn) {
    layer1.push(withUse({ name: G.manual, type: 'select', proxies: nodeNames([...intlNodes, ...cnNodes]) }, [...intlSubs, ...cnSubs]));
  }

  const cnChoice = hasCn ? [G.cn] : [];
  const layer1Names = [...regionChoices, ...cnChoice, ...(hasIntl || hasCn ? [G.manual] : [])];

  // ---------- 第四层：总模式 ----------
  const mainDefault = (() => {
    const d = c.mainDefault;
    if (d === 'DIRECT') return 'DIRECT';
    if (d === 'cn') return hasCn ? G.cn : 'DIRECT';
    if (d === 'low' && regionChoices.includes(G.low)) return G.low;
    if (d === 'high' && regionChoices.includes(G.high(c.multiplier.highFrom))) return G.high(c.multiplier.highFrom);
    const r = REGIONS.find((x) => x.id === d);
    if (r && regionChoices.includes(r.name)) return r.name;
    return regionChoices[0] || 'DIRECT'; // 只有回国节点（人在境外）时，境外流量默认直连
  })();
  const front = (first, list) => [...new Set([first, ...list])];

  const mainGroup = { name: G.main, type: 'select', proxies: front(mainDefault, [...layer1Names, 'DIRECT']) };
  const domesticDefault = c.domesticDefault === 'cn' && hasCn ? G.cn : 'DIRECT';
  const domesticGroup = {
    name: G.domestic,
    type: 'select',
    proxies: front(domesticDefault, ['DIRECT', ...cnChoice, G.main]),
  };

  // ---------- 第三层 / 第二层：集合与应用 ----------
  const enabledCols = COLLECTIONS.filter((col) => (col.id in (c.collections || {}) ? c.collections[col.id] : col.enabled !== false));
  const choicesFor = (scope, head) => {
    switch (scope) {
      case 'reject':
        return front(head, ['REJECT', 'DIRECT']);
      case 'cn':
        return front(head, [G.domestic, 'DIRECT', ...cnChoice, G.main, ...layer1Names]);
      case 'direct':
        return front(head, ['DIRECT', G.main, ...layer1Names]);
      default:
        return front(head, [G.main, ...layer1Names, 'DIRECT']);
    }
  };
  const scopeHead = { intl: G.main, cn: G.domestic, direct: 'DIRECT', reject: 'REJECT' };

  const layer3 = [];
  const layer2 = [];
  const ruleTarget = {}; // app id → 组名
  const colTarget = {}; // collection id → 组名
  for (const col of enabledCols) {
    layer3.push({ name: col.name, type: 'select', proxies: choicesFor(col.scope, scopeHead[col.scope]) });
    colTarget[col.id] = col.name;
    for (const app of col.apps) {
      const own = app.id in (c.apps || {}) ? c.apps[app.id] : app.own !== false;
      if (own && col.scope !== 'reject') {
        layer2.push({ name: app.name, type: 'select', proxies: choicesFor(col.scope, col.name) });
        ruleTarget[app.id] = app.name;
      } else ruleTarget[app.id] = col.name;
    }
  }

  // ---------- 规则 ----------
  const providers = {};
  const addProvider = (spec) => {
    const [kind, name] = spec.split(':');
    const key = kind === 'geoip' ? `${name}-ip` : name;
    if (!providers[key]) {
      providers[key] = {
        type: 'http',
        behavior: kind === 'geoip' ? 'ipcidr' : 'domain',
        format: 'mrs',
        url: `${src.base}/${kind}/${name}.mrs`,
        path: `./rule_provider/${key}.mrs`,
        interval: 86400,
        proxy: src.viaProxy && hasIntl ? G.main : 'DIRECT',
      };
    }
    return key;
  };
  const ruleLine = (spec, target) => {
    const i = spec.indexOf(':');
    const kind = spec.slice(0, i);
    const val = spec.slice(i + 1);
    switch (kind) {
      case 'geosite':
        return `RULE-SET,${addProvider(spec)},${target}`;
      case 'geoip':
        return `RULE-SET,${addProvider(spec)},${target},no-resolve`;
      case 'suffix':
        return `DOMAIN-SUFFIX,${val},${target}`;
      case 'domain':
        return `DOMAIN,${val},${target}`;
      case 'keyword':
        return `DOMAIN-KEYWORD,${val},${target}`;
      default:
        throw new Error(`未知规则类型 ${spec}`);
    }
  };

  const rules = [];
  rules.push(ruleLine('geosite:private', 'DIRECT'), ruleLine('geoip:private', 'DIRECT'));
  const custom = (c.customRules || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (custom.length) rules.push({ __comment: '自定义规则' }, ...custom);
  // 广告拦截最先，其余集合按目录顺序（具体服务在前，大类兜底在后）
  for (const col of enabledCols) {
    if (!col.apps.length) continue;
    rules.push({ __comment: col.name });
    for (const app of col.apps) for (const r of app.rules) rules.push(ruleLine(r, ruleTarget[app.id]));
  }
  const catchAlls = enabledCols.filter((col) => col.catchAll.length);
  if (catchAlls.length) {
    rules.push({ __comment: '集合兜底' });
    for (const col of catchAlls) for (const r of col.catchAll) rules.push(ruleLine(r, col.name));
  }
  const cnSites = colTarget['cn-sites'] || G.domestic;
  rules.push(
    { __comment: '大类兜底' },
    ruleLine('geosite:geolocation-!cn', G.main),
    ruleLine('geosite:cn', cnSites),
    ruleLine('geoip:cn', cnSites),
    `MATCH,${G.main}`,
  );

  // ---------- 组装 ----------
  const ensure = (g) => {
    if (g.use && g.proxies && !g.proxies.length) delete g.proxies;
    if (!groupHasMembers(g)) g.proxies = ['DIRECT'];
    for (const k of Object.keys(g)) if (g[k] === undefined) delete g[k];
    return g;
  };
  const proxyGroups = [
    { __comment: '══════ 第四层：总模式（所有默认选择从这里来）══════' },
    mainGroup,
    domesticGroup,
    { __comment: '══════ 第三层：应用集合 ══════' },
    ...layer3,
    { __comment: '══════ 第二层：应用（默认跟随所属集合）══════' },
    ...layer2,
    { __comment: '══════ 第一层：地区与节点（手动点具体节点就固定使用它）══════' },
    ...layer1,
    { __comment: '隐藏的自动测速组' },
    ...hidden,
  ].map((g) => (g.__comment ? g : ensure(g)));

  const proxyProviders = {};
  for (const s of subs) {
    const p = {
      type: 'http',
      url: s.url.trim(),
      path: `./proxy_providers/${s.key}.yaml`,
      interval: Number(s.interval) || 86400,
      proxy: 'DIRECT', // 订阅永远直连拉取，避免「节点挂了 → 订阅也更新不了」
      'exclude-filter': c.infoFilter || undefined,
      'health-check': { enable: true, url: s.role === 'cn' ? c.cnTestUrl : c.testUrl, interval: c.interval, lazy: true },
    };
    if (s.prefix !== false && subs.length > 1) p.override = { 'additional-prefix': `${s.name || s.key} | ` };
    if (!p['exclude-filter']) delete p['exclude-filter'];
    proxyProviders[s.key] = p;
  }

  const allNodes = [...intlNodes, ...cnNodes];
  const sections = [
    ...baseSections(c, hasIntl),
    ['proxies', allNodes.length ? allNodes : undefined, '单节点（来自分享链接）'],
    ['proxy-providers', subs.length ? proxyProviders : undefined, '订阅（机场 / 自建服务器订阅）'],
    ['proxy-groups', proxyGroups],
    ['rule-providers', providers, `规则集：MetaCubeX/meta-rules-dat（${src.label}）`],
    ['rules', rules],
  ];
  const yaml = toYaml(sections, [
    'Clash Meta / mihomo 配置 —— 由 clash-sub-generator 生成',
    '分组层级：第四层 总模式 → 第三层 应用集合 → 第二层 应用 → 第一层 地区/节点',
    '此文件含订阅地址和节点凭据，请勿公开分享',
  ]);
  // 去掉注释后的纯对象，便于测试和二次处理
  const strip = (v) => (Array.isArray(v) ? v.filter((x) => !(x && x.__comment)) : v);
  const config = Object.fromEntries(sections.filter(([, v]) => v !== undefined).map(([k, v]) => [k, strip(v)]));

  return {
    yaml,
    config,
    warnings,
    stats: {
      subscriptions: subs.length,
      nodes: allNodes.length,
      groups: proxyGroups.filter((g) => !g.__comment).length,
      rules: rules.filter((r) => typeof r === 'string').length,
      ruleProviders: Object.keys(providers).length,
    },
    layers: {
      4: [G.main, G.domestic],
      3: layer3.map((g) => g.name),
      2: layer2.map((g) => g.name),
      1: layer1.map((g) => g.name),
    },
  };
}

function baseSections(c, hasIntl) {
  const router = c.profile === 'openclash';
  const general = router
    ? {
        'mixed-port': 7893,
        'redir-port': 7892,
        'tproxy-port': 7895,
        'allow-lan': true,
        'bind-address': '*',
      }
    : { 'mixed-port': Number(c.mixedPort) || 7890, 'allow-lan': false };
  Object.assign(general, {
    mode: 'rule',
    'log-level': 'info',
    ipv6: false,
    'unified-delay': true,
    'tcp-concurrent': true,
    'find-process-mode': router ? 'off' : 'strict',
    'external-controller': router ? '0.0.0.0:9090' : '127.0.0.1:9090',
  });
  if (c.secret) general.secret = c.secret;
  general.profile = { 'store-selected': true, 'store-fake-ip': true };

  const sections = Object.entries(general).map(([k, v]) => [k, v]);
  sections[0][2] = router ? '基础设置（OpenClash 路由器）' : '基础设置（Clash Verge Rev / Mihomo Party / FlClash 等客户端）';

  sections.push(
    [
      'sniffer',
      {
        enable: true,
        'parse-pure-ip': true,
        sniff: {
          HTTP: { ports: [80, '8080-8880'], 'override-destination': true },
          TLS: { ports: [443, 8443] },
          QUIC: { ports: [443, 8443] },
        },
      },
    ],
    [
      'dns',
      {
        enable: true,
        listen: router ? '0.0.0.0:7874' : '127.0.0.1:1053',
        ipv6: false,
        'enhanced-mode': 'fake-ip',
        'fake-ip-range': '198.18.0.1/16',
        'fake-ip-filter': [
          '*.lan',
          '+.local',
          '+.msftconnecttest.com',
          '+.msftncsi.com',
          'captive.apple.com',
          'connectivitycheck.gstatic.com',
          '+.ntp.org',
          'time.*.com',
          '+.stun.*.*',
          '+.stun.*.*.*',
        ],
        'default-nameserver': ['223.5.5.5', '119.29.29.29'],
        'proxy-server-nameserver': ['https://223.5.5.5/dns-query', 'https://doh.pub/dns-query'],
        nameserver: ['https://223.5.5.5/dns-query', 'https://doh.pub/dns-query'],
        'nameserver-policy': hasIntl
          ? { 'rule-set:geolocation-!cn': ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'] }
          : undefined,
      },
    ],
  );
  return sections;
}
