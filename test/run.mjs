// 零依赖自检：node test/run.mjs（或 bun test/run.mjs）
// 检查：每个分组引用的名字都存在、没有循环引用、规则目标和规则集都存在、链接解析正确。
import assert from 'node:assert/strict';
import { generate, multiplierRegex } from '../src/generate.js';
import { parseLink, parseLinks } from '../src/parse.js';
import { scalar } from '../src/yaml.js';

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`✔ ${name}`);
  } catch (e) {
    console.error(`✘ ${name}\n  ${e.stack}`);
    process.exitCode = 1;
  }
};

const BUILTIN = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE']);

function checkConsistency(cfg) {
  const groups = cfg['proxy-groups'];
  const names = new Set([...BUILTIN, ...(cfg.proxies || []).map((p) => p.name), ...groups.map((g) => g.name)]);
  assert.equal(new Set(groups.map((g) => g.name)).size, groups.length, '分组名重复');
  const providers = new Set(Object.keys(cfg['proxy-providers'] || {}));
  for (const g of groups) {
    assert.ok((g.proxies && g.proxies.length) || (g.use && g.use.length), `${g.name} 没有成员`);
    assert.equal(new Set(g.proxies || []).size, (g.proxies || []).length, `${g.name} 有重复选项`);
    for (const p of g.proxies || []) assert.ok(names.has(p), `${g.name} 引用了不存在的 ${p}`);
    for (const u of g.use || []) assert.ok(providers.has(u), `${g.name} 引用了不存在的订阅 ${u}`);
    for (const k of ['filter', 'exclude-filter']) if (g[k]) new RegExp(g[k]);
  }
  // 循环引用检测
  const byName = Object.fromEntries(groups.map((g) => [g.name, g]));
  const state = {};
  const visit = (n, path) => {
    if (state[n] === 2 || !byName[n]) return;
    assert.notEqual(state[n], 1, `循环引用：${[...path, n].join(' → ')}`);
    state[n] = 1;
    for (const p of byName[n].proxies || []) visit(p, [...path, n]);
    state[n] = 2;
  };
  for (const g of groups) visit(g.name, []);
  // 规则
  const rp = new Set(Object.keys(cfg['rule-providers']));
  for (const r of cfg.rules) {
    const parts = r.split(',');
    if (parts[0] === 'MATCH') {
      assert.ok(names.has(parts[1]), `MATCH 目标 ${parts[1]} 不存在`);
      continue;
    }
    if (parts[0] === 'RULE-SET') assert.ok(rp.has(parts[1]), `规则集 ${parts[1]} 未定义`);
    assert.ok(names.has(parts[2]), `规则目标 ${parts[2]} 不存在：${r}`);
  }
  assert.equal(cfg.rules.at(-1).split(',')[0], 'MATCH');
}

function yamlRoundTrip(out) {
  if (typeof Bun === 'undefined' || !Bun.YAML) return;
  const parsed = Bun.YAML.parse(out.yaml);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), JSON.parse(JSON.stringify(out.config)));
}

const VLESS =
  'vless://11111111-2222-3333-4444-555555555555@203.0.113.10:443?type=tcp&security=reality&pbk=PUBKEY&fp=chrome&sni=www.intel.com&sid=ab12&flow=xtls-rprx-vision#%F0%9F%87%BA%F0%9F%87%B8%20LA';
const CN_VLESS =
  'vless://11111111-2222-3333-4444-555555555555@198.51.100.5:34567?type=tcp&security=reality&pbk=PUB2&sni=www.microsoft.com&sid=cd&flow=xtls-rprx-vision#阿里云广州';

const SCENARIOS = {
  空配置: {},
  只有机场: { subscriptions: [{ name: '机场', url: 'https://a.example/sub' }] },
  只有回国: { nodes: { cn: CN_VLESS } },
  只有单节点: { nodes: { intl: VLESS } },
  完整: {
    subscriptions: [
      { name: '机场A', url: 'https://a.example/sub' },
      { name: '机场 B', url: 'https://b.example/sub', role: 'intl' },
      { name: '回国', url: 'https://c.example/sub', role: 'cn' },
    ],
    nodes: { intl: VLESS, cn: CN_VLESS },
    cnFromAirports: true,
    collections: { ads: true },
    customRules: 'DOMAIN-SUFFIX,example.org,🚀 总模式',
    mainDefault: 'us',
    domesticDefault: 'cn',
  },
  路由器: {
    profile: 'openclash',
    ruleSource: 'jsdelivr',
    subscriptions: [{ name: 'x', url: 'https://x.example' }],
    apps: { netflix: false },
  },
};

