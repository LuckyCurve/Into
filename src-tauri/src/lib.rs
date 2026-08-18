use rusqlite::types::Value;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};
use tauri_plugin_autostart::MacosLauncher;

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
struct RangeSummary {
    count: i64,
    avg_score: f64,
    distribution: Vec<ScoreCount>,
}

#[derive(Serialize)]
struct ReviewResult {
    entries: Vec<Entry>,
    summary: RangeSummary,
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
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
    Ok(ReviewResult { entries, summary })
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
fn review(
    start_ms: Option<i64>,
    end_ms: Option<i64>,
    search: Option<String>,
    state: State<'_, Mutex<Connection>>,
) -> Result<ReviewResult, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    review_db(&conn, start_ms, end_ms, search.as_deref())
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
            review
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
}
