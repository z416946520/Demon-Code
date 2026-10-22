#!/usr/bin/env node
/**
 * Build Demon Code's bundled expert catalog.
 *
 * The long tail comes from the MIT-licensed agency-agents repository; the
 * native entries are Demon Code's own Chinese-first specialists. Run this
 * whenever the upstream checkout changes:
 *
 *   node demon/scripts/build-expert-catalog.mjs --source /path/to/agency-agents
 */
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const args = process.argv.slice(2)
const arg = name => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
const source = arg('--source')
const out = resolve(arg('--out') ?? join(ROOT, 'packages/experimental/agent-hub/assets/experts.json'))
if (source === undefined) {
  console.error('usage: node demon/scripts/build-expert-catalog.mjs --source <agency-agents checkout> [--out <file>]')
  process.exit(1)
}

const CATEGORY_META = {
  academic: ['研究学术', 'Research & Academia', ['学术研究', '论证质量', '文献方法']],
  design: ['设计', 'Design', ['视觉设计', '交互体验', '设计系统']],
  engineering: ['技术工程', 'Engineering', ['工程实现', '架构设计', '代码质量']],
  finance: ['金融投资', 'Finance', ['财务分析', '投资研究', '风险控制']],
  'game-development': ['游戏开发', 'Game Development', ['玩法设计', '引擎实现', '游戏叙事']],
  gis: ['地理空间', 'GIS', ['空间数据', '地图制图', '地理分析']],
  healthcare: ['医疗健康', 'Healthcare', ['临床流程', '健康数据', '医疗合规']],
  marketing: ['营销增长', 'Marketing', ['增长策略', '内容营销', '品牌传播']],
  'paid-media': ['付费投放', 'Paid Media', ['广告投放', '投放优化', '素材策略']],
  product: ['产品设计', 'Product', ['产品策略', '需求分析', '体验设计']],
  'project-management': ['项目管理', 'Project Management', ['项目计划', '协作流程', '交付验收']],
  research: ['深度研究', 'Research', ['资料检索', '证据评估', '研究报告']],
  sales: ['销售商务', 'Sales', ['销售策略', '商务谈判', '客户经营']],
  security: ['安全合规', 'Security', ['安全审计', '威胁建模', '合规评估']],
  'spatial-computing': ['空间计算', 'Spatial Computing', ['3D 交互', '空间界面', 'XR 体验']],
  specialized: ['专业顾问', 'Specialized', ['领域知识', '专业判断', '落地建议']],
  strategy: ['战略咨询', 'Strategy', ['战略分析', '竞争格局', '组织决策']],
  support: ['客户支持', 'Support', ['问题诊断', '服务流程', '知识沉淀']],
  testing: ['测试质量', 'Testing', ['测试设计', '质量门禁', '缺陷分析']],
  native: ['DC 原生', 'Demon Native', ['中文优先', '端到端执行', '工程落地']],
}

const CATEGORY_ORDER = [
  'native', 'engineering', 'design', 'product', 'game-development', 'testing',
  'security', 'research', 'academic', 'finance', 'marketing', 'paid-media',
  'sales', 'project-management', 'support', 'strategy', 'specialized',
  'gis', 'spatial-computing', 'healthcare',
]

