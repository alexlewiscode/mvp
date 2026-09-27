use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::game::GameKind;

const FILE_NAME: &str = "highscore.json";
const MVP_FILE_NAME: &str = "mvp_day.json";
const APP_NAME: &str = "MVP";
pub const ANONYMOUS: &str = "Anonymous";
const NAME_LIMIT: usize = 24;

#[derive(Debug, Default, Serialize, Deserialize)]
struct HighScoreData {
    #[serde(default)]
    daily_code_best: u64,
    #[serde(default)]
    player_name: String,
    #[serde(default)]
    daily_code_attempt_day: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DailyMvp {
    pub date: String,
    pub name: String,
    pub score: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct DailyMvpData {
    #[serde(default)]
    mvp: Option<DailyMvp>,
}

#[derive(Debug)]
pub struct HighScoreStore {
    path: PathBuf,
    data: HighScoreData,
    mvp_path: PathBuf,
    mvp_data: DailyMvpData,
}

impl HighScoreStore {
    pub fn discover() -> Self {
        let path = directories::ProjectDirs::from("", "", APP_NAME)
            .map(|dirs| dirs.config_dir().join(FILE_NAME))
            .unwrap_or_else(|| PathBuf::from(FILE_NAME));
        Self::load(path)
    }

    pub fn load(path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let mvp_path = path.with_file_name(MVP_FILE_NAME);
        let data = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        let mvp_data = fs::read_to_string(&mvp_path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        Self {
            path,
            data,
            mvp_path,
            mvp_data,
        }
    }

    pub fn best_score(&self, kind: GameKind) -> u64 {
        match kind {
            GameKind::DailyCode => self.data.daily_code_best,
            GameKind::RankedMatch => 0,
        }
    }

    pub fn record(&mut self, kind: GameKind, score: u64) -> bool {
        if kind != GameKind::DailyCode || score == 0 || score <= self.data.daily_code_best {
            return false;
        }
        self.data.daily_code_best = score;
        self.save();
        true
    }

    pub fn daily_code_attempted(&self, day: u64) -> bool {
        self.data.daily_code_attempt_day == Some(day)
    }

    pub fn mark_daily_code_attempt(&mut self, day: u64) -> bool {
        if self.daily_code_attempted(day) {
            return false;
        }
        self.data.daily_code_attempt_day = Some(day);
        self.save();
        true
    }

    pub fn has_player_name(&self) -> bool {
        !self.data.player_name.is_empty()
    }

    pub fn player_name(&self) -> &str {
        if self.data.player_name.is_empty() {
            ANONYMOUS
        } else {
            &self.data.player_name
        }
    }

    pub fn set_player_name(&mut self, name: &str) {
        let name = name.trim();
        let name = if name.is_empty() {
            String::new()
        } else {
            name.chars().take(NAME_LIMIT).collect()
        };
        if self.data.player_name != name {
            self.data.player_name = name;
            self.save();
        }
    }

    pub fn daily_mvp(&self) -> Option<&DailyMvp> {
        self.mvp_data.mvp.as_ref()
    }

    pub fn record_daily_mvp(&mut self, name: &str, score: u64, note: Option<&str>) -> bool {
        self.record_daily_mvp_at(&today_key(), name, score, note)
    }

    fn record_daily_mvp_at(
        &mut self,
        date: &str,
        name: &str,
        score: u64,
        note: Option<&str>,
    ) -> bool {
        if score == 0
            || self
                .mvp_data
                .mvp
                .as_ref()
                .is_some_and(|current| current.date == date && current.score >= score)
        {
            return false;
        }
        self.mvp_data.mvp = Some(DailyMvp {
            date: date.to_string(),
            name: name.to_string(),
            score,
            note: note.map(str::to_string),
        });
        self.save_mvp();
        true
    }

    fn save(&self) {
        if let Ok(data) = serde_json::to_string_pretty(&self.data) {
            write_file(&self.path, &data);
        }
    }

    fn save_mvp(&self) {
        if let Ok(data) = serde_json::to_string_pretty(&self.mvp_data) {
            write_file(&self.mvp_path, &data);
        }
    }
}

fn write_file(path: &std::path::Path, data: &str) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(path, data);
}

pub fn today_ordinal() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() / 86_400)
        .unwrap_or(0)
}

fn today_key() -> String {
    chrono::Utc::now()
        .date_naive()
        .format("%Y-%m-%d")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn temp_path(name: &str) -> PathBuf {
        static SEQUENCE: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "mvp_config_test_{}_{}_{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed),
            name,
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join(FILE_NAME)
    }

    #[test]
    fn player_name_and_daily_code_best_persist() {
        let path = temp_path("solo");
        let mut store = HighScoreStore::load(&path);
        assert_eq!(store.player_name(), ANONYMOUS);
        assert!(store.record(GameKind::DailyCode, 900_000));
        assert!(!store.record(GameKind::DailyCode, 899_999));
        assert_eq!(store.best_score(GameKind::DailyCode), 900_000);
        assert!(!store.record(GameKind::RankedMatch, 1_000));
        store.set_player_name("  Alex  ");

        let mut reloaded = HighScoreStore::load(&path);
        assert_eq!(reloaded.player_name(), "Alex");
        assert_eq!(reloaded.best_score(GameKind::DailyCode), 900_000);
        assert!(reloaded.mark_daily_code_attempt(20_000));
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn daily_code_allows_only_one_local_attempt_per_utc_day() {
        let path = temp_path("daily-attempt");
        let mut store = HighScoreStore::load(&path);
        assert!(store.mark_daily_code_attempt(20_000));
        assert!(!store.mark_daily_code_attempt(20_000));

        let mut reopened = HighScoreStore::load(&path);
        assert!(reopened.daily_code_attempted(20_000));
        assert!(reopened.mark_daily_code_attempt(20_001));
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn daily_mvp_is_a_daily_code_record_and_resets_on_the_next_day() {
        let path = temp_path("mvp");
        let mut store = HighScoreStore::load(&path);
        assert!(store.record_daily_mvp_at("2026-08-20", "Alex", 100, Some("solved in 10s")));
        assert!(!store.record_daily_mvp_at("2026-08-20", "Sam", 99, None));
        assert!(store.record_daily_mvp_at("2026-08-21", "Sam", 1, None));
        assert_eq!(store.daily_mvp().unwrap().name, "Sam");
        assert_eq!(store.daily_mvp().unwrap().date, "2026-08-21");
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn malformed_and_missing_files_degrade_to_empty_state() {
        let path = temp_path("malformed");
        fs::write(&path, "{").unwrap();
        let store = HighScoreStore::load(&path);
        assert_eq!(store.best_score(GameKind::DailyCode), 0);
        assert!(!store.has_player_name());
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}
