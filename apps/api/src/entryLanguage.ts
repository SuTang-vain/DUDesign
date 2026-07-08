import type { EntryContentLanguage } from '@dudesign/domain'

/**
 * 词条语言识别 + "语言类"判定。
 *
 * 设计目标：
 * 1. 在百科规范审查"中文优先"硬约束生效前，先把"该不该豁免"算清楚。
 * 2. 不依赖 LLM，纯字符集合启发式 + democase 信号，O(n) 单次扫描，
 *    可在 entry guidance 创建（job 生成前）同步返回。
 * 3. 当用户输入"Machine Learning / 日本語 / 蒙娜丽莎"等专有名词时，
 *    不应当作"语言类"——这些是词条名，spec review 会单独保留原文。
 *    "语言类"专指"该词条的话题本身就是语言/翻译/方言/语言学"。
 *
 * 字符区块参考：
 *   - Han (CJK 统一汉字):    \u4e00-\u9fff + \u3400-\u4dbf (扩展 A)
 *   - Hiragana:              \u3040-\u309f
 *   - Katakana:              \u30a0-\u30ff
 *   - Hangul:                \uac00-\ud7af + \u1100-\u11ff (Jamo)
 *   - Latin (基本拉丁):       \u0041-\u007a
 *   - Latin-1 Supplement:    \u00c0-\u00ff (含法语/德语等重音字母)
 *   - Cyrillic:              \u0400-\u04ff
 *   - Arabic:                \u0600-\u06ff
 *   - Greek:                 \u0370-\u03ff
 */

export type EntryLanguageDetection = {
  entryContentLanguage: EntryContentLanguage
  isLanguageCategory: boolean
  /** 字符区块分布（用于 admin 面板和 audit 透出） */
  scriptBreakdown: {
    han: number
    hiraganaKatakana: number
    hangul: number
    latin: number
    cyrillic: number
    arabic: number
    greek: number
    other: number
  }
  /** 触发的"语言类"判定信号（可叠加），便于解释为何豁免 */
  languageSignals: string[]
}

const HAN_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/
const HIRA_KATA_RE = /[\u3040-\u309f\u30a0-\u30ff]/
const HANGUL_RE = /[\uac00-\ud7af\u1100-\u11ff]/
const LATIN_RE = /[A-Za-z\u00c0-\u00ff]/
const CYRILLIC_RE = /[\u0400-\u04ff]/
const ARABIC_RE = /[\u0600-\u06ff]/
const GREEK_RE = /[\u0370-\u03ff]/

/**
 * "语言类"词条的话题信号。命中即视为该词条本身就是语言/翻译/方言研究，
 * 应当豁免"中文优先"硬约束，允许外语正文。
 *
 * 关键词同时支持中文（简体/繁体常见字）与英文（language/linguistics
 * 等典型学术标签）。
 */
const LANGUAGE_CATEGORY_SIGNALS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /(语言|方言|口语|书面语|语法|词汇|音标|音节|语系|语族|语种|语料|词源|词法|句法|语义|语音|发音|外来语|古汉语|现代汉语|文言|白话)/u, label: 'zh_language_topic' },
  { pattern: /(翻译|译本|译者|译文|意译|直译|音译|转写)/u, label: 'zh_translation_topic' },
  { pattern: /(外语|英语|日语|韩语|法语|德语|西班牙语|俄语|阿拉伯语|葡萄牙语|意大利语|拉丁语|希腊语)/u, label: 'zh_specific_language' },
  { pattern: /\b(language|dialect|linguistics|grammar|vocabulary|phonology|morphology|syntax|semantics|etymology|translation|interpreter|translator|phoneme|alphabet|script|writing system|unicode)\b/i, label: 'en_language_topic' },
  { pattern: /\b(英文|法文|日文|韩文|德文|俄文|西班牙文|阿拉伯文|葡萄牙文|意大利文|拉丁文|希腊文|古英文|现代英文|古法语|古典日语)\b/u, label: 'zh_translated_language_name' },
]