for (const [name, cfg] of Object.entries(SCENARIOS)) {
  test(`场景「${name}」引用完整、无循环、YAML 可解析`, () => {
    const out = generate(cfg);
    checkConsistency(out.config);
    yamlRoundTrip(out);
  });
}

test('默认值链：应用 → 集合 → 总模式', () => {
  const { config } = generate(SCENARIOS.完整);
  const g = Object.fromEntries(config['proxy-groups'].map((x) => [x.name, x]));
  assert.equal(g['🎬 Netflix'].proxies[0], '🌍 国外媒体');
  assert.equal(g['🌍 国外媒体'].proxies[0], '🚀 总模式');
  assert.equal(g['🚀 总模式'].proxies[0], '🇺🇸 美国');
  assert.equal(g['📺 哔哩哔哩'].proxies[0], '🏮 国内媒体');
  assert.equal(g['🏮 国内媒体'].proxies[0], '🏮 国内总模式');
  assert.equal(g['🏮 国内总模式'].proxies[0], '🇨🇳 回国');
  assert.ok(g['🇺🇸 美国'].proxies.includes('🇺🇸 LA'), '单节点按名字归入地区');
  assert.ok(g['🇨🇳 回国'].proxies.includes('阿里云广州'));
  assert.ok(g['🇨🇳 回国'].proxies.includes('🇨🇳 机场回国'));
});

test('关闭应用独立分组后规则指向集合', () => {
  const { config } = generate(SCENARIOS.路由器);
  assert.ok(!config['proxy-groups'].some((g) => g.name === '🎬 Netflix'));
  assert.ok(config.rules.includes('RULE-SET,netflix,🌍 国外媒体'));
});

test('groupDefaults 改应用 / 集合的默认选择，不可用时保持原样并提示', () => {
  const TW = VLESS.replace('#%F0%9F%87%BA%F0%9F%87%B8%20LA', '#台湾');
  const out = generate({
    nodes: { intl: `${VLESS}\n${TW}`, cn: CN_VLESS },
    groupDefaults: { netflix: 'tw', 'cn-media': 'cn', youtube: 'jp', nope: 'us' },
  });
  checkConsistency(out.config);
  const g = Object.fromEntries(out.config['proxy-groups'].map((x) => [x.name, x]));
  assert.equal(g['🎬 Netflix'].proxies[0], '🇹🇼 台湾');
  assert.ok(g['🎬 Netflix'].proxies.includes('🌍 国外媒体'), '原默认仍可选');
  assert.equal(g['🏮 国内媒体'].proxies[0], '🇨🇳 回国');
  assert.equal(g['▶️ YouTube'].proxies[0], '🌍 国外媒体', '没有日本节点 → 保持');
  assert.equal(out.warnings.length, 2);
});

test('规则顺序：YouTube / Gemini 在 Google 前，GitHub 在 Microsoft 前，大类兜底在最后', () => {
  const { config } = generate(SCENARIOS.只有机场);
  const idx = (s) => config.rules.findIndex((r) => r.startsWith(`RULE-SET,${s},`));
  assert.ok(idx('youtube') < idx('google'));
  assert.ok(idx('google-gemini') < idx('google'));
  assert.ok(idx('github') < idx('microsoft'));
  assert.ok(idx('geolocation-!cn') > idx('category-ai-!cn'));
});

