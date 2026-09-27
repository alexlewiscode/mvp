use std::sync::mpsc::Sender;
use std::time::Duration;

use crate::api::{
    ApiError, DailyCodeAttempt, Leaderboard, LeaderboardRequest, RankedMatchState, RunPayload,
    WorkerCommand, WorkerEvent,
};
use crate::config::{DailyMvp, HighScoreStore};
use crate::event::AppInput;
use crate::game::{ActiveGame, GameInput, GameKind};
use crate::ui;

pub const MIN_COLS: u16 = 60;
pub const MIN_ROWS: u16 = 20;
const NAME_LIMIT: usize = 24;
const NAME_LEGAL: &str = " -_.'!@#$&+=()";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppState {
    Menu,
    Leaderboard,
    GameMenu,
    NamePrompt,
    Playing,
    PausedManual,
    GameOver,
    Matchmaking,
    DailyCodeStarting,
    DailyCodeLocked,
}

#[derive(Debug, Default)]
pub enum OnlineLeaderboard {
    #[default]
    NotLoaded,
    Loading,
    Available(Leaderboard),
    Unavailable,
}

/// The single-player terminal puzzle, ranked queue, and their shared screens.
pub struct App {
    pub state: AppState,
    game: Option<ActiveGame>,
    game_selection: usize,
    store: HighScoreStore,
    terminal_size: Option<(u16, u16)>,
    new_record: bool,
    name_buffer: String,
    mvp_just_set: bool,
    should_quit: bool,
    online_commands: Option<Sender<WorkerCommand>>,
    online_username: Option<String>,
    online_leaderboard: OnlineLeaderboard,
    account_requested: bool,
    account_message: Option<String>,
    ranked_match: Option<RankedMatchState>,
    ranked_answer: String,
    ranked_attempts: u32,
    ranked_message: Option<String>,
    pending_daily_code_day: Option<u64>,
    submit_daily_code_online: bool,
    daily_code_message: Option<String>,
}

impl App {
    pub fn new(store: HighScoreStore) -> Self {
        Self {
            state: AppState::Menu,
            game: None,
            game_selection: 0,
            store,
            terminal_size: None,
            new_record: false,
            name_buffer: String::new(),
            mvp_just_set: false,
            should_quit: false,
            online_commands: None,
            online_username: None,
            online_leaderboard: OnlineLeaderboard::NotLoaded,
            account_requested: false,
            account_message: None,
            ranked_match: None,
            ranked_answer: String::new(),
            ranked_attempts: 0,
            ranked_message: None,
            pending_daily_code_day: None,
            submit_daily_code_online: false,
            daily_code_message: None,
        }
    }