/**
 * 推断词条正文预期语种 + 是否为语言类。
 *
 * @param entryTitle  词条名（用户输入的 title 字段）
 * @param entryContext 词条正文/资料（用户输入的 context 字段，可为空）
 */
export function detectEntryLanguage(entryTitle: string, entryContext: string | null): EntryLanguageDetection {
  const text = `${entryTitle ?? ''}\n${entryContext ?? ''}`.trim()
  const breakdown = scanScripts(text)
  const total = totalLetters(breakdown)
  const entryContentLanguage = classifyLanguage(breakdown, total)
  const languageSignals: string[] = []
  let isLanguageCategory = false

  // Signal A: 词条名/正文直接命中语言学话题关键词
  for (const signal of LANGUAGE_CATEGORY_SIGNALS) {
    if (signal.pattern.test(text)) {
      languageSignals.push(signal.label)
    }
  }

  // Signal B: 词条正文（非标题）由单一非中文脚本主导且**正文**直接出现
  // "语言/翻译/外语"相关语义。仅命中字符脚本本身不应当 language-category
  // （避免 "Apple" / "Toyota" 等纯外语公司名误判）；必须有语义支撑。
  if (total > 0 && !hasHan(breakdown) && (entryContext?.length ?? 0) >= 8) {
    const latinShare = (breakdown.latin + breakdown.cyrillic + breakdown.greek + breakdown.arabic) / total
    if (latinShare > 0.7) {
      const semanticsHit = /\b(language|dialect|grammar|vocabulary|alphabet|script|translation|linguistics)\b/i.test(entryContext ?? '')
        || /外语|语言学|翻译|译本/.test(entryContext ?? '')
      if (semanticsHit) {
        languageSignals.push('foreign_script_dominant_with_semantics')
      }
    }
  }

  isLanguageCategory = languageSignals.length > 0

  return {
    entryContentLanguage,
    isLanguageCategory,
    scriptBreakdown: breakdown,
    languageSignals,
  }
}

function scanScripts(text: string): EntryLanguageDetection['scriptBreakdown'] {
  const counts = {
    han: 0,
    hiraganaKatakana: 0,
    hangul: 0,
    latin: 0,
    cyrillic: 0,
    arabic: 0,
    greek: 0,
    other: 0,
  }
  if (!text) return counts
  for (const ch of text) {
    if (HAN_RE.test(ch)) counts.han += 1
    else if (HIRA_KATA_RE.test(ch)) counts.hiraganaKatakana += 1
    else if (HANGUL_RE.test(ch)) counts.hangul += 1
    else if (LATIN_RE.test(ch)) counts.latin += 1
    else if (CYRILLIC_RE.test(ch)) counts.cyrillic += 1
    else if (ARABIC_RE.test(ch)) counts.arabic += 1
    else if (GREEK_RE.test(ch)) counts.greek += 1
    // 标点/数字/空白/控制字符不计入"other"
    else if (/\p{L}/u.test(ch)) counts.other += 1
  }
  return counts
}

function totalLetters(b: EntryLanguageDetection['scriptBreakdown']): number {
  return b.han + b.hiraganaKatakana + b.hangul + b.latin + b.cyrillic + b.arabic + b.greek + b.other
}

function hasHan(b: EntryLanguageDetection['scriptBreakdown']): boolean {
  return b.han > 0
}

function classifyLanguage(b: EntryLanguageDetection['scriptBreakdown'], total: number): EntryContentLanguage {
  if (total === 0) return 'zh'
  // 单一脚本主导判定
  if (b.hiraganaKatakana / total > 0.3) return 'ja'
  if (b.hangul / total > 0.3) return 'ko'
  if (b.han / total >= 0.8) return 'zh'
  if (b.latin / total >= 0.8) return 'en'
  if (b.cyrillic / total >= 0.5) return 'other'
  if (b.arabic / total >= 0.5) return 'other'
  if (b.greek / total >= 0.5) return 'other'
  // Han 主导但夹拉丁（>5% 且 <80%），或 Han+假名混排，归为混合
  if (b.han / total >= 0.5 && (b.latin > 0 || b.hiraganaKatakana > 0)) return 'mixed'
  return 'mixed'
}