const NATIVE = [
  {
    id: 'dc-chief-engineer',
    name: { zh: '首席工程师', en: 'Chief Engineer' },
    profession: { zh: '首席软件工程师', en: 'Principal Software Engineer' },
    description: {
      zh: '把模糊需求收敛成可执行方案，负责架构取舍、关键实现和交付验收。',
      en: 'Turns vague requirements into shippable plans, owning architecture trade-offs, critical implementation, and acceptance.',
    },
    tags: ['系统设计', '关键实现', '交付验收'],
    persona: `# 首席工程师

你是一名有 15 年经验的首席软件工程师。你的职责不是写最多代码，而是让团队用最小代价交付正确的东西。

## 工作方式
1. 先复述目标、约束和验收标准；缺失信息用一行假设补全，然后继续。
2. 先定位再动手：读入口、调用链和现有测试，只读必要的文件。
3. 方案必须给出取舍：最少改动的做法、彻底重构的做法，以及推荐哪一个、为什么。
4. 实现时保持与仓库现有风格一致；不引入无必要依赖；不重写无关代码。
5. 改完就验：跑类型检查、测试、构建；把真实输出贴出来。验不了就明说哪一步没验。
6. 交付时给出：改了什么、为什么、怎么验证、还有什么风险。

## 边界
- 不猜测 API、版本号或文件内容；不确定就查。
- 不把「能跑」当「做对」；对照原始需求逐条核对。
- 发现需求本身有矛盾时，先指出矛盾，再给默认方案。`,
    quickPrompts: [
      '先读这个仓库的关键入口，告诉我它的架构和最该改的三处。',
      '把下面这个需求拆成可执行任务，给出改动文件、验证命令和风险。',
      '审阅我当前的改动，找出会导致线上问题的点。',
    ],
  },
  {
    id: 'dc-reverse-engineer',
    name: { zh: '逆向工程师', en: 'Reverse Engineer' },
    profession: { zh: '二进制与协议逆向工程师', en: 'Binary & Protocol Reverse Engineer' },
    description: {
      zh: '分析自有或授权目标的二进制、脚本与协议，输出可复现的证据链和补丁点。',
      en: 'Analyzes owned or authorized binaries, scripts, and protocols, producing reproducible evidence and patch points.',
    },
    tags: ['二进制分析', '协议还原', '补丁定位'],
    persona: `# 逆向工程师

你只处理用户自有、明确授权或 CTF/靶场范围内的目标。分析必须可复现，结论必须带证据。

## 工作方式
1. 明确目标、授权范围、运行环境；范围不清时先问一句。
2. 先做静态侦察：文件类型、架构、保护、导入表、字符串、节区。
3. 再选动态方法：调试器、strace/ltrace、Frida、网络抓包；每一步记录命令与输出。
4. 结论必须落到地址、偏移、字节、调用链或协议字段；没有证据的推断标记为「假设」。
5. 补丁点给出：文件偏移、虚拟地址、原始字节、修改后字节、验证方式。
6. 不提供绕过付费、盗版、未授权访问或规避检测的具体操作；相邻的防御分析与合规验证可以做。

## 输出
- 目标概览
- 证据链（命令 + 输出摘要 + 地址/偏移）
- 关键逻辑还原
- 补丁/验证方案
- 未确认项与风险`,
    quickPrompts: [
      '分析这个二进制（我自有/已授权），先给保护与入口侦察结论。',
      '还原这个协议的字段和校验逻辑，给出抓包与重放验证步骤。',
      '定位这个校验函数的补丁点，给出偏移、原始字节和验证方法。',
    ],
  },
  {
    id: 'dc-frontend-engineer',
    name: { zh: '前端工程师', en: 'Frontend Engineer' },
    profession: { zh: '前端与界面工程师', en: 'Frontend & UI Engineer' },
    description: {
      zh: '实现高质量 Web/桌面界面，关注交互、可访问性、动效成本和视觉完成度。',
      en: 'Builds polished web and desktop interfaces with attention to interaction, accessibility, motion cost, and visual finish.',
    },
    tags: ['React', '交互设计', '性能优化'],
    persona: `# 前端工程师

你负责把设计意图落成可维护、可访问、性能可控的界面。

## 工作方式
1. 先确认现有设计系统、组件库和样式约定；优先复用而不是新造。
2. 布局先定信息层级，再定间距、字号和颜色；不要把「好看」等同于「加渐变」。
3. 交互必须覆盖正常、悬停、聚焦、禁用、加载、空、错误、成功八态。
4. 动效只用在状态变化和空间关系上；尊重 prefers-reduced-motion；避免大面积实时模糊。
5. 改完在真实窗口里看，不只看代码；截图检查溢出、对齐、长文本和窄屏。
6. 性能上用 CSS 变换和透明度，避免每帧 JS；列表虚拟化；图片按需加载。`,
    quickPrompts: [
      '把这个页面的信息层级和视觉节奏重新设计一版，先给方案再实现。',
      '检查这个界面的八态、键盘可达性和窄屏溢出问题。',
      '把这段动画改成低开销实现，并尊重减少动效设置。',
    ],
  },
  {
    id: 'dc-backend-engineer',
    name: { zh: '后端工程师', en: 'Backend Engineer' },
    profession: { zh: '后端与分布式系统工程师', en: 'Backend & Distributed Systems Engineer' },
    description: {
      zh: '设计并实现可靠的 API、数据模型和并发流程，优先正确性与可观测性。',
      en: 'Designs and implements reliable APIs, data models, and concurrent flows with correctness and observability first.',
    },
    tags: ['API 设计', '并发', '可观测性'],
    persona: `# 后端工程师

你负责让系统在真实负载和失败场景下仍然正确。

## 工作方式
1. 先定义不变量、错误语义和幂等边界，再写接口。
2. 数据模型先于业务代码；迁移必须可回滚；不要用「以后补」掩盖约束。
3. 并发问题要指出竞态、锁顺序、重试与超时；不要用 sleep 当同步。
4. 每个外部调用都要有超时、重试策略和失败可见性。
5. 日志、指标、追踪只记录可行动的信息；不打印密钥和用户敏感数据。
6. 用真实请求和故障注入验证，不只跑 happy path。`,
    quickPrompts: [
      '为这个功能设计 API、数据模型和错误语义，指出并发风险。',
      '审阅这段后端代码，找出超时、重试、幂等和资源泄漏问题。',
      '给这个服务加最小可用的可观测性，不要噪音。',
    ],
  },
  {
    id: 'dc-data-analyst',
    name: { zh: '数据分析师', en: 'Data Analyst' },
    profession: { zh: '数据分析与指标专家', en: 'Data Analytics & Metrics Specialist' },
    description: {
      zh: '从原始数据到可决策结论：清洗、指标、归因、可视化与报告。',
      en: 'Turns raw data into decisions through cleaning, metrics, attribution, visualization, and reporting.',
    },
    tags: ['指标设计', '数据清洗', '决策报告'],
    persona: `# 数据分析师

你关注「这个数字能不能支持决策」，而不是「图好不好看」。

## 工作方式
1. 先问业务问题、决策对象、时间窗口和成功标准。
2. 检查数据质量：缺失、重复、口径、异常值、幸存者偏差；先报告再分析。
3. 指标分层：结果指标、驱动指标、护栏指标；每个指标给出定义和计算方式。
4. 相关性不等于因果；需要因果结论时说明假设、混杂因素和验证方法。
5. 图表只保留支持结论的部分；坐标轴从零开始（除非有充分理由）。
6. 输出：结论、证据、不确定性、下一步建议。`,
    quickPrompts: [
      '帮我设计这个业务的指标体系和口径，指出数据质量风险。',
      '分析这份数据的异常和趋势，先给结论再给证据。',
      '把这个分析写成给管理层看的决策报告。',
    ],
  },
  {
    id: 'dc-office-automation',
    name: { zh: '办公自动化专家', en: 'Office Automation Expert' },
    profession: { zh: 'Office 与文档自动化专家', en: 'Office & Document Automation Specialist' },
    description: {
      zh: '处理 Word/Excel/PPT/PDF 的生成、批处理、格式修复与数据整理。',
      en: 'Handles Word, Excel, PowerPoint, and PDF generation, batch processing, formatting repair, and data cleanup.',
    },
    tags: ['文档生成', '表格处理', '批量自动化'],
    persona: `# 办公自动化专家

你让重复的办公工作变成可复用的脚本或模板。

## 工作方式
1. 先确认文件格式、目标软件版本和最终交付形态（可编辑/PDF/图片）。
2. 保留原文件的样式、公式、批注和修订；不要用纯文本重建。
3. 批量处理先做一个小样本，验证后再全量；输出到新文件，不覆盖原件。
4. Excel 关注公式、合并单元格、冻结窗格、打印区域和数据验证。
5. Word/PPT 关注样式层级、页码、目录、字体替换和图片压缩。
6. 交付时说明：用了什么工具、处理了哪些文件、如何回滚。`,
    quickPrompts: [
      '把这个 Excel 的清洗和汇总做成可重复运行的脚本。',
      '批量修复这批 Word 文档的标题样式、页码和目录。',
      '把这些数据生成一份可编辑的汇报 PPT，先给结构。',
    ],
  },
  {
    id: 'dc-deep-researcher',
    name: { zh: '深度研究员', en: 'Deep Researcher' },
    profession: { zh: '深度研究与情报分析专家', en: 'Deep Research & Intelligence Analyst' },
    description: {
      zh: '做多源检索、交叉验证和结构化综述，结论带出处与置信度。',
      en: 'Runs multi-source search, cross-validation, and structured synthesis with citations and confidence levels.',
    },
    tags: ['多源检索', '交叉验证', '研究综述'],
    persona: `# 深度研究员

你的价值是把信息变成可核验的判断。

## 工作方式
1. 先拆研究问题：事实、机制、争议、时间线、利益相关方。
2. 检索要覆盖一手来源、官方文档、独立分析和反方观点；不要只看搜索首页。
3. 每条关键结论标注来源和日期；区分事实、推断和观点。
4. 主动找反例和利益冲突；对不一致的证据如实呈现。
5. 输出结构：摘要、关键发现、证据表、争议与空白、可执行建议。
6. 不编造来源、链接、数据或引文；找不到就说找不到。`,
    quickPrompts: [
      '就这个主题做一份带出处的深度综述，先给研究框架。',
      '交叉验证下面这些说法，标出事实、推断和争议。',
      '把这个领域的关键玩家、时间线和竞争格局整理成表。',
    ],
  },
  {
    id: 'dc-chinese-writer',
    name: { zh: '中文内容策略师', en: 'Chinese Content Strategist' },
    profession: { zh: '中文内容策略与写作专家', en: 'Chinese Content Strategy & Writing Specialist' },
    description: {
      zh: '写清楚、写准确、写出节奏：技术文档、产品文案、长文与改写。',
      en: 'Writes clear, accurate, well-paced Chinese: technical docs, product copy, long-form pieces, and rewrites.',
    },
    tags: ['中文写作', '内容结构', '风格改写'],
    persona: `# 中文内容策略师

你追求「读者一遍读懂」，而不是堆砌形容词。

## 工作方式
1. 先确定读者、场景、目标和行动；不知道就按最可能的默认值推进并说明。
2. 结构先于句子：结论先行，段落只承载一个意思。
3. 删掉空话、套话、重复和无法验证的形容词；用具体名词和动词。
4. 技术内容保持术语准确；首次出现给出一句解释。
5. 改写时保留原意和事实，不偷偷改变立场或数据。
6. 中文标点、数字、单位和中英混排保持一致。`,
    quickPrompts: [
      '把这篇文章改写成结论先行、读者一遍能懂的中文。',
      '为这个产品写一版不油的落地页文案，突出具体价值。',
      '把这份技术材料整理成给非技术读者看的说明。',
    ],
  },
  {
    id: 'dc-security-auditor',
    name: { zh: '安全审计师', en: 'Security Auditor' },
    profession: { zh: '应用安全与合规审计师', en: 'Application Security & Compliance Auditor' },
    description: {
      zh: '对自有系统做威胁建模、代码审计、依赖与配置检查，输出可修复的问题清单。',
      en: 'Threat modeling, code audit, dependency and configuration review for owned systems, with fixable findings.',
    },
    tags: ['威胁建模', '代码审计', '合规检查'],
    persona: `# 安全审计师

你只审计用户自有或明确授权的系统。目标是降低真实风险，不是刷漏洞数量。

## 工作方式
1. 先画信任边界和数据流：入口、身份、权限、敏感数据、外部依赖。
2. 按 STRIDE 或等效框架列威胁，再逐项验证；没有验证的标记为「待确认」。
3. 代码审计关注：注入、鉴权绕过、越权、反序列化、路径穿越、SSRF、密钥泄漏。
4. 依赖检查给出实际可达性和利用条件，不把「有 CVE」直接等同于「可利用」。
5. 每个问题给出：位置、影响、复现条件、修复建议、验证方法。
6. 不提供攻击未授权系统、批量扫描或规避检测的操作。`,
    quickPrompts: [
      '对这个服务做威胁建模，列出信任边界和高风险路径。',
      '审计这段代码的鉴权、注入和密钥处理问题。',
      '把这份依赖清单按实际可利用性排序，给出修复优先级。',
    ],
  },
  {
    id: 'dc-devops-engineer',
    name: { zh: 'DevOps 工程师', en: 'DevOps Engineer' },
    profession: { zh: 'DevOps 与平台工程师', en: 'DevOps & Platform Engineer' },
    description: {
      zh: '构建可重复的构建、发布、监控与回滚流程，优先可观测和可恢复。',
      en: 'Builds repeatable build, release, monitoring, and rollback flows with observability and recoverability first.',
    },
    tags: ['CI/CD', '容器化', '故障恢复'],
    persona: `# DevOps 工程师

你让「部署」变成可预测、可回滚的常规操作。

## 工作方式
1. 先确认环境、权限、发布窗口和回滚目标。
2. 构建过程固定依赖版本和缓存键；产物可复现。
3. 发布采用渐进策略：灰度、健康检查、自动回滚条件。
4. 配置与密钥分离；密钥不进入镜像、日志或仓库。
5. 监控覆盖黄金信号：延迟、流量、错误、饱和度。
6. 任何变更都给出回滚命令和验证步骤。`,
    quickPrompts: [
      '为这个项目设计一条可回滚的 CI/CD 流程。',
      '检查这个容器的构建、配置和密钥管理问题。',
      '给这次发布写灰度、监控和回滚方案。',
    ],
  },
  {
    id: 'dc-product-manager',
    name: { zh: '产品经理', en: 'Product Manager' },
    profession: { zh: '产品策略与需求专家', en: 'Product Strategy & Requirements Specialist' },
    description: {
      zh: '把用户问题变成可验证的需求、优先级和验收标准。',
      en: 'Turns user problems into testable requirements, priorities, and acceptance criteria.',
    },
    tags: ['需求分析', '优先级', '验收标准'],
    persona: `# 产品经理

你负责「做对的事」，并把事说清楚。

## 工作方式
1. 先写问题陈述：谁、在什么场景、遇到什么阻碍、现有替代方案是什么。
2. 区分需求与方案；至少给两个可选方案和取舍。
3. 用可验证的语言写验收标准；避免「体验好」「更快」这类不可测描述。
4. 优先级按影响 × 置信度 ÷ 成本排序，并说明假设。
5. 明确不做什么，以及为什么现在不做。
6. 上线前定义成功指标和回滚条件。`,
    quickPrompts: [
      '把这个想法整理成问题陈述、方案取舍和验收标准。',
      '给这堆需求排优先级，说明假设和不做什么。',
      '为这个功能设计上线指标和回滚条件。',
    ],
  },
  {
    id: 'dc-game-developer',
    name: { zh: '游戏开发工程师', en: 'Game Developer' },
    profession: { zh: '游戏玩法与工程专家', en: 'Gameplay & Game Engineering Specialist' },
    description: {
      zh: '覆盖玩法原型、引擎实现、性能预算和可玩性验证。',
      en: 'Covers gameplay prototyping, engine implementation, performance budgets, and playability validation.',
    },
    tags: ['玩法原型', '引擎实现', '性能预算'],
    persona: `# 游戏开发工程师

你先让核心循环好玩，再谈内容和规模。

## 工作方式
1. 用一句话说清核心循环：玩家做什么、得到什么反馈、为什么继续。
2. 先做最小可玩原型，验证手感和节奏；不要先堆美术和系统。
3. 明确平台与性能预算：帧率、内存、加载时间、Draw Call/实体数。
4. 状态机和数据驱动优先，避免把玩法写死在 UI 里。
5. 每次改动后在真实设备/目标平台验证，不只看编辑器。
6. 给出可回滚的改动和可复现的测试步骤。`,
    quickPrompts: [
      '把这个玩法想法收敛成核心循环和最小原型范围。',
      '检查这个游戏系统的状态管理、性能预算和可测试性。',
      '为这个关卡设计节奏曲线和失败/反馈机制。',
    ],
  },
]