    pub fn handle_input(&mut self, input: AppInput) {
        match input {
            AppInput::Quit => self.quit(),
            AppInput::Confirm => match self.state {
                AppState::Menu => self.state = AppState::GameMenu,
                AppState::Leaderboard => {}
                AppState::GameMenu => self.start_game(),
                AppState::NamePrompt => self.submit_name(),
                AppState::Playing => self.game_input(GameInput::Confirm),
                AppState::PausedManual => {}
                AppState::GameOver => self.restart_same_game(),
                AppState::Matchmaking => self.submit_ranked_answer(),
                AppState::DailyCodeLocked => self.state = AppState::GameMenu,
                AppState::DailyCodeStarting => {}
            },
            AppInput::Up => {
                if self.state == AppState::GameMenu {
                    self.move_selection(-1);
                }
            }
            AppInput::Down => {
                if self.state == AppState::GameMenu {
                    self.move_selection(1);
                }
            }
            AppInput::TogglePause => self.toggle_pause(),
            AppInput::Restart => {
                if self.state == AppState::GameOver {
                    self.restart_same_game();
                }
            }
            AppInput::Rename => {
                if self.state == AppState::Menu {
                    self.open_name_prompt();
                }
            }
            AppInput::Leaderboard => {
                if self.state == AppState::Menu {
                    self.open_leaderboard();
                }
            }
            AppInput::Account => {
                if self.state == AppState::Menu {
                    self.account_requested = true;
                    self.account_message = None;
                }
            }
            AppInput::RankedMatch => {
                if self.state == AppState::Menu {
                    self.start_game_of(GameKind::RankedMatch);
                }
            }
            AppInput::Text(character) => match self.state {
                AppState::NamePrompt => self.type_name(character),
                AppState::Playing => self.game_input(GameInput::Type(character)),
                AppState::Matchmaking => self.ranked_answer.push(character),
                _ => {}
            },
            AppInput::Backspace => match self.state {
                AppState::NamePrompt => {
                    self.name_buffer.pop();
                }
                AppState::Playing => self.game_input(GameInput::Backspace),
                AppState::Matchmaking => {
                    self.ranked_answer.pop();
                }
                _ => {}
            },
            AppInput::Back => match self.state {
                AppState::Menu => {}
                AppState::Leaderboard => self.state = AppState::Menu,
                AppState::NamePrompt => self.dismiss_name_prompt(),
                AppState::GameMenu => self.state = AppState::Menu,
                AppState::Matchmaking => {
                    if let Some(commands) = &self.online_commands {
                        let _ = commands.send(WorkerCommand::LeaveRankedQueue);
                    }
                    self.ranked_match = None;
                    self.ranked_answer.clear();
                    self.state = AppState::GameMenu;
                }
                AppState::DailyCodeLocked => self.state = AppState::GameMenu,
                AppState::DailyCodeStarting => {}
                AppState::Playing | AppState::PausedManual | AppState::GameOver => {
                    self.back_to_menu();
                }
            },
            AppInput::Resize(cols, rows) => self.set_terminal_size(cols, rows),
        }
    }

    pub fn start_game(&mut self) {
        self.start_game_of(self.selected_kind());
    }

    pub fn start_game_of(&mut self, kind: GameKind) {
        if kind == GameKind::RankedMatch {
            self.game = None;
            self.ranked_match = None;
            self.ranked_answer.clear();
            self.ranked_attempts = 0;
            self.ranked_message = None;
            self.state = AppState::Matchmaking;
            if let Some(commands) = &self.online_commands {
                let _ = commands.send(WorkerCommand::JoinRankedQueue);
            } else {
                self.ranked_message = Some("Sign in to join ranked matches.".into());
            }
            return;
        }
        let day = crate::config::today_ordinal();
        if self.store.daily_code_attempted(day) {
            self.game = None;
            self.daily_code_message =
                Some("You've already attempted today's puzzle. Come back tomorrow.".into());
            self.state = AppState::DailyCodeLocked;
            return;
        }
        if self.online_username.is_some() {
            self.pending_daily_code_day = Some(day);
            self.daily_code_message = Some("Reserving today's single attempt…".into());
            self.state = AppState::DailyCodeStarting;
            if let Some(commands) = &self.online_commands {
                let _ = commands.send(WorkerCommand::ClaimDailyCodeAttempt);
                return;
            }
        }
        self.begin_daily_code(day, false);
    }

    fn begin_daily_code(&mut self, day: u64, online_claimed: bool) {
        self.pending_daily_code_day = None;
        if !self.store.mark_daily_code_attempt(day) {
            self.daily_code_message =
                Some("You've already attempted today's puzzle. Come back tomorrow.".into());
            self.state = AppState::DailyCodeLocked;
            return;
        }
        let (cols, rows) = self.playfield_dims();
        self.game = Some(ActiveGame::new(GameKind::DailyCode, day, cols, rows));
        self.submit_daily_code_online = online_claimed;
        self.daily_code_message = if self.online_username.is_some() && !online_claimed {
            Some("Playing offline; this attempt won't be submitted to the leaderboard.".into())
        } else {
            None
        };
        self.new_record = false;
        self.mvp_just_set = false;
        self.state = AppState::Playing;
    }

    fn restart_same_game(&mut self) {
        self.back_to_menu();
    }

