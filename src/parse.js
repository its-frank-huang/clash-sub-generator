// 把分享链接（vless:// vmess:// trojan:// ss:// hysteria2:// tuic:// anytls:// socks5:// http://）
// 转成 mihomo 的 proxies 条目。全部在本地完成，不发任何网络请求。

export function b64decode(str) {
  let s = str.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const dec = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const truthy = (v) => v === '1' || v === 'true';

function splitList(v) {
  return v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
}

// URL 对非特殊协议也能解析 user@host:port?query#hash；IPv6 去掉方括号
function parseUrl(link) {
  const u = new URL(link);
  const q = Object.fromEntries(u.searchParams.entries());
  return {
    user: dec(u.username),
    pass: dec(u.password),
    host: u.hostname.replace(/^\[|\]$/g, ''),
    port: Number(u.port),
    q,
    name: dec(u.hash.replace(/^#/, '')),
  };
}

// ws / grpc / h2 / xhttp 传输参数（vless / trojan 共用）
function transport(p, q) {
  const net = (q.type || 'tcp').toLowerCase();
  if (net === 'ws' || net === 'httpupgrade') {
    p.network = 'ws';
    p['ws-opts'] = { path: q.path || '/' };
    if (q.host) p['ws-opts'].headers = { Host: q.host };
    if (net === 'httpupgrade') p['ws-opts']['v2ray-http-upgrade'] = true;
  } else if (net === 'grpc') {
    p.network = 'grpc';
    p['grpc-opts'] = { 'grpc-service-name': q.serviceName || q.path || '' };
  } else if (net === 'h2' || net === 'http') {
    p.network = 'h2';
    p['h2-opts'] = { path: q.path || '/' };
    if (q.host) p['h2-opts'].host = splitList(q.host);
  } else if (net === 'xhttp') {
    p.network = 'xhttp';
    p['xhttp-opts'] = { path: q.path || '/' };
    if (q.host) p['xhttp-opts'].host = q.host;
    if (q.mode) p['xhttp-opts'].mode = q.mode;
  } else {
    p.network = 'tcp';
  }
}

function tlsOpts(p, q, opts) {
  const sec = (q.security || '').toLowerCase();
  if (sec === 'reality') {
    p.tls = true;
    p.servername = q.sni || q.peer || undefined;
    p['client-fingerprint'] = q.fp || 'chrome';
    p['reality-opts'] = { 'public-key': q.pbk, 'short-id': q.sid || '' };
    if (opts.mlkem) p['reality-opts']['support-x25519mlkem768'] = true;
  } else if (sec === 'tls' || sec === 'xtls') {
    p.tls = true;
    if (q.sni || q.peer) p.servername = q.sni || q.peer;
    if (q.fp) p['client-fingerprint'] = q.fp;
    if (q.alpn) p.alpn = splitList(dec(q.alpn));
    if (truthy(q.allowInsecure) || truthy(q.insecure)) p['skip-cert-verify'] = true;
  }
}

function vless(link, opts) {
  const { user, host, port, q, name } = parseUrl(link);
  const p = { name, type: 'vless', server: host, port, uuid: user, udp: true };
  transport(p, q);
  tlsOpts(p, q, opts);
  if (q.flow) p.flow = q.flow;
  if (q.encryption && q.encryption !== 'none') p.encryption = q.encryption;
  return p;
}

function vmess(link) {
  const body = link.slice('vmess://'.length).split('#')[0];
  const j = JSON.parse(b64decode(body));
  const p = {
    name: j.ps || '',
    type: 'vmess',
    server: j.add,
    port: Number(j.port),
    uuid: j.id,
    alterId: Number(j.aid || 0),
    cipher: j.scy || 'auto',
    udp: true,
  };
  const net = (j.net || 'tcp').toLowerCase();
  if (net === 'ws') {
    p.network = 'ws';
    p['ws-opts'] = { path: j.path || '/' };
    if (j.host) p['ws-opts'].headers = { Host: j.host };
  } else if (net === 'grpc') {
    p.network = 'grpc';
    p['grpc-opts'] = { 'grpc-service-name': j.path || '' };
  } else if (net === 'h2') {
    p.network = 'h2';
    p['h2-opts'] = { path: j.path || '/' };
    if (j.host) p['h2-opts'].host = splitList(j.host);
  } else if (net === 'tcp' && j.type === 'http') {
    p.network = 'http';
    p['http-opts'] = { path: [j.path || '/'] };
    if (j.host) p['http-opts'].headers = { Host: splitList(j.host) };
  }
  if (j.tls === 'tls') {
    p.tls = true;
    if (j.sni) p.servername = j.sni;
    if (j.alpn) p.alpn = splitList(j.alpn);
    if (j.fp) p['client-fingerprint'] = j.fp;
  }
  return p;
}

function trojan(link, opts) {
  const { user, host, port, q, name } = parseUrl(link);
  const p = { name, type: 'trojan', server: host, port, password: user, udp: true };
  transport(p, q);
  if ((q.security || 'tls') === 'reality') tlsOpts(p, q, opts);
  else {
    if (q.sni || q.peer) p.sni = q.sni || q.peer;
    if (q.fp) p['client-fingerprint'] = q.fp;
    if (q.alpn) p.alpn = splitList(dec(q.alpn));
    if (truthy(q.allowInsecure) || truthy(q.insecure)) p['skip-cert-verify'] = true;
  }
  if (p.network === 'tcp') delete p.network;
  return p;
}

function ss(link) {
  let rest = link.slice('ss://'.length);
  let name = '';
  const hash = rest.indexOf('#');
  if (hash >= 0) {
    name = dec(rest.slice(hash + 1));
    rest = rest.slice(0, hash);
  }
  let query = '';
  const qi = rest.indexOf('?');
  if (qi >= 0) {
    query = rest.slice(qi + 1);
    rest = rest.slice(0, qi);
  }
  rest = rest.replace(/\/$/, '');
  let userinfo, hostport;
  if (rest.includes('@')) {
    const at = rest.lastIndexOf('@');
    userinfo = rest.slice(0, at);
    hostport = rest.slice(at + 1);
    userinfo = userinfo.includes(':') ? dec(userinfo) : b64decode(dec(userinfo));
  } else {
    // 旧格式：整个 method:password@host:port 都是 base64
    const all = b64decode(rest);
    const at = all.lastIndexOf('@');
    userinfo = all.slice(0, at);
    hostport = all.slice(at + 1);
  }
  const ci = userinfo.indexOf(':');
  const m = hostport.match(/^\[?([^\]]+)\]?:(\d+)$/);
  if (!m) throw new Error('无法识别 ss 地址');
  const p = {
    name,
    type: 'ss',
    server: m[1],
    port: Number(m[2]),
    cipher: userinfo.slice(0, ci),
    password: userinfo.slice(ci + 1),
    udp: true,
  };
  const plugin = new URLSearchParams(query).get('plugin');
  if (plugin) {
    const [pname, ...kv] = plugin.split(';');
    const o = Object.fromEntries(kv.map((x) => x.split('=')).map(([k, v]) => [k, v ?? true]));
    if (pname.includes('obfs')) {
      p.plugin = 'obfs';
      p['plugin-opts'] = { mode: o.obfs || 'http', host: o['obfs-host'] || '' };
    } else if (pname.includes('v2ray')) {
      p.plugin = 'v2ray-plugin';
      p['plugin-opts'] = { mode: 'websocket', host: o.host || '', path: o.path || '/', tls: 'tls' in o };
    } else if (pname.includes('shadow-tls')) {
      p.plugin = 'shadow-tls';
      p['plugin-opts'] = { host: o.host || '', password: o.password || '', version: Number(o.version || 3) };
    }
  }
  return p;
}

function hysteria2(link) {
  const { user, pass, host, port, q, name } = parseUrl(link.replace(/^hy2:/, 'hysteria2:'));
  const p = {
    name,
    type: 'hysteria2',
    server: host,
    port: port || 443,
    password: pass ? `${user}:${pass}` : user,
    udp: true,
  };
  if (q.mport) p.ports = q.mport;
  if (q.sni) p.sni = q.sni;
  if (truthy(q.insecure)) p['skip-cert-verify'] = true;
  if (q.obfs && q.obfs !== 'none') {
    p.obfs = q.obfs;
    p['obfs-password'] = q['obfs-password'] || '';
  }
  if (q.alpn) p.alpn = splitList(dec(q.alpn));
  return p;
}

function tuic(link) {
  const { user, pass, host, port, q, name } = parseUrl(link);
  const p = { name, type: 'tuic', server: host, port, uuid: user, password: pass, udp: true };
  if (q.sni) p.sni = q.sni;
  p.alpn = splitList(dec(q.alpn || 'h3'));
  if (q.congestion_control) p['congestion-controller'] = q.congestion_control;
  if (q.udp_relay_mode) p['udp-relay-mode'] = q.udp_relay_mode;
  if (truthy(q.allow_insecure) || truthy(q.insecure)) p['skip-cert-verify'] = true;
  return p;
}

function anytls(link) {
  const { user, host, port, q, name } = parseUrl(link);
  const p = { name, type: 'anytls', server: host, port, password: user, udp: true };
  if (q.sni) p.sni = q.sni;
  if (q.fp) p['client-fingerprint'] = q.fp;
  if (truthy(q.insecure) || truthy(q.allowInsecure)) p['skip-cert-verify'] = true;
  return p;
}

function socksOrHttp(link, type) {
  const { user, pass, host, port, name } = parseUrl(link);
  const p = { name, type, server: host, port };
  // 有的客户端把 user:pass 整体 base64 放在用户名位置
  let u = user;
  let pw = pass;
  if (u && !pw) {
    try {
      const d = b64decode(u);
      if (d.includes(':')) [u, pw] = [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1)];
    } catch {
      /* 不是 base64，按原样使用 */
    }
  }
  if (u) p.username = u;
  if (pw) p.password = pw;
  if (link.startsWith('https://')) p.tls = true;
  if (type === 'socks5') p.udp = true;
  return p;
}

const PARSERS = [
  ['vless://', vless],
  ['vmess://', vmess],
  ['trojan://', trojan],
  ['ss://', ss],
  ['hysteria2://', hysteria2],
  ['hy2://', hysteria2],
  ['tuic://', tuic],
  ['anytls://', anytls],
  ['socks5://', (l) => socksOrHttp(l, 'socks5')],
  ['socks://', (l) => socksOrHttp(l.replace(/^socks:/, 'socks5:'), 'socks5')],
  ['http-proxy://', (l) => socksOrHttp(l.replace(/^http-proxy:/, 'http:'), 'http')],
];

export function parseLink(link, opts = {}) {
  const l = link.trim();
  const hit = PARSERS.find(([prefix]) => l.toLowerCase().startsWith(prefix));
  if (!hit) {
    if (/^https?:\/\//i.test(l)) throw new Error('这是订阅地址，请填到「订阅」里');
    throw new Error('不支持的链接类型');
  }
  const p = hit[1](l, opts);
  if (!p.server || !p.port) throw new Error('缺少服务器地址或端口');
  if (!p.name) p.name = `${p.type}-${p.server}:${p.port}`;
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  return p;
}

// 解析一整段文本：每行一个链接；整段是 base64 订阅内容时先解码
export function parseLinks(text, opts = {}) {
  let body = (text || '').trim();
  if (body && !body.includes('://')) {
    try {
      body = b64decode(body);
    } catch {
      /* 不是 base64 */
    }
  }
  const nodes = [];
  const errors = [];
  body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .forEach((line, i) => {
      try {
        nodes.push(parseLink(line, opts));
      } catch (e) {
        errors.push({ line: i + 1, text: line.slice(0, 40), error: e.message });
      }
    });
  return { nodes, errors };
}