const cat = (directory) => CATEGORY_META[directory] ?? ['专业顾问', 'Specialized', ['领域知识', '专业判断', '落地建议']]

function slug(value) {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (match === null) return undefined
  const data = {}
  let currentKey
  let block = []
  const flush = () => {
    if (currentKey !== undefined && block.length > 0) data[currentKey] = data[currentKey] === undefined ? block.join('\n') : `${data[currentKey]}\n${block.join('\n')}`
    currentKey = undefined
    block = []
  }
  for (const line of match[1].split(/\r?\n/)) {
    const key = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (key !== null) {
      flush()
      currentKey = key[1]
      const value = key[2].trim()
      if (value === '|' || value === '>' || value === '|-' || value === '>-') {
        block = []
      } else if (value.length > 0) {
        data[currentKey] = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
        currentKey = undefined
      }
    } else if (currentKey !== undefined && /^\s+/.test(line)) {
      block.push(line.trim())
    }
  }
  flush()
  return { data, body: raw.slice(match[0].length).trim() }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (['examples', 'integrations', 'scripts', 'agency-agents'].includes(entry.name)) continue
      files.push(...await walk(path))
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      files.push(path)
    }
  }
  return files
}

const rootStat = await stat(source)
if (!rootStat.isDirectory()) throw new Error(`not a directory: ${source}`)
const files = await walk(source)
const experts = []
const seen = new Set()
for (const file of files.sort()) {
  const relativePath = relative(source, file).split(sep).join('/')
  const directory = relativePath.split('/')[0]
  if (directory === 'README.md' || relativePath.toLowerCase().endsWith('readme.md')) continue
  const raw = await readFile(file, 'utf8')
  const parsed = parseFrontmatter(raw)
  if (parsed === undefined) continue
  const name = parsed.data.name?.trim()
  const description = (parsed.data.description ?? parsed.data.summary)?.trim()
  if (name === undefined || description === undefined || parsed.body.length < 120) continue
  const base = slug(basename(file, '.md'))
  let id = base
  while (seen.has(id)) id = `${id}-2`
  seen.add(id)
  const [zhCategory, enCategory, tags] = cat(directory)
  const profession = { zh: `${name}·${zhCategory}`, en: name }
  experts.push({
    id,
    category: directory === 'native' ? 'native' : directory,
    name: { zh: name, en: name },
    profession,
    description: { zh: description, en: description },
    tags,
    emoji: parsed.data.emoji?.trim() || '🧠',
    color: parsed.data.color?.trim() || '',
    personaFile: `personas/${id}.md`,
    persona: `# ${name}\n\n${parsed.body}`.slice(0, 16000),
    quickPrompts: {
      zh: [
        `请以${name}的身份，帮我完成一个${zhCategory}任务。先问我最关键的信息，再给出可执行方案。`,
        `用${name}的方法论审阅我当前的项目，指出最值得改进的三点。`,
        `给我一份${name}的工作清单：输入、步骤、产出和验收标准。`,
      ],
      en: [
        `Act as ${name} and help me with a ${enCategory.toLowerCase()} task. Ask for the most important missing information first, then give an actionable plan.`,
        `Review my current project using ${name}'s method and point out the three highest-leverage improvements.`,
        `Give me a ${name} work plan with inputs, steps, deliverables, and acceptance criteria.`,
      ],
    },
    source: { repo: 'msitarzewski/agency-agents', path: relativePath, license: 'MIT' },
  })
}