    fn move_selection(&mut self, delta: i64) {
        let count = GameKind::ALL.len() as i64;
        self.game_selection = (self.game_selection as i64 + delta).rem_euclid(count) as usize;
    }

    pub fn pause(&mut self) {
        if self.state == AppState::Playing {
            self.state = AppState::PausedManual;
        }
    }

    pub fn resume(&mut self) {
        if self.state == AppState::PausedManual {
            self.state = AppState::Playing;
        }
    }

    pub fn toggle_pause(&mut self) {
        match self.state {
            AppState::Playing => self.pause(),
            AppState::PausedManual => self.resume(),
            _ => {}
        }
    }

    pub fn open_name_prompt(&mut self) {
        self.name_buffer.clear();
        self.state = AppState::NamePrompt;
    }

    fn submit_name(&mut self) {
        let name = self.name_buffer.trim();
        if name.is_empty() {
            return;
        }
        self.store.set_player_name(name);
        self.name_buffer.clear();
        self.state = AppState::Menu;
    }

    fn dismiss_name_prompt(&mut self) {
        if !self.store.has_player_name() {
            return;
        }
        self.name_buffer.clear();
        self.state = AppState::Menu;
    }

    fn type_name(&mut self, character: char) {
        if self.name_buffer.chars().count() >= NAME_LIMIT
            || (!character.is_alphanumeric() && !NAME_LEGAL.contains(character))
        {
            return;
        }
        self.name_buffer.push(character);
    }

    pub fn back_to_menu(&mut self) {
        self.game = None;
        self.state = AppState::Menu;
    }

    pub fn quit(&mut self) {
        self.should_quit = true;
    }

    pub fn should_quit(&self) -> bool {
        self.should_quit
    }

    fn game_input(&mut self, input: GameInput) {
        if let Some(game) = &mut self.game {
            game.handle_input(input);
        }
        if self.state == AppState::Playing
            && self.game.as_ref().is_some_and(ActiveGame::is_game_over)
        {
            let score = self.game.as_ref().map(ActiveGame::score).unwrap_or(0);
            self.finish_run(score);
        }
    }

    pub fn tick(&mut self, dt: Duration) {
        if self.state != AppState::Playing || self.too_small() {
            return;
        }
        let finished_score = self.game.as_mut().and_then(|game| {
            game.update(dt);
            game.is_game_over().then(|| game.score())
        });
        if let Some(score) = finished_score {
            self.finish_run(score);
        }
    }

    fn finish_run(&mut self, score: u64) {
        let note = self.game.as_ref().and_then(ActiveGame::score_note);
        let completed = self.game.as_ref().and_then(ActiveGame::completed_run);
        let name = self.player_name().to_string();
        self.new_record = self.store.record(GameKind::DailyCode, score);
        self.mvp_just_set = self.store.record_daily_mvp(&name, score, note.as_deref());
        if self.submit_daily_code_online
            && self.online_username.is_some()
            && let (Some(commands), Some(completed)) = (&self.online_commands, completed)
        {
            match RunPayload::from_completed(&completed) {
                Ok(run) => {
                    let _ = commands.send(WorkerCommand::Submit(run));
                }
                Err(error) => crate::debug_log!("online puzzle submission rejected: {error}"),
            }
        }
        self.state = AppState::GameOver;
    }

    pub fn set_terminal_size(&mut self, cols: u16, rows: u16) {
        self.terminal_size = Some((cols, rows));
        if let Some(game) = &mut self.game {
            game.set_viewport(cols.saturating_sub(2).max(1), rows.saturating_sub(4).max(1));
        }
    }

    pub fn terminal_size(&self) -> Option<(u16, u16)> {
        self.terminal_size
    }

    pub fn too_small(&self) -> bool {
        self.terminal_size
            .is_some_and(|(cols, rows)| cols < MIN_COLS || rows < MIN_ROWS)
    }