test('倍率正则', () => {
  const hi = new RegExp(multiplierRegex(3));
  const lo = new RegExp(multiplierRegex(2));
  for (const s of ['香港 3x', '日本丨5X', 'US x3', '新加坡 3.0倍', 'HK [10x]', '倍率:3', '台湾×4']) assert.ok(hi.test(s), s);
  for (const s of ['香港 1x', '日本 0.5x', 'US 2x', 'HK 01', 'SG 1.5倍', 'x1 美国', '台湾 0.3x']) assert.ok(!hi.test(s), s);
  for (const s of ['香港 1x', '日本 0.5x', 'HK 01', 'SG 1.5倍']) assert.ok(!lo.test(s), s);
  assert.ok(lo.test('US 2x'));
});

test('解析 vless reality', () => {
  const p = parseLink(VLESS, { mlkem: true });
  assert.equal(p.name, '🇺🇸 LA');
  assert.equal(p.type, 'vless');
  assert.equal(p.port, 443);
  assert.equal(p.flow, 'xtls-rprx-vision');
  assert.equal(p.servername, 'www.intel.com');
  assert.deepEqual(p['reality-opts'], { 'public-key': 'PUBKEY', 'short-id': 'ab12', 'support-x25519mlkem768': true });
});

test('解析 vmess / trojan / ss / hy2 / tuic / socks', () => {
  const vm = btoa(JSON.stringify({ v: '2', ps: 'vm', add: 'a.example', port: '443', id: 'uuid', aid: '0', net: 'ws', path: '/p', host: 'h.example', tls: 'tls', sni: 'h.example' }));
  const v = parseLink(`vmess://${vm}`);
  assert.equal(v['ws-opts'].headers.Host, 'h.example');
  assert.equal(v.tls, true);
  const t = parseLink('trojan://pass@t.example:443?sni=t.example&type=ws&path=%2Fws#T');
  assert.equal(t.password, 'pass');
  assert.equal(t['ws-opts'].path, '/ws');
  const s1 = parseLink(`ss://${btoa('aes-128-gcm:pw')}@s.example:8388#S1`);
  assert.deepEqual([s1.cipher, s1.password, s1.port], ['aes-128-gcm', 'pw', 8388]);
  const s2 = parseLink('ss://2022-blake3-aes-128-gcm:abc%3D@s.example:8388#S2');
  assert.equal(s2.password, 'abc=');
  const s3 = parseLink(`ss://${btoa('chacha20-ietf-poly1305:pw@[2001:db8::1]:443')}#S3`);
  assert.equal(s3.server, '2001:db8::1');
  const h = parseLink('hy2://pw@h.example:443?sni=h.example&obfs=salamander&obfs-password=x&insecure=1#H');
  assert.deepEqual([h.type, h.obfs, h['skip-cert-verify']], ['hysteria2', 'salamander', true]);
  const tu = parseLink('tuic://uuid:pw@tu.example:443?congestion_control=bbr&alpn=h3&sni=tu.example#TU');
  assert.deepEqual([tu.uuid, tu.password, tu['congestion-controller']], ['uuid', 'pw', 'bbr']);
  const so = parseLink('socks5://user:pw@1.2.3.4:1080#台湾住宅');
  assert.deepEqual([so.type, so.username, so.name], ['socks5', 'user', '台湾住宅']);
});

test('base64 整段订阅内容 + 错误行提示', () => {
  const blob = btoa(unescape(encodeURIComponent(`${VLESS}\nfoo://bar\nhttps://airport.example/sub`)));
  const { nodes, errors } = parseLinks(blob);
  assert.equal(nodes.length, 1);
  assert.equal(errors.length, 2);
  assert.match(errors[1].error, /订阅/);
});

test('重名节点自动加序号', () => {
  const { config } = generate({ nodes: { intl: `${VLESS}\n${VLESS}` } });
  assert.deepEqual(config.proxies.map((p) => p.name), ['🇺🇸 LA', '🇺🇸 LA 2']);
});

test('YAML 标量加引号', () => {
  assert.equal(scalar('🚀 总模式', true), '🚀 总模式');
  assert.equal(scalar('a, b', true), '"a, b"');
  assert.equal(scalar('yes'), '"yes"');
  assert.equal(scalar('1.2.3.4'), '"1.2.3.4"');
  assert.equal(scalar('*.lan'), '"*.lan"');
  assert.equal(scalar('key: v'), '"key: v"');
});

console.log(`\n${passed} 项通过${process.exitCode ? '，有失败' : ''}`);
