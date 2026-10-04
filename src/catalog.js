// 内置数据：地区、应用集合、应用及其分流规则。
// 规则写法：
//   geosite:<名称>  → MetaCubeX/meta-rules-dat geo/geosite/<名称>.mrs
//   geoip:<名称>    → MetaCubeX/meta-rules-dat geo/geoip/<名称>.mrs（自动加 no-resolve）
//   suffix:<域名> / domain:<域名> / keyword:<关键词>
// 所有 geosite / geoip 名称都已在 meta 分支核对过存在。

// 英文缩写两侧不能是字母，避免 "US" 误中 "Russia"、"HK" 误中 "HKT" 以外的单词
const ab = (s) => `(?:^|[^A-Za-z])${s}(?:[^A-Za-z]|$)`;

export const REGIONS = [
  { id: 'hk', name: '🇭🇰 香港', filter: `香港|🇭🇰|${ab('HK')}|Hong ?Kong` },
  { id: 'tw', name: '🇹🇼 台湾', filter: `台湾|台灣|🇹🇼|${ab('TW')}|Taiwan|台北|新北|彰化` },
  { id: 'jp', name: '🇯🇵 日本', filter: `日本|🇯🇵|${ab('JP')}|Japan|东京|東京|大阪|Tokyo|Osaka` },
  { id: 'sg', name: '🇸🇬 新加坡', filter: `新加坡|🇸🇬|${ab('SG')}|Singapore|狮城|獅城` },
  {
    id: 'us',
    name: '🇺🇸 美国',
    filter: `美国|美國|🇺🇸|${ab('US')}|${ab('USA')}|United States|America|洛杉矶|圣何塞|硅谷|西雅图|纽约|芝加哥|达拉斯|凤凰城|Los Angeles|San Jose|Seattle`,
  },
  { id: 'kr', name: '🇰🇷 韩国', filter: `韩国|韓國|🇰🇷|${ab('KR')}|Korea|首尔|首爾|Seoul|春川` },
  { id: 'gb', name: '🇬🇧 英国', filter: `英国|英國|🇬🇧|${ab('UK')}|${ab('GB')}|United Kingdom|Britain|伦敦|London` },
  { id: 'de', name: '🇩🇪 德国', filter: `德国|德國|🇩🇪|${ab('DE')}|Germany|法兰克福|Frankfurt` },
  { id: 'fr', name: '🇫🇷 法国', filter: `法国|法國|🇫🇷|${ab('FR')}|France|巴黎|Paris` },
  { id: 'ca', name: '🇨🇦 加拿大', filter: `加拿大|🇨🇦|Canada|多伦多|温哥华|Toronto|Vancouver` },
  { id: 'au', name: '🇦🇺 澳大利亚', filter: `澳大利亚|澳洲|🇦🇺|Australia|悉尼|Sydney` },
  { id: 'in', name: '🇮🇳 印度', filter: `印度|🇮🇳|India|孟买|Mumbai` },
  { id: 'tr', name: '🇹🇷 土耳其', filter: `土耳其|🇹🇷|${ab('TR')}|Turkey|Türkiye|伊斯坦布尔|Istanbul` },
  { id: 'ar', name: '🇦🇷 阿根廷', filter: `阿根廷|🇦🇷|Argentina` },
  { id: 'my', name: '🇲🇾 马来西亚', filter: `马来西亚|馬來西亞|🇲🇾|Malaysia|吉隆坡` },
  { id: 'th', name: '🇹🇭 泰国', filter: `泰国|泰國|🇹🇭|Thailand|曼谷` },
  { id: 'vn', name: '🇻🇳 越南', filter: `越南|🇻🇳|${ab('VN')}|Vietnam|胡志明` },
  { id: 'ph', name: '🇵🇭 菲律宾', filter: `菲律宾|菲律賓|🇵🇭|Philippines|马尼拉` },
  { id: 'ru', name: '🇷🇺 俄罗斯', filter: `俄罗斯|俄羅斯|🇷🇺|${ab('RU')}|Russia|莫斯科|Moscow` },
  { id: 'nl', name: '🇳🇱 荷兰', filter: `荷兰|荷蘭|🇳🇱|${ab('NL')}|Netherlands|阿姆斯特丹|Amsterdam` },
];

export const DEFAULT_REGIONS = ['hk', 'tw', 'jp', 'sg', 'us', 'kr', 'gb', 'de'];

// 机场里的回国节点（中转回大陆），默认不启用
export const DEFAULT_CN_FILTER = '回国|回國|大陆|大陸|China Mainland';

// 机场的信息节点（剩余流量、到期时间、官网…），在订阅层直接剔除
export const DEFAULT_INFO_FILTER = '剩余|剩餘|到期|过期|過期|流量|官网|官網|网址|網址|套餐|重置|有效期|客服|Expire|Traffic|Reset|Remaining';

