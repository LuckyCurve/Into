use rusqlite::types::Value;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use jieba_rs::Jieba;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
struct Entry {
    id: i64,
    content: String,
    score: i64,
    created_at: i64,
    updated_at: Option<i64>,
}

#[derive(Serialize)]
struct ScoreCount {
    score: i64,
    count: i64,
}

#[derive(Serialize)]
struct Keyword {
    term: String,
    count: i64,
}

#[derive(Serialize)]
struct RangeSummary {
    count: i64,
    avg_score: f64,
    distribution: Vec<ScoreCount>,
}

#[derive(Serialize)]
struct ReviewResult {
    entries: Vec<Entry>,
    summary: RangeSummary,
    keywords: Vec<Keyword>,
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ---------- 关键词提取（jieba 分词 + 停用词 + 跨条目计数）----------
const STOP_CHARS: &[&str] = &[
    "的", "了", "是", "我", "你", "他", "她", "它", "在", "和", "与", "也", "都", "就", "不", "人", "有", "这", "那", "个",
    "们", "会", "能", "要", "上", "下", "里", "中", "到", "去", "来", "说", "看", "想", "很", "太", "又", "还", "但", "而",
    "把", "被", "让", "给", "从", "向", "对", "为", "以", "因", "所", "之", "其", "此", "些", "吗", "呢", "吧", "啊", "呀", "哦",
    "嘛", "没", "着", "过", "得", "地", "等", "让", "今", "明", "昨", "早", "晚", "午", "周", "时", "候", "刚", "才", "最",
    "近", "前", "后", "每", "听", "吃", "买", "玩", "喝", "读", "写", "做", "走", "跑", "聊", "学", "卖", "家", "本", "部",
    "杯", "次", "场", "件", "位", "条", "种", "类", "双", "只", "块", "点",
];

const PHRASE_STOP: &[&str] = &[
    "我们", "你们", "他们", "她们", "它们", "自己", "什么", "怎么", "因为", "所以", "一些", "这个", "那个", "一个",
    "没有", "这么", "那么", "已经", "可以", "应该", "现在", "时候", "知道", "一直", "不是", "就是", "还是", "但是",
    "然后", "这样", "那样", "今天", "明天", "昨天", "前天", "上午", "下午", "晚上", "早上", "中午", "周末", "上周",
    "这周", "下周", "本月", "今年", "刚才", "最近", "平时", "有时", "偶尔", "凌晨", "清晨", "傍晚", "半夜", "每天",
    "每年", "每月", "那时", "这时", "感觉", "觉得", "好像", "似乎", "显得", "看来", "不错", "好看", "好玩", "喜欢",
    "开心", "舒服", "高兴", "难受", "糟糕", "一般", "还好", "愿意", "希望", "想要",
];

const EN_STOP: &[&str] = &[
    "the", "and", "for", "are", "but", "not", "had", "has", "was", "with", "that", "this", "from", "your", "what",
    "when", "how", "who", "can", "will", "just", "like", "really", "very", "about", "into", "have", "been", "they",
    "them", "you", "out", "get", "got", "her", "his", "our",
];

fn is_cjk(c: char) -> bool {
    let code = c as u32;
    (0x3400..=0x9fff).contains(&code)
}

/// 判断一个 jieba 切出的 token 是否保留为候选关键词。
fn keep_token(tok: &str) -> Option<String> {
    let t = tok.trim();
    if t.is_empty() {
        return None;
    }
    // 含任何非字母/数字（中文标点、书名号、符号、空白）一律丢弃
    if !t.chars().all(|c| c.is_alphanumeric()) {
        return None;
    }
    let has_cjk = t.chars().any(is_cjk);
    if has_cjk {
        if t.chars().count() < 2 {
            return None; // 单字中文通常是噪声
        }
        if STOP_CHARS.contains(&t) || PHRASE_STOP.contains(&t) {
            return None;
        }
        Some(t.to_string())
    } else {
        let lower = t.to_lowercase();
        // 纯数字不要；至少含一个字母
        if !lower.chars().any(|c| c.is_ascii_alphabetic()) {
            return None;
        }
        if lower.chars().count() < 2 {
            return None;
        }
        if EN_STOP.contains(&lower.as_str()) {
            return None;
        }
        Some(lower)
    }
}

static JIEBA: OnceLock<Jieba> = OnceLock::new();
fn jieba() -> &'static Jieba {
    JIEBA.get_or_init(Jieba::new)
}