    fn playfield_dims(&self) -> (u16, u16) {
        self.terminal_size
            .map(|(cols, rows)| ui::playfield_dims(cols, rows))
            .unwrap_or((58, 12))
    }

    pub fn game(&self) -> Option<&ActiveGame> {
        self.game.as_ref()
    }

    pub fn text_mode(&self) -> bool {
        matches!(self.state, AppState::NamePrompt | AppState::Matchmaking)
            || (self.state == AppState::Playing
                && self.game.as_ref().is_some_and(ActiveGame::text_input))
    }

    pub fn best_score(&self) -> u64 {
        self.store.best_score(GameKind::DailyCode)
    }

    pub fn best_score_for(&self, kind: GameKind) -> u64 {
        self.store.best_score(kind)
    }

    pub fn selected_kind(&self) -> GameKind {
        GameKind::ALL[self.game_selection]
    }

    pub fn is_new_record(&self) -> bool {
        self.new_record
    }

    pub fn player_name(&self) -> &str {
        self.store.player_name()
    }

    pub fn has_player_name(&self) -> bool {
        self.store.has_player_name()
    }

    pub fn name_buffer(&self) -> &str {
        &self.name_buffer
    }

    pub fn daily_mvp(&self) -> Option<&DailyMvp> {
        self.store.daily_mvp()
    }

    pub fn mvp_just_set(&self) -> bool {
        self.mvp_just_set
    }

    pub fn configure_online(&mut self, commands: Sender<WorkerCommand>, username: Option<String>) {
        self.online_commands = Some(commands);
        self.online_username = username;
    }

    pub fn clear_online(&mut self) {
        self.online_commands = None;
        self.online_username = None;
    }

    pub fn take_account_request(&mut self) -> bool {
        std::mem::take(&mut self.account_requested)
    }

    pub fn set_account_message(&mut self, message: impl Into<String>) {
        self.account_message = Some(message.into());
    }

    pub fn account_message(&self) -> Option<&str> {
        self.account_message.as_deref()
    }

    fn open_leaderboard(&mut self) {
        self.state = AppState::Leaderboard;
        self.online_leaderboard = OnlineLeaderboard::Loading;
        let sent = self.online_commands.as_ref().is_some_and(|commands| {
            commands
                .send(WorkerCommand::Leaderboard(LeaderboardRequest::Daily {
                    date: None,
                    limit: 10,
                }))
                .is_ok()
        });
        if !sent {
            self.online_leaderboard = OnlineLeaderboard::Unavailable;
        }
    }