// scope 决定默认跟随哪个总开关：
//   intl   → 🚀 总模式（境外默认）
//   cn     → 🏮 国内总模式（国内默认，DIRECT 或 回国）
//   direct → DIRECT（系统服务，大陆有 CDN）
//   reject → REJECT（广告拦截）
export const COLLECTIONS = [
  {
    id: 'ads',
    name: '🛑 广告拦截',
    scope: 'reject',
    enabled: false,
    catchAll: ['geosite:category-ads-all'],
    apps: [],
  },
  {
    id: 'intl-ai',
    name: '🤖 国外 AI',
    scope: 'intl',
    catchAll: ['geosite:category-ai-!cn'],
    apps: [
      { id: 'openai', name: '🟢 ChatGPT', rules: ['geosite:openai'] },
      { id: 'claude', name: '🟠 Claude', rules: ['geosite:anthropic'] },
      { id: 'gemini', name: '✨ Gemini', rules: ['geosite:google-gemini'] },
      { id: 'copilot', name: '🛩️ Copilot', rules: ['geosite:github-copilot'] },
      { id: 'grok', name: '🌀 Grok', rules: ['geosite:xai'] },
      { id: 'perplexity', name: '🔎 Perplexity', rules: ['geosite:perplexity'] },
      { id: 'huggingface', name: '🤗 Hugging Face', rules: ['geosite:huggingface'], own: false },
    ],
  },
  {
    id: 'cn-ai',
    name: '🐼 国内 AI',
    scope: 'cn',
    catchAll: ['geosite:category-ai-cn'],
    apps: [
      { id: 'deepseek', name: '🐋 DeepSeek', rules: ['geosite:deepseek'] },
      { id: 'kimi', name: '🌙 Kimi', rules: ['suffix:kimi.com', 'suffix:kimi.ai', 'suffix:moonshot.cn'] },
      { id: 'doubao', name: '🔵 豆包', rules: ['geosite:doubao'] },
      { id: 'tongyi', name: '🧡 通义千问', rules: ['suffix:tongyi.aliyun.com', 'suffix:qianwen.aliyun.com'], own: false },
      { id: 'zhipu', name: '🔷 智谱清言', rules: ['suffix:chatglm.cn', 'suffix:bigmodel.cn', 'suffix:zhipuai.cn'], own: false },
    ],
  },
  {
    id: 'intl-media',
    name: '🌍 国外媒体',
    scope: 'intl',
    catchAll: [],
    apps: [
      { id: 'youtube', name: '▶️ YouTube', rules: ['geosite:youtube'] },
      { id: 'netflix', name: '🎬 Netflix', rules: ['geosite:netflix', 'geoip:netflix'] },
      { id: 'disney', name: '🏰 Disney+', rules: ['geosite:disney'] },
      { id: 'hbo', name: '🎞️ HBO Max', rules: ['geosite:hbo'] },
      { id: 'primevideo', name: '📦 Prime Video', rules: ['geosite:primevideo'] },
      { id: 'hulu', name: '🟩 Hulu', rules: ['geosite:hulu'] },
      { id: 'appletv', name: '🍿 Apple TV+', rules: ['geosite:apple-tvplus'] },
      { id: 'spotify', name: '🎧 Spotify', rules: ['geosite:spotify'] },
      { id: 'tiktok', name: '🎶 TikTok', rules: ['geosite:tiktok'] },
      { id: 'twitch', name: '🟣 Twitch', rules: ['geosite:twitch'] },
      { id: 'paramount', name: '⛰️ Paramount+', rules: ['suffix:paramountplus.com', 'suffix:paramount.com', 'suffix:pplusstatic.com'], own: false },
      { id: 'dazn', name: '🥊 DAZN', rules: ['geosite:dazn'], own: false },
      { id: 'abema', name: '🅰️ AbemaTV', rules: ['geosite:abema'], own: false },
      { id: 'niconico', name: '🎌 niconico', rules: ['geosite:niconico'], own: false },
      { id: 'bahamut', name: '🐲 巴哈姆特', rules: ['geosite:bahamut'] },
      { id: 'biliintl', name: '🌏 哔哩哔哩国际', rules: ['geosite:biliintl'], own: false },
      { id: 'pixiv', name: '🎨 Pixiv', rules: ['geosite:pixiv'], own: false },
      { id: 'emby', name: '📼 Emby', rules: ['geosite:category-emby'], own: false },
    ],
  },
  {
    id: 'cn-media',
    name: '🏮 国内媒体',
    scope: 'cn',
    catchAll: [],
    apps: [
      { id: 'bilibili', name: '📺 哔哩哔哩', rules: ['geosite:bilibili'] },
      { id: 'iqiyi', name: '🥝 爱奇艺', rules: ['geosite:iqiyi'] },
      { id: 'youku', name: '🟦 优酷', rules: ['geosite:youku'] },
      { id: 'tencentvideo', name: '🐧 腾讯视频', rules: ['suffix:v.qq.com', 'suffix:video.qq.com'] },
      { id: 'mgtv', name: '🥭 芒果TV', rules: ['geosite:hunantv'] },
      {
        id: 'qqmusic',
        name: '🎵 QQ音乐',
        rules: ['suffix:y.qq.com', 'suffix:music.qq.com', 'suffix:qqmusic.qq.com', 'suffix:y.gtimg.cn', 'suffix:tencentmusic.com'],
      },
      { id: 'kge', name: '🎤 全民K歌', rules: ['suffix:kg.qq.com'] },
      { id: 'neteasemusic', name: '☁️ 网易云音乐', rules: ['suffix:music.163.com', 'suffix:music.126.net'] },
      { id: 'kugou', name: '🐶 酷狗酷我', rules: ['geosite:kugou', 'geosite:kuwo'], own: false },
      { id: 'douyin', name: '🎼 抖音', rules: ['geosite:douyin'], own: false },
      { id: 'ximalaya', name: '🎙️ 喜马拉雅', rules: ['geosite:ximalaya'], own: false },
    ],
  },
  {
    id: 'im',
    name: '💬 通讯软件',
    scope: 'intl',
    catchAll: [],
    apps: [
      { id: 'telegram', name: '✈️ Telegram', rules: ['geosite:telegram', 'geoip:telegram'] },
      { id: 'whatsapp', name: '📞 WhatsApp', rules: ['geosite:whatsapp'] },
      { id: 'line', name: '💚 LINE', rules: ['geosite:line'] },
      { id: 'discord', name: '🎮 Discord', rules: ['geosite:discord'] },
      { id: 'signal', name: '🔒 Signal', rules: ['geosite:signal'], own: false },
      { id: 'kakao', name: '💛 KakaoTalk', rules: ['geosite:kakao'], own: false },
    ],
  },
  {
    id: 'social',
    name: '👥 社交媒体',
    scope: 'intl',
    catchAll: [],
    apps: [
      { id: 'twitter', name: '🐦 X (Twitter)', rules: ['geosite:twitter', 'geoip:twitter'] },
      { id: 'instagram', name: '📷 Instagram', rules: ['geosite:instagram'] },
      { id: 'facebook', name: '📘 Facebook', rules: ['geosite:facebook', 'geoip:facebook'] },
      { id: 'reddit', name: '👽 Reddit', rules: ['geosite:reddit'], own: false },
    ],
  },
  {
    id: 'games',
    name: '🕹️ 游戏平台',
    scope: 'intl',
    catchAll: ['geosite:category-games-!cn'],
    apps: [
      { id: 'steam', name: '🚂 Steam', rules: ['geosite:steam'] },
      { id: 'epic', name: '🅴 Epic Games', rules: ['geosite:epicgames'], own: false },
      { id: 'playstation', name: '🎯 PlayStation', rules: ['geosite:playstation'], own: false },
      { id: 'nintendo', name: '🍄 Nintendo', rules: ['geosite:nintendo'], own: false },
      { id: 'xbox', name: '❎ Xbox', rules: ['geosite:xbox'], own: false },
    ],
  },
  {
    id: 'intl-services',
    name: '🧰 国外服务',
    scope: 'intl',
    catchAll: [],
    apps: [
      // GitHub 必须在 Microsoft 之前（microsoft 规则集 include 了 github）
      { id: 'github', name: '🐙 GitHub', rules: ['geosite:github'] },
      // Google 必须在 YouTube / Gemini 之后，集合顺序已保证
      { id: 'google', name: '🔍 Google', rules: ['geosite:google', 'geoip:google'] },
      { id: 'paypal', name: '💳 PayPal', rules: ['geosite:paypal'], own: false },
    ],
  },
  {
    id: 'system',
    name: '🖥️ 系统服务',
    scope: 'direct',
    catchAll: [],
    apps: [
      { id: 'onedrive', name: '☁️ OneDrive', rules: ['geosite:onedrive'], own: false },
      { id: 'microsoft', name: 'Ⓜ️ Microsoft', rules: ['geosite:microsoft'] },
      { id: 'apple', name: '🍎 Apple', rules: ['geosite:apple'] },
    ],
  },
  {
    // 特殊集合：兜底的国内网站（geosite:cn + geoip:cn），排在 geolocation-!cn 前后
    id: 'cn-sites',
    name: '🏠 国内网站',
    scope: 'cn',
    catchAll: [],
    apps: [],
  },
];

export const RULE_SOURCES = {
  github: {
    label: 'GitHub（经 🚀 总模式下载）',
    base: 'https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo',
    viaProxy: true,
  },
  jsdelivr: {
    label: 'jsDelivr CDN（直连下载，大陆可用）',
    base: 'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo',
    viaProxy: false,
  },
};
