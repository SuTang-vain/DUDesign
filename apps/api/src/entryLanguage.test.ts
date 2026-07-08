import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { detectEntryLanguage } from './entryLanguage.js'

/**
 * 词条语言识别测试。
 *
 * 覆盖三类关键判定：
 * 1. 字符区块扫描 + 语种分类（zh / en / mixed / other）。
 * 2. "语言类"词条识别（语言学/翻译/外语词条名）。
 * 3. 普通中文百科词条不应误判为语言类。
 */

describe('detectEntryLanguage', () => {
  it('classifies a Chinese encyclopedia entry as zh and not language-category', () => {
    const result = detectEntryLanguage('李白', '唐代著名诗人，被誉为诗仙。')
    assert.equal(result.entryContentLanguage, 'zh')
    assert.equal(result.isLanguageCategory, false)
    assert.equal(result.scriptBreakdown.han > 0, true)
    assert.equal(result.languageSignals.length, 0)
  })

  it('classifies a pure Latin phrase as en', () => {
    const result = detectEntryLanguage('Machine Learning', 'A subfield of artificial intelligence.')
    assert.equal(result.entryContentLanguage, 'en')
    assert.equal(result.isLanguageCategory, false)
  })

  it('classifies a Japanese phrase by Hiragana/Katakana share', () => {
    const result = detectEntryLanguage('日本語', '日本語の表記体系について説明する。')
    assert.equal(result.entryContentLanguage, 'ja')
  })

  it('classifies Han-dominant text with embedded Latin as mixed', () => {
    const result = detectEntryLanguage('苹果公司', '苹果公司（Apple Inc.）是一家美国科技公司。')
    assert.equal(result.entryContentLanguage, 'mixed')
  })

  it('marks linguistics topics as language-category', () => {
    const result = detectEntryLanguage('现代汉语语法', '研究汉语的句法结构和词法规则。')
    assert.equal(result.isLanguageCategory, true)
    assert.ok(result.languageSignals.includes('zh_language_topic'))
  })

  it('marks translation topics as language-category', () => {
    const result = detectEntryLanguage('圣经中文译本', '研究《圣经》各中文译本的历史与差异。')
    assert.equal(result.isLanguageCategory, true)
    assert.ok(result.languageSignals.includes('zh_translation_topic'))
  })

  it('marks a specific foreign-language entry as language-category', () => {
    const result = detectEntryLanguage('英语', '英语属于印欧语系日耳曼语族。')
    assert.equal(result.isLanguageCategory, true)
    assert.ok(
      result.languageSignals.includes('zh_specific_language') ||
        result.languageSignals.includes('zh_translated_language_name'),
    )
  })

  it('marks a foreign-script-dominant entry as language-category with semantics', () => {
    // 词条全拉丁、且正文明确说"constructed auxiliary language"——确实是语言类
    const result = detectEntryLanguage('Esperanto', 'Esperanto is a constructed auxiliary language created in the late 19th century.')
    assert.equal(result.isLanguageCategory, true)
    assert.ok(result.languageSignals.includes('foreign_script_dominant_with_semantics'))
  })

  it('does not mis-mark a proper-noun foreign entry as language-category', () => {
    // "Machine Learning" 是技术专有名词，不是语言类词条。
    // detectEntryLanguage 不应仅凭"全拉丁字符"判定 language-category。
    const result = detectEntryLanguage('Machine Learning', 'A subfield of artificial intelligence that enables systems to learn from data.')
    assert.equal(result.isLanguageCategory, false)
  })

  it('keeps empty input as zh fallback without crashing', () => {
    const result = detectEntryLanguage('', null)
    assert.equal(result.entryContentLanguage, 'zh')
    assert.equal(result.isLanguageCategory, false)
    assert.equal(result.scriptBreakdown.han, 0)
  })

  it('exposes script breakdown for admin / audit transparency', () => {
    const result = detectEntryLanguage('日本語 Japanese', '日本語の表記体系。')
    assert.equal(result.scriptBreakdown.han > 0, true)
    assert.equal(result.scriptBreakdown.hiraganaKatakana > 0, true)
    assert.equal(result.scriptBreakdown.latin > 0, true)
  })
})