    pub fn handle_online_event(&mut self, event: WorkerEvent) {
        match event {
            WorkerEvent::Leaderboard(Ok(board)) => {
                self.online_leaderboard = OnlineLeaderboard::Available(board)
            }
            WorkerEvent::Leaderboard(Err(_)) => {
                self.online_leaderboard = OnlineLeaderboard::Unavailable
            }
            WorkerEvent::RankedMatch(Ok(state)) => {
                self.ranked_message = Some(
                    match state.status.as_str() {
                        "waiting" => "Finding an evenly matched opponent…",
                        "active" => "Match live — solve the code fix first to win.",
                        "completed" if state.result.as_deref() == Some("won") => {
                            "You won the match! +100 points"
                        }
                        "completed" if state.result.as_deref() == Some("lost") => {
                            "Match complete — queue again to climb back."
                        }
                        "completed" => "Match complete.",
                        "expired" => "No opponent found in time. Press ENTER to queue again.",
                        _ => "",
                    }
                    .to_string(),
                );
                self.ranked_match = (state.status != "expired").then_some(state);
            }
            WorkerEvent::RankedMatch(Err(error)) => self.ranked_message = Some(error.to_string()),
            WorkerEvent::DailyCodeAttempt(Ok(attempt)) => {
                if let Some(local_day) = self.pending_daily_code_day.take() {
                    let server_day = daily_attempt_ordinal(&attempt).unwrap_or(local_day);
                    self.begin_daily_code(server_day, true);
                }
            }
            WorkerEvent::DailyCodeAttempt(Err(ApiError::Conflict { code, .. }))
                if code == "daily_attempt_used" =>
            {
                self.pending_daily_code_day = None;
                self.daily_code_message =
                    Some("You've already attempted today's puzzle. Come back tomorrow.".into());
                self.state = AppState::DailyCodeLocked;
            }
            WorkerEvent::DailyCodeAttempt(Err(error)) => {
                if let Some(day) = self.pending_daily_code_day.take() {
                    self.begin_daily_code(day, false);
                    self.daily_code_message = Some(format!(
                        "Couldn't reserve an online attempt ({error}); playing offline."
                    ));
                }
            }
            WorkerEvent::RankedSubmission(Ok(submission)) => {
                if submission.correct {
                    self.ranked_message = Some(format!(
                        "You won the match! +{} points",
                        submission.points_awarded.unwrap_or(100)
                    ));
                } else {
                    self.ranked_attempts = submission.attempts.unwrap_or(self.ranked_attempts + 1);
                    self.ranked_answer.clear();
                    self.ranked_message = Some(format!(
                        "Not quite — {} wrong attempt(s). Try again.",
                        self.ranked_attempts
                    ));
                }
            }
            WorkerEvent::RankedSubmission(Err(error)) => {
                self.ranked_message = Some(error.to_string())
            }
            WorkerEvent::Error(error) => {
                self.ranked_message = Some(error.clone());
                crate::debug_log!("online worker: {error}");
            }
            WorkerEvent::RunQueued(id) => crate::debug_log!("online run queued: {id}"),
            WorkerEvent::QueueProcessed(result) => crate::debug_log!(
                "online queue: {} submitted, {} remaining",
                result.submitted,
                result.remaining
            ),
            WorkerEvent::Stopped => {}
        }
    }

    pub fn online_leaderboard(&self) -> &OnlineLeaderboard {
        &self.online_leaderboard
    }

    pub fn online_username(&self) -> Option<&str> {
        self.online_username.as_deref()
    }

    pub fn ranked_match(&self) -> Option<&RankedMatchState> {
        self.ranked_match.as_ref()
    }

    pub fn ranked_answer(&self) -> &str {
        &self.ranked_answer
    }

    pub fn ranked_attempts(&self) -> u32 {
        self.ranked_attempts
    }

    pub fn ranked_message(&self) -> Option<&str> {
        self.ranked_message.as_deref()
    }

    pub fn daily_code_message(&self) -> Option<&str> {
        self.daily_code_message.as_deref()
    }

    fn submit_ranked_answer(&mut self) {
        let Some(state) = self.ranked_match.as_ref() else {
            self.join_ranked_queue();
            return;
        };
        if matches!(state.status.as_str(), "completed" | "expired" | "idle") {
            self.ranked_match = None;
            self.ranked_attempts = 0;
            self.ranked_answer.clear();
            self.join_ranked_queue();
            return;
        }
        if state.status != "active" || self.ranked_answer.trim().is_empty() {
            return;
        }
        let Some(match_id) = state.match_id.clone() else {
            return;
        };
        let Some(commands) = &self.online_commands else {
            self.ranked_message = Some("Sign in to submit ranked matches.".into());
            return;
        };
        let _ = commands.send(WorkerCommand::SubmitRankedAnswer {
            match_id,
            answer: self.ranked_answer.clone(),
            attempts: self.ranked_attempts,
        });
        self.ranked_message = Some("Checking your answer…".into());
    }

    fn join_ranked_queue(&mut self) {
        if let Some(commands) = &self.online_commands {
            let _ = commands.send(WorkerCommand::JoinRankedQueue);
            self.ranked_message = Some("Looking for an opponent…".into());
        } else {
            self.ranked_message = Some("Sign in to join ranked matches.".into());
        }
    }
}

