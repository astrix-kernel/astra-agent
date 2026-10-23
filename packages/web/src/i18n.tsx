import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type Language = 'en' | 'id' | 'zh' | 'ja';

const translations: Record<Language, Record<string, string>> = {
  en: {},
  id: {
    "New chat": "Percakapan Baru", "Search conversations": "Cari percakapan",
    "Projects": "Proyek", "Artifacts": "Artefak", "Code": "Kode",
    "Custom providers": "Provider Kustom", "Customization": "Kustomisasi",
    "Recent conversations": "Percakapan Terbaru", "New conversation": "Percakapan baru",
    "How can I help you today?": "Ada yang bisa saya bantu hari ini?",
    "Write": "Tulis", "Learn": "Pelajari", "Analyze": "Analisis", "Brainstorm": "Ide",
    "Message Astra or type /goal ...": "Pesan Astra atau ketik /goal ...",
    "Astra can make mistakes. Check important code and decisions.": "Astra bisa salah. Cek kode dan keputusan penting.",
    "Working": "Bekerja", "Ready": "Siap", "Workspace": "Ruang Kerja",
    "+ Add workspace": "+ Tambah workspace", "Browse server folders": "Jelajahi folder server",
    "Importing…": "Mengimpor...", "Up": "Kembali", "Use this folder": "Gunakan folder ini",
    "ASTRA CONTROL CENTER": "PUSAT KONTROL ASTRA", "Reset defaults": "Atur ulang default",
    "Tune how Astra reasons about code, research, and system-level problems.": "Sesuaikan cara Astra menalar tentang kode, riset, dan masalah sistem.",
    "Reasoning depth": "Kedalaman penalaran", "Balanced · faster": "Seimbang · lebih cepat",
    "Deep · recommended": "Mendalam · direkomendasikan", "Systems · maximum detail": "Sistem · detail maksimal",
    "Coding intelligence": "Kecerdasan coding", "Inspect relevant files automatically": "Periksa file relevan secara otomatis",
    "Verify changes with tests and diagnostics": "Verifikasi perubahan dengan tes dan diagnostik",
    "Explain decisions and trade-offs": "Jelaskan keputusan dan trade-off", "Allow workspace writes": "Izinkan penulisan workspace",
    "Code tracing": "Pelacakan kode", "Test recovery": "Pemulihan tes", "Systems reasoning": "Penalaran sistem", "Security checks": "Pemeriksaan keamanan",
    "Provider name": "Nama Provider", "Endpoint (https://api.example.com/v1)": "Endpoint (https://api.example.com/v1)",
    "API key": "Kunci API", "ID (auto from name if empty)": "ID (otomatis dari nama jika kosong)",
    "Cancel": "Batal", "Connect provider": "Hubungkan provider", "Add provider": "Tambah provider",
    "Select a model": "Pilih model", "Search models by name or id": "Cari model berdasarkan nama atau id",
    "Loading models…": "Memuat model...", "No models match": "Tidak ada model yang cocok",
    "Load more": "Muat lebih banyak", "Manage custom providers": "Kelola provider kustom",
    "Built-in provider": "Provider bawaan", "Active": "Aktif", "Use": "Gunakan", "Remove": "Hapus",
    "Aemeath": "Aemeath", "Talk to Aemeath": "Bicara dengan Aemeath",
    "Hi~ I am here if you need anything.": "Hai~ aku di sini kalau kamu butuh apa pun.",
    "I am listening...": "Aku dengerin kamu...", "Hmm, let me think for a moment...": "Hmm, aku pikirkan sebentar...",
    "I am working on it~": "Sebentar, aku kerjakan ini dulu!", "Success! You are great!": "Yatta! Berhasil~ Kamu hebat!",
    "Hmm, there is an error... let me check again.": "Hmm, ada yang error... aku cek lagi ya.",
    "Okay, I will stop here.": "Oke, aku berhenti di sini.", "Aemeath is ready to help": "Aemeath siap membantu",
    "Things to remember": "Perlu kamu inget", "Done": "Sudah beres",
    "Summary": "Ringkas", "Check bug": "Cek bug", "Next": "Lanjut",
    "Ngebrol": "Ngebrol", "Project": "Proyek", "Talk to Aemeath...": "Bicara dengan Aemeath...",
    "Send": "Kirim", "No conversations yet": "Belum ada percakapan",
    "Close": "Tutup", "Extend Astra with focused skills, connectors, and plugins for deeper engineering work.": "Perluas Astra dengan skill, konektor, dan plugin untuk pekerjaan engineering yang lebih dalam.",
    "Skills": "Skill", "Connectors": "Konektor", "Plugins": "Plugin", "FEATURED SKILL": "SKILL UNGGULAN",
    "Systems Engineering Kit": "Kit Rekayasa Sistem",
    "Trace problems from application code through runtime, kernel, and hardware layers.": "Lacak masalah dari kode aplikasi melalui runtime, kernel, dan lapisan hardware.",
    "Explore skill": "Jelajahi skill", "My Items": "Item Saya", "Explore": "Jelajahi",
    "Search skills": "Cari skill", "All": "Semua", "Recommended": "Direkomendasikan", "Add": "Tambah",
    "coding": "coding", "debugging": "debugging",
    "Implement focused changes, trace dependencies, preserve conventions, and verify results.": "Implementasikan perubahan terfokus, lacak dependensi, pertahankan konvensi, dan verifikasi hasil.",
    "Diagnose failures with reproducible hypotheses, targeted experiments, and regression tests.": "Diagnosis kegagalan dengan hipotesis yang dapat direproduksi, eksperimen tertarget, dan tes regresi.",
    "Built-in": "Bawaan", "Featured skill": "Skill Unggulan", "Search": "Cari", "No": "Tidak ada", "match this view.": "yang cocok dengan tampilan ini.",
    "Name": "Nama", "Try": "Coba", "Added": "Ditambahkan", "Configure": "Konfigurasi", "Retry": "Coba lagi",
    "Import skill folder": "Impor folder skill", "Create custom skill": "Buat skill kustom", "Import plugin": "Impor plugin",
    "Loading catalog…": "Memuat katalog...",
    "Self-Heal": "Perbaikan Mandiri", "Fix internal compilation errors automatically.": "Perbaiki error kompilasi internal secara otomatis.",
    "Chat": "Obrolan", "Research": "Riset", "General conversation and assistance.": "Percakapan umum dan bantuan.",
    "Inspect and modify workspace code.": "Periksa dan modifikasi kode workspace.", "Analyze context and compare options.": "Analisis konteks dan bandingkan opsi."
  },
  zh: {
    "New chat": "新对话", "Search conversations": "搜索对话", "Projects": "项目", "Artifacts": "产物", "Code": "代码",
    "Custom providers": "自定义提供商", "Customization": "自定义", "Recent conversations": "最近的对话",
    "New conversation": "新对话", "How can I help you today?": "今天我能帮你什么？", "Write": "写", "Learn": "学习",
    "Analyze": "分析", "Brainstorm": "头脑风暴", "Message Astra or type /goal ...": "给 Astra 发消息或输入 /goal ...",
    "Astra can make mistakes. Check important code and decisions.": "Astra 可能会出错。请检查重要代码和决策。",
    "Working": "工作中", "Ready": "就绪", "Workspace": "工作区", "+ Add workspace": "+ 添加工作区",
    "Browse server folders": "浏览服务器文件夹", "Importing…": "正在导入...", "Up": "上一级", "Use this folder": "使用此文件夹",
    "ASTRA CONTROL CENTER": "ASTRA 控制中心", "Reset defaults": "重置默认值",
    "Tune how Astra reasons about code, research, and system-level problems.": "调整 Astra 对代码、研究和系统级问题的推理方式。",
    "Reasoning depth": "推理深度", "Balanced · faster": "平衡 · 更快", "Deep · recommended": "深度 · 推荐",
    "Systems · maximum detail": "系统 · 最大细节", "Coding intelligence": "编码智能", "Inspect relevant files automatically": "自动检查相关文件",
    "Verify changes with tests and diagnostics": "通过测试和诊断验证更改", "Explain decisions and trade-offs": "解释决策和权衡",
    "Allow workspace writes": "允许工作区写入", "Code tracing": "代码追踪", "Test recovery": "测试恢复",
    "Systems reasoning": "系统推理", "Security checks": "安全检查",
    "Provider name": "提供商名称", "Endpoint (https://api.example.com/v1)": "端点 (https://api.example.com/v1)",
    "API key": "API 密钥", "ID (auto from name if empty)": "ID (留空则自动生成)", "Cancel": "取消",
    "Connect provider": "连接提供商", "Add provider": "添加提供商", "Select a model": "选择模型",
    "Search models by name or id": "按名称或 ID 搜索模型", "Loading models…": "正在加载模型...",
    "No models match": "没有匹配的模型", "Load more": "加载更多", "Manage custom providers": "管理自定义提供商",
    "Built-in provider": "内置提供商", "Active": "活跃", "Use": "使用", "Remove": "移除",
    "Hi~ I am here if you need anything.": "你好~如果你需要什么，我就在这里。", "I am listening...": "我在听...",
    "Hmm, let me think for a moment...": "嗯，让我想一下...", "I am working on it~": "稍等，我正在处理！",
    "Success! You are great!": "太棒了！成功了~", "Hmm, there is an error... let me check again.": "嗯，出现了一些错误...我再检查一下。",
    "Okay, I will stop here.": "好的，我停在这里。", "Aemeath is ready to help": "Aemeath 准备就绪",
    "Things to remember": "需要记住的事情", "Done": "已完成",
    "Summary": "总结", "Check bug": "检查错误", "Next": "下一步",
    "Ngebrol": "闲聊", "Project": "项目", "Talk to Aemeath...": "与 Aemeath 交谈...",
    "Send": "发送", "No conversations yet": "还没有对话",
    "Close": "关闭", "Extend Astra with focused skills, connectors, and plugins for deeper engineering work.": "通过专注的技能、连接器和插件扩展 Astra，以进行更深入的工程工作。",
    "Skills": "技能", "Connectors": "连接器", "Plugins": "插件", "FEATURED SKILL": "精选技能",
    "Systems Engineering Kit": "系统工程套件",
    "Trace problems from application code through runtime, kernel, and hardware layers.": "追踪从应用程序代码到运行时、内核和硬件层的问题。",
    "Explore skill": "探索技能", "My Items": "我的项目", "Explore": "探索",
    "Search skills": "搜索技能", "All": "全部", "Recommended": "推荐", "Add": "添加",
    "coding": "编码", "debugging": "调试",
    "Implement focused changes, trace dependencies, preserve conventions, and verify results.": "实施重点更改，追踪依赖关系，保留约定并验证结果。",
    "Diagnose failures with reproducible hypotheses, targeted experiments, and regression tests.": "通过可重现的假设、有针对性的实验和回归测试来诊断故障。",
    "Built-in": "内置", "Featured skill": "精选技能", "Search": "搜索", "No": "没有", "match this view.": "匹配此视图。",
    "Name": "名称", "Try": "尝试", "Added": "已添加", "Configure": "配置", "Retry": "重试",
    "Import skill folder": "导入技能文件夹", "Create custom skill": "创建自定义技能", "Import plugin": "导入插件",
    "Loading catalog…": "正在加载目录...",
    "Self-Heal": "自我修复", "Fix internal compilation errors automatically.": "自动修复内部编译错误。",
    "Chat": "聊天", "Research": "研究", "General conversation and assistance.": "一般对话和协助。",
    "Inspect and modify workspace code.": "检查和修改工作区代码。", "Analyze context and compare options.": "分析上下文并比较选项。"
  },
  ja: {
    "New chat": "新しいチャット", "Search conversations": "会話を検索", "Projects": "プロジェクト", "Artifacts": "アーティファクト",
    "Code": "コード", "Custom providers": "カスタムプロバイダー", "Customization": "カスタマイズ",
    "Recent conversations": "最近の会話", "New conversation": "新しい会話", "How can I help you today?": "今日はどうお手伝いできますか？",
    "Write": "書く", "Learn": "学ぶ", "Analyze": "分析", "Brainstorm": "ブレインストーム",
    "Message Astra or type /goal ...": "Astra にメッセージまたは /goal を入力...",
    "Astra can make mistakes. Check important code and decisions.": "Astra は間違える可能性があります。重要なコードと決定を確認してください。",
    "Working": "作業中", "Ready": "準備完了", "Workspace": "ワークスペース", "+ Add workspace": "+ ワークスペースを追加",
    "Browse server folders": "サーバーフォルダを参照", "Importing…": "インポート中...", "Up": "上へ", "Use this folder": "このフォルダを使用",
    "ASTRA CONTROL CENTER": "ASTRA コントロールセンター", "Reset defaults": "デフォルトに戻す",
    "Tune how Astra reasons about code, research, and system-level problems.": "コード、研究、システムレベルの問題に対する Astra の推論を調整します。",
    "Reasoning depth": "推論の深さ", "Balanced · faster": "バランス · 高速", "Deep · recommended": "ディープ · 推奨",
    "Systems · maximum detail": "システム · 最大の詳細", "Coding intelligence": "コーディング知能",
    "Inspect relevant files automatically": "関連ファイルを自動検査", "Verify changes with tests and diagnostics": "テストと診断で変更を検証",
    "Explain decisions and trade-offs": "決定とトレードオフを説明", "Allow workspace writes": "ワークスペースへの書き込みを許可",
    "Code tracing": "コードトレース", "Test recovery": "テスト回復", "Systems reasoning": "システム推論", "Security checks": "セキュリティチェック",
    "Provider name": "プロバイダー名", "Endpoint (https://api.example.com/v1)": "エンドポイント (https://api.example.com/v1)",
    "API key": "APIキー", "ID (auto from name if empty)": "ID (空の場合は名前から自動生成)", "Cancel": "キャンセル",
    "Connect provider": "プロバイダーを接続", "Add provider": "プロバイダーを追加", "Select a model": "モデルを選択",
    "Search models by name or id": "名前またはIDでモデルを検索", "Loading models…": "モデルを読み込み中...",
    "No models match": "一致するモデルがありません", "Load more": "さらに読み込む", "Manage custom providers": "カスタムプロバイダーの管理",
    "Built-in provider": "組み込みプロバイダー", "Active": "アクティブ", "Use": "使用", "Remove": "削除",
    "Hi~ I am here if you need anything.": "こんにちは~何かあればここにいますよ。", "I am listening...": "聞いています...",
    "Hmm, let me think for a moment...": "うーん、少し考えさせて...", "I am working on it~": "ちょっと待って、今やってるよ！",
    "Success! You are great!": "やった！成功~すごいね！", "Hmm, there is an error... let me check again.": "うーん、エラーがあります...もう一度確認します。",
    "Okay, I will stop here.": "わかった、ここで止めます。", "Aemeath is ready to help": "Aemeath スタンバイ中",
    "Things to remember": "覚えておくこと", "Done": "完了",
    "Summary": "まとめ", "Check bug": "バグチェック", "Next": "次へ",
    "Ngebrol": "雑談", "Project": "プロジェクト", "Talk to Aemeath...": "Aemeathと話す...",
    "Send": "送信", "No conversations yet": "まだ会話がありません",
    "Close": "閉じる", "Extend Astra with focused skills, connectors, and plugins for deeper engineering work.": "集中スキル、コネクター、プラグインでAstraを拡張し、より深いエンジニアリング作業を行います。",
    "Skills": "スキル", "Connectors": "コネクター", "Plugins": "プラグイン", "FEATURED SKILL": "注目のスキル",
    "Systems Engineering Kit": "システムエンジニアリングキット",
    "Trace problems from application code through runtime, kernel, and hardware layers.": "アプリケーションコードからランタイム、カーネル、ハードウェア層までの問題を追跡します。",
    "Explore skill": "スキルを探索", "My Items": "マイアイテム", "Explore": "探索",
    "Search skills": "スキルを検索", "All": "すべて", "Recommended": "おすすめ", "Add": "追加",
    "coding": "コーディング", "debugging": "デバッグ",
    "Implement focused changes, trace dependencies, preserve conventions, and verify results.": "集中的な変更を実装し、依存関係を追跡し、規約を維持して結果を検証します。",
    "Diagnose failures with reproducible hypotheses, targeted experiments, and regression tests.": "再現可能な仮説、的を絞った実験、回帰テストで障害を診断します。",
    "Built-in": "組み込み", "Featured skill": "注目のスキル", "Search": "検索", "No": "該当なし", "match this view.": "このビューに一致します。",
    "Name": "名前", "Try": "試す", "Added": "追加済み", "Configure": "設定", "Retry": "再試行",
    "Import skill folder": "スキルフォルダをインポート", "Create custom skill": "カスタムスキルを作成", "Import plugin": "プラグインをインポート",
    "Loading catalog…": "カタログを読み込み中...",
    "Self-Heal": "自己修復", "Fix internal compilation errors automatically.": "内部のコンパイルエラーを自動的に修正します。",
    "Chat": "チャット", "Research": "リサーチ", "General conversation and assistance.": "一般的な会話とアシスタンス。",
    "Inspect and modify workspace code.": "ワークスペースのコードを検査および変更します。", "Analyze context and compare options.": "コンテキストを分析し、オプションを比較します。"
  }
};

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (text: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    return (localStorage.getItem('app_lang') as Language) || 'en';
  });

  const setLang = (l: Language) => {
    setLangState(l);
    localStorage.setItem('app_lang', l);
  };

  const t = useCallback((text: string) => {
    if (!text) return '';
    if (lang === 'en') return text;
    const dict = translations[lang];
    if (dict[text]) return dict[text];
    return text;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