/// 从条目里提取「反复出现的词」：jieba 分词 → 整词过滤停用词 →
/// 按不同条目计数（一条里出现多次只算一次）→ 应用屏蔽词表 → 取 top。
fn extract_keywords(
    entries: &[Entry],
    blocked: &[String],
    min_count: i64,
    limit: usize,
) -> Vec<Keyword> {
    let blocked_set: HashSet<&str> = blocked.iter().map(|s| s.as_str()).collect();
    let mut seen: HashMap<String, HashSet<i64>> = HashMap::new();
    let j = jieba();
    for e in entries {
        let tokens = j.cut(&e.content, false);
        let mut per_entry: HashSet<String> = HashSet::new();
        for tok in tokens {
            if let Some(term) = keep_token(&tok) {
                if blocked_set.contains(term.as_str()) {
                    continue;
                }
                if per_entry.insert(term.clone()) {
                    seen.entry(term).or_default().insert(e.id);
                }
            }
        }
    }
    let mut out: Vec<Keyword> = seen
        .into_iter()
        .map(|(term, ids)| Keyword {
            term,
            count: ids.len() as i64,
        })
        .filter(|k| k.count >= min_count)
        .collect();
    out.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.term.cmp(&b.term)));
    out.truncate(limit);
    out
}

fn create_schema(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS entries (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            content    TEXT    NOT NULL,
            score      INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
            created_at INTEGER NOT NULL,
            updated_at INTEGER
        )",
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS blocked_terms (term TEXT PRIMARY KEY)",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn init_db(app: &tauri::App) -> Result<Connection, Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    let conn = Connection::open(dir.join("into.db"))?;
    create_schema(&conn)?;
    Ok(conn)
}