fn daily_attempt_ordinal(attempt: &DailyCodeAttempt) -> Option<u64> {
    let date = chrono::NaiveDate::parse_from_str(&attempt.date, "%Y-%m-%d").ok()?;
    let timestamp = date.and_hms_opt(0, 0, 0)?.and_utc().timestamp();
    u64::try_from(timestamp / 86_400).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> HighScoreStore {
        let path = std::env::temp_dir().join(format!("mvp_app_test_{}.json", uuid::Uuid::new_v4()));
        HighScoreStore::load(path)
    }

    #[test]
    fn game_selector_has_exactly_the_current_two_modes() {
        assert_eq!(GameKind::ALL, [GameKind::DailyCode, GameKind::RankedMatch]);
    }

    #[test]
    fn a_player_can_pause_and_resume_the_daily_puzzle() {
        let mut app = App::new(store());
        app.set_terminal_size(100, 30);
        app.start_game_of(GameKind::DailyCode);
        app.handle_input(AppInput::TogglePause);
        assert_eq!(app.state, AppState::PausedManual);
        app.handle_input(AppInput::TogglePause);
        assert_eq!(app.state, AppState::Playing);
        assert!(app.game().is_some());
    }

    #[test]
    fn a_daily_puzzle_cannot_be_replayed_after_starting_that_day() {
        let mut app = App::new(store());
        app.set_terminal_size(100, 30);
        app.start_game_of(GameKind::DailyCode);
        assert_eq!(app.state, AppState::Playing);
        app.back_to_menu();
        app.start_game_of(GameKind::DailyCode);
        assert_eq!(app.state, AppState::DailyCodeLocked);
        assert!(app.game().is_none());
    }

    #[test]
    fn signed_in_daily_puzzle_waits_for_a_server_attempt_claim() {
        let mut app = App::new(store());
        let (commands, received) = std::sync::mpsc::channel();
        app.configure_online(commands, Some("coder".into()));
        app.start_game_of(GameKind::DailyCode);
        assert_eq!(app.state, AppState::DailyCodeStarting);
        assert!(matches!(
            received.try_recv(),
            Ok(WorkerCommand::ClaimDailyCodeAttempt)
        ));
        app.handle_online_event(WorkerEvent::DailyCodeAttempt(Ok(DailyCodeAttempt {
            date: chrono::Utc::now().format("%Y-%m-%d").to_string(),
            started_at: chrono::Utc::now().to_rfc3339(),
        })));
        assert_eq!(app.state, AppState::Playing);
        app.back_to_menu();
        app.start_game_of(GameKind::DailyCode);
        assert_eq!(app.state, AppState::DailyCodeLocked);
    }

    #[test]
    fn ranked_mode_joins_the_queue_and_submits_a_typed_fix() {
        let mut app = App::new(store());
        let (commands, received) = std::sync::mpsc::channel();
        app.configure_online(commands, Some("coder".into()));
        app.start_game_of(GameKind::RankedMatch);
        assert_eq!(app.state, AppState::Matchmaking);
        assert!(matches!(
            received.try_recv(),
            Ok(WorkerCommand::JoinRankedQueue)
        ));
        app.handle_online_event(WorkerEvent::RankedMatch(Ok(RankedMatchState {
            match_id: Some("match-id".into()),
            status: "active".into(),
            puzzle_date: Some("2026-09-27".into()),
            expires_at: None,
            opponent: Some("rival".into()),
            puzzle: Some(crate::api::matches::DailyPuzzle {
                id: "daily-code-v1-01".into(),
                date: "2026-09-27".into(),
                version: 1,
                title: "Fix it".into(),
                language: "rust".into(),
                snippet: vec!["return a + b;".into()],
                buggy_line: 0,
                difficulty: 1,
            }),
            result: None,
        })));
        for character in "return a + b;".chars() {
            app.handle_input(AppInput::Text(character));
        }
        app.handle_input(AppInput::Confirm);
        assert!(matches!(
            received.try_recv(),
            Ok(WorkerCommand::SubmitRankedAnswer { match_id, answer, attempts: 0 })
                if match_id == "match-id" && answer == "return a + b;"
        ));
    }
}
