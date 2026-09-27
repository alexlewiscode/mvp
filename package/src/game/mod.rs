pub mod daily_code;
pub mod scoring;

use std::time::Duration;

use daily_code::DailyCodePuzzle;

/// Input events shared by the local code puzzle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameInput {
    Confirm,
    Type(char),
    Backspace,
}

/// Modes shown in the terminal game selector.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameKind {
    DailyCode,
    RankedMatch,
}

impl GameKind {
    pub const ALL: [GameKind; 2] = [GameKind::DailyCode, GameKind::RankedMatch];

    pub fn title(self) -> &'static str {
        match self {
            Self::DailyCode => "Daily Code Puzzle",
            Self::RankedMatch => "Ranked 1v1",
        }
    }

    pub fn blurb(self) -> &'static str {
        match self {
            Self::DailyCode => "solve today's shared code puzzle against the clock",
            Self::RankedMatch => "race another developer to the same solution",
        }
    }
}

/// Immutable metrics captured at the end of a local daily-puzzle run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompletedRun {
    DailyCode {
        day: u64,
        charged_duration_ms: u64,
        duration_ms: u64,
        attempts: u32,
        hint_used: bool,
        answer: String,
    },
}

/// Live local solo challenge. Ranked matches are owned by the online match
/// service, not represented as a local simulation.
pub enum ActiveGame {
    DailyCode(DailyCodePuzzle),
}

impl ActiveGame {
    pub fn new(kind: GameKind, seed: u64, _playfield_cols: u16, _playfield_rows: u16) -> Self {
        match kind {
            GameKind::DailyCode => Self::DailyCode(DailyCodePuzzle::new(seed)),
            GameKind::RankedMatch => unreachable!("ranked matches use the online service"),
        }
    }

    pub fn text_input(&self) -> bool {
        true
    }

    pub fn handle_input(&mut self, input: GameInput) {
        match self {
            Self::DailyCode(game) => game.handle_input(input),
        }
    }

    pub fn update(&mut self, dt: Duration) {
        match self {
            Self::DailyCode(game) => game.update(dt),
        }
    }

    pub fn is_game_over(&self) -> bool {
        match self {
            Self::DailyCode(game) => game.is_game_over(),
        }
    }

    pub fn score(&self) -> u64 {
        match self {
            Self::DailyCode(game) => game.score(),
        }
    }

    pub fn completed_run(&self) -> Option<CompletedRun> {
        let Self::DailyCode(game) = self;
        game.is_game_over().then(|| CompletedRun::DailyCode {
            day: game.challenge_day(),
            charged_duration_ms: game.charged_duration_millis(),
            duration_ms: game.elapsed_millis(),
            attempts: game.attempts(),
            hint_used: game.hint_shown(),
            answer: game.input().to_string(),
        })
    }

    pub fn score_note(&self) -> Option<String> {
        match self {
            Self::DailyCode(game) => Some(format!(
                "solved in {}",
                scoring::format_elapsed(game.total_seconds())
            )),
        }
    }

    pub fn set_viewport(&mut self, _playfield_cols: u16, _playfield_rows: u16) {}
}
