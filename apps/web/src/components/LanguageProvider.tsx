'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type AppLanguage = 'en' | 'zh'

type TranslationKey = string

type LanguageContextValue = {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
  t: (key: TranslationKey) => string
}

const languageStorageKey = 'dudesign.language'

const translations: Record<AppLanguage, Record<string, string>> = {
  en: {
    addContext: 'Add context',
    addAttachment: 'Add attachment',
    addConnector: 'Add connector',
    addFilesOrPhotos: 'Add files or photos',
    addPlugins: 'Add plugins...',
    aesthetic: 'Aesthetic',
    automation: 'Automation',
    settings: 'Settings',
    more: 'More',
    profile: 'Profile',
    language: 'Language',
    english: 'English',
    chinese: '中文',
    account: 'Account',
    accountDetail: 'Profile and sign-in settings',
    workspace: 'Workspace',
    workspaceDetail: 'Personal hosted workspace',
    modelPreferences: 'Model preferences',
    modelPreferencesDetail: 'Default model and generation defaults',
    help: 'Help',
    helpDetail: 'Guides and product support',
    feedback: 'Feedback',
    feedbackDetail: 'Send a product note',
    keyboardShortcuts: 'Keyboard shortcuts',
    keyboardShortcutsDetail: 'Reserved for editor shortcuts',
    signOut: 'Sign out',
    signOutDetail: 'Reserved for auth milestone',
    userProfileFor: 'User profile for',
    choose: 'Choose',
    connectingWorkspace: 'Connecting workspace...',
    connectors: 'Connectors',
    continueFromUploadedPage: 'Continue from an uploaded page.',
    createFirstDesignSession: 'Create your first design session.',
    designPrompt: 'Design prompt',
    domain: 'Domain',
    drafts: 'drafts',
    existingHtml: 'Existing HTML',
    generateFreshStandalonePage: 'Generate a fresh standalone page.',
    generateDesignVariations: 'Generate design variations',
    hostedDesignWorkspace: 'Hosted design workspace',
    designInspiration: 'Design inspiration',
    needInspiration: 'Need inspiration?',
    loop: 'Loop',
    model: 'Model',
    mcp: 'MCP',
    mvpHosted: 'MVP hosted',
    mySessions: 'My sessions',
    newHtml: 'New HTML',
    noModel: 'No model',
    olderSessionsWillAppear: 'Older sessions will appear here.',
    palette: 'Palette',
    plugins: 'Plugins',
    recent: 'Recent',
    earlier: 'Earlier',
    searchSessions: 'Search sessions',
    saved: 'saved',
    shared: 'Shared',
    skills: 'Skills',
    sourceMode: 'Source mode',
    startWithYourDesign: '+ Start with your design',
    styles: 'Styles',
    teamWorkspacesReserved: 'Team workspaces are reserved for the collaboration milestone.',
    template: 'Template',
    uploadHtml: 'Upload HTML',
    uploadHtmlToContinue: 'Upload an HTML file to continue from an existing page.',
    uploading: 'Uploading...',
    useLocalHtmlFile: 'Use a local .html file',
    variations: 'Variations',
    whatShallWeDesign: 'What shall we design today?',
    describePromptPlaceholder: 'Describe the page, product, audience, and tone...',
  },
  zh: {
    addContext: '添加上下文',
    addAttachment: '添加附件',
    addConnector: '添加连接器',
    addFilesOrPhotos: '添加文件或照片',
    addPlugins: '添加插件...',
    aesthetic: '审美',
    automation: '自动化',
    settings: '设置',
    more: '更多',
    profile: '个人资料',
    language: '语言',
    english: 'English',
    chinese: '中文',
    account: '账户',
    accountDetail: '个人资料与登录设置',
    workspace: '工作区',
    workspaceDetail: '个人云端工作区',
    modelPreferences: '模型偏好',
    modelPreferencesDetail: '默认模型与生成参数',
    help: '帮助',
    helpDetail: '使用指南与产品支持',
    feedback: '反馈',
    feedbackDetail: '发送产品建议',
    keyboardShortcuts: '快捷键',
    keyboardShortcutsDetail: '预留给编辑器快捷键',
    signOut: '退出登录',
    signOutDetail: '预留给登录里程碑',
    userProfileFor: '用户资料',
    choose: '选择',
    connectingWorkspace: '正在连接工作区...',
    connectors: '连接器',
    continueFromUploadedPage: '基于已上传页面继续。',
    createFirstDesignSession: '创建你的第一个设计会话。',
    designPrompt: '设计需求',
    domain: '领域',
    drafts: '个草稿',
    existingHtml: '已有 HTML',
    generateFreshStandalonePage: '生成一个全新的独立页面。',
    generateDesignVariations: '生成设计变体',
    hostedDesignWorkspace: '云端设计工作区',
    designInspiration: '设计灵感',
    needInspiration: '需要灵感？',
    loop: '流程',
    model: '模型',
    mcp: 'MCP',
    mvpHosted: 'MVP 云端',
    mySessions: '我的会话',
    newHtml: '新建 HTML',
    noModel: '无模型',
    olderSessionsWillAppear: '更早的会话会显示在这里。',
    palette: '配色',
    plugins: '插件',
    recent: '最近',
    earlier: '更早',
    searchSessions: '搜索会话',
    saved: '已保存',
    shared: '共享',
    skills: '技能',
    sourceMode: '来源模式',
    startWithYourDesign: '+ 从你的设计开始',
    styles: '风格',
    teamWorkspacesReserved: '团队工作区预留给协作里程碑。',
    template: '模板',
    uploadHtml: '上传 HTML',
    uploadHtmlToContinue: '上传 HTML 文件后可基于已有页面继续。',
    uploading: '上传中...',
    useLocalHtmlFile: '使用本地 .html 文件',
    variations: '变体',
    whatShallWeDesign: '今天想设计什么？',
    describePromptPlaceholder: '描述页面、产品、受众与语气...',
  },
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider(props: { children: React.ReactNode }): React.JSX.Element {
  const [language, setLanguageState] = useState<AppLanguage>('en')

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem(languageStorageKey)
    if (storedLanguage === 'en' || storedLanguage === 'zh') {
      setLanguageState(storedLanguage)
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    window.localStorage.setItem(languageStorageKey, language)
  }, [language])

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage: setLanguageState,
    t: key => translations[language][key] ?? translations.en[key] ?? key,
  }), [language])

  return <LanguageContext.Provider value={value}>{props.children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider')
  }
  return context
}