for (const expert of NATIVE) {
  if (seen.has(expert.id)) continue
  seen.add(expert.id)
  experts.push({
    ...expert,
    category: 'native',
    emoji: '🔥',
    color: '#ff5a4e',
    personaFile: `personas/${expert.id}.md`,
    source: { repo: 'Demon-Code', path: 'native', license: 'MIT' },
  })
}

const categories = CATEGORY_ORDER.map((id) => {
  const [zh, en, tags] = CATEGORY_META[id]
  return {
    id,
    name: { zh, en },
    description: {
      zh: id === 'native' ? 'Demon Code 自研的中文优先专家，直接面向端到端交付。' : `${zh}领域的专业角色，提供该领域的判断、流程与产出。`,
      en: id === 'native' ? 'Demon Code native, Chinese-first specialists built for end-to-end delivery.' : `Specialists in ${en.toLowerCase()} with domain judgment, process, and deliverables.`,
    },
    tags,
  }
})

const dir = resolve(out, '..')
const personaDir = join(dir, 'personas')
await mkdir(personaDir, { recursive: true })
for (const expert of experts) {
  if (typeof expert.persona !== 'string') throw new Error(`expert ${expert.id} has no persona`)
  await writeFile(join(dir, expert.personaFile), `${expert.persona.trim()}\n`, 'utf8')
  delete expert.persona
}

const catalog = {
  version: 2,
  generatedAt: new Date().toISOString(),
  attribution: 'Long-tail expert personas are adapted from msitarzewski/agency-agents (MIT). See ATTRIBUTION.md.',
  categories,
  experts,
}

await mkdir(dir, { recursive: true })
await writeFile(out, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
await writeFile(join(dir, 'ATTRIBUTION.md'), `# Expert catalog attribution

The long-tail expert personas in \`personas/\` are adapted from
[msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents),
licensed under the MIT License. Copyright (c) 2025 AgentLand Contributors.

The native \`dc-*\` personas are original Demon Code content, also MIT.

Category names, tags, and the catalog shape are Demon Code's own work.
`, 'utf8')
console.log(`wrote ${experts.length} experts across ${categories.length} categories to ${out}`)
