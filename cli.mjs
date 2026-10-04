#!/usr/bin/env node
// 命令行用法：node cli.mjs -c my-config.json -o config.yaml
// 设置文件格式见 examples/config.example.json（含订阅地址，别提交到公开仓库）
import { readFileSync, writeFileSync } from 'node:fs';
import { generate } from './src/generate.js';

const args = process.argv.slice(2);
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes('-h') || args.includes('--help')) {
  console.log('用法: node cli.mjs -c <设置.json> [-o <输出.yaml>]\n不带 -o 时输出到标准输出。');
  process.exit(0);
}

const cfgPath = opt('-c') || opt('--config');
const cfg = cfgPath ? JSON.parse(readFileSync(cfgPath, 'utf8').replace(/^﻿/, '')) : {};
const { yaml, warnings, stats } = generate(cfg);
for (const w of warnings) console.error(`⚠ ${w}`);

const out = opt('-o') || opt('--output');
if (out) {
  writeFileSync(out, yaml);
  console.error(`✔ 已写入 ${out}：${stats.groups} 个分组，${stats.rules} 条规则，${stats.ruleProviders} 个规则集`);
} else process.stdout.write(yaml);