fn insert_entry(
    conn: &Connection,
    content: &str,
    score: i64,
    created_at: i64,
) -> Result<i64, String> {
    let content = content.trim().to_string();
    if content.is_empty() {
        return Err("写点什么再留下吧".into());
    }
    if !(1..=5).contains(&score) {
        return Err("温度要在 1 到 5 之间".into());
    }
    conn.execute(
        "INSERT INTO entries (content, score, created_at, updated_at) VALUES (?1, ?2, ?3, NULL)",
        params![content, score, created_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn update_entry_db(
    conn: &Connection,
    id: i64,
    content: &str,
    score: i64,
    updated_at: i64,
) -> Result<(), String> {
    let content = content.trim().to_string();
    if content.is_empty() {
        return Err("写点什么再留下吧".into());
    }
    if !(1..=5).contains(&score) {
        return Err("温度要在 1 到 5 之间".into());
    }
    conn.execute(
        "UPDATE entries SET content = ?1, score = ?2, updated_at = ?3 WHERE id = ?4",
        params![content, score, updated_at, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn delete_entry_db(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM entries WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 把用户在前端 ✕ 掉的词写入屏蔽表（个人化停用词典）。
fn block_term_db(conn: &Connection, term: &str) -> Result<(), String> {
    let term = term.trim().to_string();
    if term.is_empty() {
        return Err("没有可屏蔽的词".into());
    }
    conn.execute(
        "INSERT OR IGNORE INTO blocked_terms (term) VALUES (?1)",
        params![term],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 返回当前被屏蔽的词（用于前端过滤关键词）。
fn list_blocked_db(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT term FROM blocked_terms ORDER BY term")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// 解除对一个词的屏蔽。
fn unblock_term_db(conn: &Connection, term: &str) -> Result<(), String> {
    let term = term.trim().to_string();
    if term.is_empty() {
        return Err("没有可解除屏蔽的词".into());
    }
    conn.execute(
        "DELETE FROM blocked_terms WHERE term = ?1",
        params![term],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 生成一批本地示例记录，用于预览分析效果（不含任何真实数据）。
/// 内容刻意混入反复出现的主题词（咖啡/电影/雨天/散步/独处/音乐/React）与
/// 会被过滤的套路词（今天/感觉/看了/不错），方便检验关键词云与停用词。
fn seed_test_data_db(conn: &Connection, n: i64) -> Result<i64, String> {
    let pool: [&str; 12] = [
        "今天在街角咖啡店坐了一会儿，感觉很不错",
        "看了《星际穿越》，雨天里很舒服",
        "周末想一个人独处，听听音乐",
        "傍晚去河边散步，风吹得温柔",
        "又去了那家咖啡店，还是喜欢",
        "熬夜看了书，眼睛有点累",
        "用 React 写了点东西，挺开心",
        "雨天不想出门，窝着看电影",
        "早上咖啡配一本书，刚刚好",
        "一个人散步到天黑，喜欢这种安静",
        "电影院的空调太冷，但电影好看",
        "雨天咖啡和音乐，刚好",
    ];
    let scores: [i64; 12] = [5, 4, 3, 4, 5, 1, 4, 3, 5, 4, 2, 4];
    let day = 86_400_000i64;
    let now = now_ms();
    let mut inserted = 0i64;
    for i in 0..n {
        let content = pool[(i as usize) % pool.len()];
        let score = scores[(i as usize) % scores.len()];
        // 确定性地把时间打散到最近 ~60 天，避免引入随机数依赖
        let day_off = ((i * 5 + (i * i) % 11) % 60) as i64;
        let hour = ((i * 7) % 20) as i64;
        let created = now - day_off * day - hour * 3_600_000;
        conn.execute(
            "INSERT INTO entries (content, score, created_at, updated_at) VALUES (?1, ?2, ?3, NULL)",
            params![content, score, created],
        )
        .map_err(|e| e.to_string())?;
        inserted += 1;
    }
    Ok(inserted)
}

/// 删除全部记录。刻意不碰 blocked_terms——那是用户通过 ✕ 沉淀的个人偏好。
fn clear_all_entries_db(conn: &Connection) -> Result<u64, String> {
    conn.execute("DELETE FROM entries", [])
        .map_err(|e| e.to_string())?;
    Ok(conn.changes() as u64)
}

/// Shared WHERE clause for time range + multi-keyword search (AND of tokens).
fn build_where(
    start_ms: Option<i64>,
    end_ms: Option<i64>,
    search: Option<&str>,
) -> (String, Vec<Value>) {
    let mut clauses: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();
    if let Some(s) = start_ms {
        clauses.push("created_at >= ?".to_string());
        params.push(Value::from(s));
    }
    if let Some(e) = end_ms {
        clauses.push("created_at < ?".to_string());
        params.push(Value::from(e));
    }
    if let Some(q) = search {
        for token in q.split_whitespace() {
            clauses.push("content LIKE ?".to_string());
            params.push(Value::from(format!("%{}%", token)));
        }
    }
    let where_clause = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };
    (where_clause, params)
}

fn query_entries(
    conn: &Connection,
    start_ms: Option<i64>,
    end_ms: Option<i64>,
    search: Option<&str>,
    limit: i64,
) -> Result<Vec<Entry>, String> {
    let (wc, p) = build_where(start_ms, end_ms, search);
    let sql = format!(
        "SELECT id, content, score, created_at, updated_at \
         FROM entries {} ORDER BY created_at DESC LIMIT ?",
        wc
    );
    let mut bind = p;
    bind.push(Value::from(limit));
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(bind), |row| {
            Ok(Entry {
                id: row.get(0)?,
                content: row.get(1)?,
                score: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn summarize(
    conn: &Connection,
    start_ms: Option<i64>,
    end_ms: Option<i64>,
    search: Option<&str>,
) -> Result<RangeSummary, String> {
    let (wc, p) = build_where(start_ms, end_ms, search);

    let (count, avg): (i64, Option<f64>) = {
        let sql = format!("SELECT COUNT(*), AVG(score) FROM entries {}", wc);
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        stmt.query_row(rusqlite::params_from_iter(p.clone()), |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Option<f64>>(1)?))
        })
        .map_err(|e| e.to_string())?
    };

    let sql = format!(
        "SELECT score, COUNT(*) FROM entries {} GROUP BY score ORDER BY score",
        wc
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(p.clone()), |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    for r in rows {
        let (s, c) = r.map_err(|e| e.to_string())?;
        map.insert(s, c);
    }
    let mut distribution = Vec::new();
    for s in 1..=5 {
        distribution.push(ScoreCount {
            score: s,
            count: *map.get(&s).unwrap_or(&0),
        });
    }

    Ok(RangeSummary {
        count,
        avg_score: avg.unwrap_or(0.0),
        distribution,
    })
}

fn review_db(
    conn: &Connection,
    start_ms: Option<i64>,
    end_ms: Option<i64>,
    search: Option<&str>,
) -> Result<ReviewResult, String> {
    let entries = query_entries(conn, start_ms, end_ms, search, 500)?;
    let summary = summarize(conn, start_ms, end_ms, search)?;
    let blocked = list_blocked_db(conn)?;
    let keywords = extract_keywords(&entries, &blocked, 2, 28);
    Ok(ReviewResult {
        entries,
        summary,
        keywords,
    })
}

#[tauri::command]
fn add_entry(content: String, score: i64, state: State<'_, Mutex<Connection>>) -> Result<i64, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    insert_entry(&conn, &content, score, now_ms())
}

#[tauri::command]
fn update_entry(
    id: i64,
    content: String,
    score: i64,
    state: State<'_, Mutex<Connection>>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    update_entry_db(&conn, id, &content, score, now_ms())
}

#[tauri::command]
fn delete_entry(id: i64, state: State<'_, Mutex<Connection>>) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    delete_entry_db(&conn, id)
}

#[tauri::command]
fn block_keyword(term: String, state: State<'_, Mutex<Connection>>) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    block_term_db(&conn, &term)
}

#[tauri::command]
fn unblock_keyword(term: String, state: State<'_, Mutex<Connection>>) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    unblock_term_db(&conn, &term)
}

#[tauri::command]
fn list_blocked_terms(state: State<'_, Mutex<Connection>>) -> Result<Vec<String>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    list_blocked_db(&conn)
}

#[tauri::command]
fn generate_test_data(state: State<'_, Mutex<Connection>>) -> Result<i64, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    seed_test_data_db(&conn, 40)
}

#[tauri::command]
fn clear_all_entries(state: State<'_, Mutex<Connection>>) -> Result<u64, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    clear_all_entries_db(&conn)
}

#[tauri::command]
fn review(
    start_ms: Option<i64>,
    end_ms: Option<i64>,
    search: Option<String>,
    state: State<'_, Mutex<Connection>>,
) -> Result<ReviewResult, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    review_db(&conn, start_ms, end_ms, search.as_deref())
}

/// 从 GitHub `/releases/latest` 的 JSON 响应里取出 `tag_name`。
/// 抽成纯函数以便单测，网络部分只负责把响应文本喂进来。
fn parse_latest_tag(json: &str) -> Result<String, String> {
    let v: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("解析 GitHub 响应失败：{e}"))?;
    v.get("tag_name")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "GitHub 响应缺少 tag_name".into())
}

/// 去掉版本号前导的 `v`（`v0.3.0` -> `0.3.0`），方便语义化比较。
fn normalize_version(v: &str) -> String {
    v.trim_start_matches('v').to_string()
}

/// 拼接 GitHub Release 页面地址。
/// 注意：tag 需使用仓库里的真实标签名（带前导 v，如 `v0.5.0`），
/// 不能用去掉 v 的纯版本号，否则链接会 404。
fn release_url(tag: &str) -> String {
    format!("https://github.com/LuckyCurve/Into/releases/tag/{tag}")
}

/// 比较 `latest` 是否比 `current` 更新（忽略前导 v，按语义化版本比较）。
fn is_newer(current: &str, latest: &str) -> Result<bool, String> {
    let c = semver::Version::parse(&normalize_version(current))
        .map_err(|e| format!("当前版本号非法：{e}"))?;
    let l = semver::Version::parse(&normalize_version(latest))
        .map_err(|e| format!("最新版本号非法：{e}"))?;
    Ok(l > c)
}

#[derive(Serialize)]
struct UpdateInfo {
    has_update: bool,
    current: String,
    latest: String,
    url: String,
}

/// 检查 GitHub 上是否有比当前版本更新的 Release。
/// 仅一次只读请求；失败（断网、限流、非 2xx）一律向上抛出，由前端决定静默还是提示。
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    let current = app.package_info().version.to_string();
    let api = "https://api.github.com/repos/LuckyCurve/Into/releases/latest";
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("Into")
        .build()
        .map_err(|e| format!("创建请求客户端失败：{e}"))?;
    let resp = client
        .get(api)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("无法连接 GitHub：{e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub 返回状态 {}", resp.status()));
    }
    let body = resp
        .text()
        .await
        .map_err(|e| format!("读取 GitHub 响应失败：{e}"))?;
    let tag = parse_latest_tag(&body)?;
    let latest = normalize_version(&tag);
    let has = is_newer(&current, &latest)?;
    // URL 必须用原始 tag（带 v 前缀，如 v0.5.0），否则 GitHub 会 404；
    // 版本比较 / 展示才用去掉 v 的 latest。
    let url = release_url(&tag);
    Ok(UpdateInfo {
        has_update: has,
        current: normalize_version(&current),
        latest,
        url,
    })
}

/// 用系统默认浏览器打开 Release 页面（仅允许 https，避免任意 scheme）。
#[tauri::command]
fn open_release_page(url: String, app: tauri::AppHandle) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("仅允许打开 https 链接".into());
    }
    app.opener()
        .open_url(url, None::<String>)
        .map_err(|e| format!("打开失败：{e}"))
}

/// 是否以「隐藏方式」启动：仅当进程参数包含 `--hidden` 时成立。
/// 开机自启场景下由 autostart 插件附带该参数，使窗口静默进入系统托盘。
fn should_start_hidden<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().any(|a| a.as_ref() == "--hidden")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .setup(|app| {
            let conn = init_db(app)?;
            app.manage(Mutex::new(conn));
            setup_tray(app)?;
            // 开机自启场景下带 --hidden 启动：隐藏主窗口，仅留在托盘
            if should_start_hidden(std::env::args()) {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_entry,
            update_entry,
            delete_entry,
            review,
            block_keyword,
            unblock_keyword,
            list_blocked_terms,
            generate_test_data,
            clear_all_entries,
            check_update,
            open_release_page
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 系统托盘：左键单击显示并聚焦窗口，右键菜单提供「退出」。
fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let Some(icon) = app.default_window_icon().cloned() else {
        return Ok(());
    };

    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit])?;

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("Into · 最近")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "quit" {
                app.exit(0);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(w) = tray.app_handle().get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        create_schema(&c).unwrap();
        c
    }

    fn add(c: &Connection, content: &str, score: i64, t: i64) -> i64 {
        insert_entry(c, content, score, t).unwrap()
    }

    #[test]
    fn schema_and_insert() {
        let c = mem();
        let id = add(&c, "京都的小咖啡店", 5, 1000);
        assert!(id > 0);
        let list = query_entries(&c, None, None, None, 10).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].content, "京都的小咖啡店");
        assert_eq!(list[0].score, 5);
        assert_eq!(list[0].created_at, 1000);
    }

    #[test]
    fn rejects_empty_and_out_of_range_score() {
        let c = mem();
        assert!(insert_entry(&c, "   ", 3, 1).is_err());
        assert!(insert_entry(&c, "好的", 0, 1).is_err());
        assert!(insert_entry(&c, "好的", 6, 1).is_err());
        assert!(insert_entry(&c, "好的", 3, 1).is_ok());
    }

    #[test]
    fn update_changes_fields_and_timestamp() {
        let c = mem();
        let id = add(&c, "原本", 2, 100);
        update_entry_db(&c, id, "改过了", 4, 999).unwrap();
        let list = query_entries(&c, None, None, None, 10).unwrap();
        assert_eq!(list[0].content, "改过了");
        assert_eq!(list[0].score, 4);
        assert_eq!(list[0].updated_at, Some(999));
    }

    #[test]
    fn delete_removes_entry() {
        let c = mem();
        let id = add(&c, "临时", 3, 100);
        delete_entry_db(&c, id).unwrap();
        assert_eq!(query_entries(&c, None, None, None, 10).unwrap().len(), 0);
    }

    #[test]
    fn range_filter_half_open() {
        let c = mem();
        add(&c, "旧的", 3, 1000);
        add(&c, "新的", 5, 5000);

        let r = query_entries(&c, Some(2000), Some(6000), None, 10).unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].content, "新的");

        let r2 = query_entries(&c, Some(2000), None, None, 10).unwrap();
        assert_eq!(r2.len(), 1);

        let r3 = query_entries(&c, None, Some(2000), None, 10).unwrap();
        assert_eq!(r3.len(), 1);
        assert_eq!(r3[0].content, "旧的");
    }

    #[test]
    fn search_is_and_of_tokens() {
        let c = mem();
        add(&c, "京都 咖啡店 安静", 5, 1);
        add(&c, "北海道 雪", 4, 2);
        add(&c, "咖啡店 吵闹", 2, 3);

        let one = query_entries(&c, None, None, Some("咖啡店"), 10).unwrap();
        assert_eq!(one.len(), 2);

        let both = query_entries(&c, None, None, Some("京都 咖啡店"), 10).unwrap();
        assert_eq!(both.len(), 1);
        assert_eq!(both[0].content, "京都 咖啡店 安静");
    }

    #[test]
    fn summarize_counts_and_average() {
        let c = mem();
        add(&c, "a", 4, 1000);
        add(&c, "b", 2, 2000);
        add(&c, "c", 5, 3000);
        let s = summarize(&c, None, None, None).unwrap();
        assert_eq!(s.count, 3);
        assert!((s.avg_score - 11.0 / 3.0).abs() < 1e-9);
        let dist: std::collections::HashMap<i64, i64> =
            s.distribution.iter().map(|d| (d.score, d.count)).collect();
        assert_eq!(dist[&4], 1);
        assert_eq!(dist[&2], 1);
        assert_eq!(dist[&5], 1);
        assert_eq!(dist[&1], 0);
        assert_eq!(dist[&3], 0);
    }

    #[test]
    fn summarize_empty_range() {
        let c = mem();
        let s = summarize(&c, None, None, None).unwrap();
        assert_eq!(s.count, 0);
        assert_eq!(s.avg_score, 0.0);
    }

    #[test]
    fn review_combines_list_and_summary() {
        let c = mem();
        add(&c, "x", 5, 1000);
        add(&c, "y", 3, 2000);
        let r = review_db(&c, None, None, None).unwrap();
        assert_eq!(r.entries.len(), 2);
        assert_eq!(r.summary.count, 2);
        // newest first
        assert_eq!(r.entries[0].content, "y");
    }

    #[test]
    fn generate_test_data_inserts_rows() {
        let c = mem();
        let n = seed_test_data_db(&c, 40).unwrap();
        assert_eq!(n, 40);
        let list = query_entries(&c, None, None, None, 100).unwrap();
        assert_eq!(list.len(), 40);
        // 至少包含一条带“咖啡”的示例
        assert!(list.iter().any(|e| e.content.contains("咖啡")));
        // 分数都在合法范围
        assert!(list.iter().all(|e| (1..=5).contains(&e.score)));
    }

    #[test]
    fn clear_all_entries_removes_rows_but_keeps_blocklist() {
        let c = mem();
        seed_test_data_db(&c, 10).unwrap();
        block_term_db(&c, "感觉").unwrap();
        assert_eq!(query_entries(&c, None, None, None, 100).unwrap().len(), 10);
        let removed = clear_all_entries_db(&c).unwrap();
        assert_eq!(removed, 10);
        assert_eq!(query_entries(&c, None, None, None, 100).unwrap().len(), 0);
        // 屏蔽词表保留
        assert_eq!(list_blocked_db(&c).unwrap(), vec!["感觉".to_string()]);
    }

    #[test]
    fn extract_keywords_segments_and_filters() {
        let c = mem();
        insert_entry(&c, "早上喝咖啡，刚刚好", 5, 1000).unwrap();
        insert_entry(&c, "又去那家咖啡店坐了坐", 4, 2000).unwrap();
        insert_entry(&c, "雨天窝着看电影，舒服", 3, 3000).unwrap();
        insert_entry(&c, "今天也看了电影，感觉不错", 4, 4000).unwrap();
        let entries = query_entries(&c, None, None, None, 100).unwrap();
        let kws = extract_keywords(&entries, &[], 2, 28);
        let terms: Vec<&str> = kws.iter().map(|k| k.term.as_str()).collect();
        // jieba 把“电影”作为整词切出，且在两条里出现 → 命中
        assert!(terms.contains(&"电影"));
        let movie = kws.iter().find(|k| k.term == "电影");
        assert!(movie.is_some() && movie.unwrap().count == 2);
        // 脚手架被过滤
        assert!(!terms.contains(&"今天"));
        assert!(!terms.contains(&"感觉"));
        // 不再有“配一”之类碎片
        assert!(!terms.iter().any(|t| t.contains("配一")));
        // 标点 / 书名号 绝不应成为关键词
        assert!(!terms.iter().any(|t| {
            t.contains("《") || t.contains("》") || t.contains("，") || t.contains("。")
        }));
    }

    #[test]
    fn blocked_terms_persist_and_list() {
        let c = mem();
        block_term_db(&c, "感觉").unwrap();
        block_term_db(&c, "今天").unwrap();
        assert!(block_term_db(&c, "   ").is_err()); // 空词拒绝
        let list = list_blocked_db(&c).unwrap();
        assert_eq!(list, vec!["今天".to_string(), "感觉".to_string()]); // 字典序
        block_term_db(&c, "感觉").unwrap(); // 重复插入被忽略
        assert_eq!(list_blocked_db(&c).unwrap().len(), 2);
    }

    #[test]
    fn unblock_term_removes_from_list() {
        let c = mem();
        block_term_db(&c, "感觉").unwrap();
        block_term_db(&c, "今天").unwrap();
        assert_eq!(list_blocked_db(&c).unwrap().len(), 2);
        unblock_term_db(&c, "感觉").unwrap();
        assert_eq!(list_blocked_db(&c).unwrap(), vec!["今天".to_string()]);
        unblock_term_db(&c, "  ").unwrap_err(); // 空词拒绝
        // 重复解除是幂等的，不应报错
        unblock_term_db(&c, "今天").unwrap();
        assert_eq!(list_blocked_db(&c).unwrap().len(), 0);
    }

    #[test]
    fn hidden_flag_detection() {
        assert!(!should_start_hidden(Vec::<String>::new()));
        assert!(!should_start_hidden(vec!["into.exe".to_string()]));
        assert!(should_start_hidden(vec![
            "into.exe".to_string(),
            "--hidden".to_string()
        ]));
        // 参数中间出现也应命中
        assert!(should_start_hidden(vec![
            "--hidden".to_string(),
            "--another".to_string()
        ]));
        // 仅前缀 / 大小写不同不应命中
        assert!(!should_start_hidden(vec!["--hidden-x".to_string()]));
        assert!(!should_start_hidden(vec!["--HIDDEN".to_string()]));
    }

    #[test]
    fn parse_latest_tag_reads_tag_name() {
        let json = r#"{"tag_name":"v0.4.0","name":"Into v0.4.0","html_url":"x"}"#;
        assert_eq!(parse_latest_tag(json).unwrap(), "v0.4.0");
    }

    #[test]
    fn parse_latest_tag_errors_when_missing_or_malformed() {
        // 缺少 tag_name 字段
        assert!(parse_latest_tag(r#"{"name":"x"}"#).is_err());
        // 不是合法 JSON
        assert!(parse_latest_tag("not json at all").is_err());
    }

    #[test]
    fn normalize_strips_leading_v() {
        assert_eq!(normalize_version("v0.3.0"), "0.3.0");
        assert_eq!(normalize_version("0.3.0"), "0.3.0");
    }

    #[test]
    fn is_newer_compares_semver() {
        // 有更新
        assert!(is_newer("0.3.0", "v0.4.0").unwrap());
        // 完全相同
        assert!(!is_newer("0.3.0", "0.3.0").unwrap());
        // 当前比 latest 还新（如本地开发版）
        assert!(!is_newer("0.4.0", "0.3.0").unwrap());
        // 语义化比较正确性：0.10.0 > 0.3.0（纯字符串比较会错判）
        assert!(is_newer("0.3.0", "0.10.0").unwrap());
        assert!(!is_newer("0.10.0", "0.3.0").unwrap());
    }

    #[test]
    fn is_newer_rejects_illegal_version() {
        assert!(is_newer("banana", "0.4.0").is_err());
        assert!(is_newer("0.3.0", "").is_err());
    }

    #[test]
    fn release_url_keeps_v_prefix() {
        // 必须用真实标签名（带 v），否则 GitHub 会 404
        assert_eq!(
            release_url("v0.5.0"),
            "https://github.com/LuckyCurve/Into/releases/tag/v0.5.0"
        );
        // 不带 v 的标签也能正确拼接（不擅自加 v）
        assert_eq!(
            release_url("0.5.0"),
            "https://github.com/LuckyCurve/Into/releases/tag/0.5.0"
        );
    }
}
