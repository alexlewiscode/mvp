use ratatui::Frame;
use ratatui::layout::{Alignment, Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Clear, Paragraph};

use crate::app::{App, AppState, OnlineLeaderboard, ProfileState};
use crate::game::daily_code::DailyCodePuzzle;
use crate::game::scoring::{format_elapsed, format_score};
use crate::game::{ActiveGame, GameKind};

const CHROME_ROWS: u16 = 4;
const LOGO: [&str; 6] = [
    r#" __  __   __      __  _____ "#,
    r#"|  \/  |  \ \    / / |  __ \"#,
    r#"| \  / |   \ \  / /  | |__) |"#,
    r#"| |\/| |    \ \/ /   |  ___/"#,
    r#"| |  | |     \  /    | |"#,
    r#"|_|  |_|      \/     |_|"#,
];
const LOGO_WIDTH: usize = 29;

pub fn playfield_dims(term_cols: u16, term_rows: u16) -> (u16, u16) {
    (
        term_cols.saturating_sub(2).max(1),
        term_rows.saturating_sub(CHROME_ROWS).max(1),
    )
}

pub fn render(frame: &mut Frame, app: &App) {
    if app.too_small() {
        render_too_small(frame, app);
        return;
    }
    match app.state {
        AppState::Menu => render_menu(frame, app),
        AppState::Leaderboard => render_leaderboard(frame, app),
        AppState::Profile => render_profile(frame, app),
        AppState::GameMenu => render_game_menu(frame, app),
        AppState::NamePrompt => render_name_prompt(frame, app),
        AppState::DailyCodeStarting => render_daily_code_status(
            frame,
            app,
            "RESERVING TODAY'S PUZZLE",
            "Checking your one daily attempt…",
        ),
        AppState::DailyCodeLocked => render_daily_code_status(
            frame,
            app,
            "DAILY PUZZLE ALREADY PLAYED",
            "Come back tomorrow for the next puzzle.",
        ),
        AppState::Playing | AppState::PausedManual | AppState::GameOver => render_game(frame, app),
        AppState::Matchmaking => render_ranked_match(frame, app),
    }
}

fn centered(area: Rect, width: u16, height: u16) -> Rect {
    let width = width.min(area.width);
    let height = height.min(area.height);
    Rect {
        x: area.x + (area.width - width) / 2,
        y: area.y + (area.height - height) / 2,
        width,
        height,
    }
}

fn render_menu(frame: &mut Frame, app: &App) {
    let area = frame.area();
    let logo = Style::new()
        .fg(Color::LightMagenta)
        .add_modifier(Modifier::BOLD);
    let dim = Style::new().fg(Color::DarkGray);
    let green = Style::new().fg(Color::Green).add_modifier(Modifier::BOLD);
    let white = Style::new().fg(Color::White).add_modifier(Modifier::BOLD);
    let mut lines = Vec::new();
    if area.width as usize >= LOGO_WIDTH {
        lines.extend(
            LOGO.iter()
                .map(|line| Line::styled(format!("{line:<LOGO_WIDTH$}"), logo)),
        );
    } else {
        lines.push(Line::styled("M V P", logo));
    }
    lines.push(Line::from(""));
    lines.push(Line::styled("MOST VALUED PROGRAMMER", dim));
    lines.push(Line::from(""));
    if let Some(mvp) = app.daily_mvp() {
        let score = mvp.note.clone().unwrap_or_else(|| format_score(mvp.score));
        lines.push(Line::styled(
            format!("DAILY PUZZLE MVP  {}  |  {}", mvp.name, score),
            Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD),
        ));
        lines.push(Line::from(""));
    }
    lines.push(Line::from(vec![
        Span::styled("PLAYING AS ", dim),
        Span::styled(app.player_name(), white),
    ]));
    if let Some(message) = app.account_message() {
        lines.push(Line::from(""));
        lines.push(Line::styled(message, dim));
    }
    lines.push(Line::from(""));
    lines.push(Line::styled("[ ENTER ] PLAY", green));
    if app.best_score() > 0 {
        lines.push(Line::styled(
            format!(
                "BEST {}",
                format_elapsed((1_000_000_000 - app.best_score()) as f64 / 1000.0)
            ),
            dim,
        ));
    }
    let areas = Layout::vertical([Constraint::Min(0), Constraint::Length(1)]).split(area);
    let total = lines.len() as u16;
    let content = Layout::vertical([
        Constraint::Length(areas[0].height.saturating_sub(total) / 2),
        Constraint::Length(total),
        Constraint::Min(0),
    ])
    .split(areas[0]);
    frame.render_widget(
        Paragraph::new(lines).alignment(Alignment::Center),
        content[1],
    );
    let account = if app.online_username().is_some() {
        "[ I ] PROFILE"
    } else {
        "[ I ] SIGN IN"
    };
    frame.render_widget(
        Paragraph::new(format!(
            "[ L ] LEADERBOARD    [ M ] RANKED 1v1    {account}    [ N ] NAME    [ Q ] QUIT"
        ))
        .style(dim)
        .alignment(Alignment::Center),
        areas[1],
    );
}

fn render_game_menu(frame: &mut Frame, app: &App) {
    let dim = Style::new().fg(Color::DarkGray);
    let white = Style::new().fg(Color::White);
    let selected = Style::new().fg(Color::Green).add_modifier(Modifier::BOLD);
    let mut lines = vec![
        Line::styled(
            "CHOOSE YOUR MODE",
            Style::new().fg(Color::Magenta).add_modifier(Modifier::BOLD),
        ),
        Line::from(""),
    ];
    for kind in GameKind::ALL {
        let active = kind == app.selected_kind();
        lines.push(Line::from(vec![
            Span::styled(if active { "▶" } else { " " }, selected),
            Span::raw(" "),
            Span::styled(kind.title(), if active { selected } else { white }),
            Span::raw("  "),
            Span::styled(kind.blurb(), dim),
        ]));
    }
    lines.push(Line::from(""));
    lines.push(Line::styled("↑/↓ SELECT    ENTER PLAY    ESC BACK", dim));
    frame.render_widget(
        Paragraph::new(lines).alignment(Alignment::Center),
        centered(frame.area(), frame.area().width, 8),
    );
}

fn render_name_prompt(frame: &mut Frame, app: &App) {
    let dim = Style::new().fg(Color::DarkGray);
    let white = Style::new().fg(Color::White).add_modifier(Modifier::BOLD);
    let lines = vec![
        Line::styled(
            "WHO IS THE MVP?",
            Style::new().fg(Color::Magenta).add_modifier(Modifier::BOLD),
        ),
        Line::from(""),
        Line::from(vec![
            Span::raw("> "),
            Span::styled(format!("{}▌", app.name_buffer()), white),
        ]),
        Line::from(""),
        Line::styled("YOUR NAME GOES ON THE DAILY PUZZLE BOARD", dim),
        Line::styled(
            if app.has_player_name() {
                "[ ENTER ] SAVE    [ ESC ] CANCEL"
            } else {
                "[ ENTER ] SAVE    NAME REQUIRED TO PLAY"
            },
            dim,
        ),
    ];
    frame.render_widget(
        Paragraph::new(lines).alignment(Alignment::Center),
        centered(frame.area(), frame.area().width, 8),
    );
}

fn render_daily_code_status(frame: &mut Frame, app: &App, title: &str, fallback: &str) {
    let dim = Style::new().fg(Color::DarkGray);
    let green = Style::new().fg(Color::Green).add_modifier(Modifier::BOLD);
    let message = app.daily_code_message().unwrap_or(fallback);
    let lines = vec![
        Line::styled(title, green),
        Line::from(""),
        Line::styled(message.to_string(), dim),
        Line::from(""),
        Line::styled("ENTER / ESC BACK", dim),
    ];
    frame.render_widget(
        Paragraph::new(lines).alignment(Alignment::Center),
        centered(frame.area(), frame.area().width.min(72), 7),
    );
}

fn render_daily_puzzle(frame: &mut Frame, app: &App, game: &DailyCodePuzzle) {
    let area = frame.area();
    let dim = Style::new().fg(Color::DarkGray);
    let red = Style::new().fg(Color::Red);
    let white = Style::new().fg(Color::White);
    let yellow = Style::new().fg(Color::Yellow);
    let green = Style::new().fg(Color::Green).add_modifier(Modifier::BOLD);
    let block = Block::bordered().border_style(dim).title(Line::styled(
        " DAILY CODE PUZZLE ",
        Style::new().fg(Color::Magenta),
    ));
    let inner = block.inner(area);
    let rows = Layout::vertical([
        Constraint::Length(1),
        Constraint::Min(1),
        Constraint::Length(1),
    ])
    .split(inner);
    let best = app.best_score_for(GameKind::DailyCode);
    let best_text = if best == 0 {
        "BEST —".to_string()
    } else {
        format!(
            "BEST {}",
            format_elapsed((1_000_000_000 - best) as f64 / 1000.0)
        )
    };
    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(
                format!("TIME {}", format_elapsed(game.total_seconds())),
                white,
            ),
            Span::raw("   "),
            Span::styled(format!("ATTEMPTS {}", game.attempts()), dim),
            Span::raw("   "),
            Span::styled(best_text, yellow),
        ])),
        rows[0],
    );
    let puzzle = game.bug();
    let mut body: Vec<Line<'static>> = Vec::new();
    body.push(Line::styled(
        format!("{}  ·  difficulty {}", puzzle.title, puzzle.difficulty),
        white.add_modifier(Modifier::BOLD),
    ));
    body.push(Line::from(""));
    for (index, source) in puzzle.lines.iter().enumerate() {
        let is_broken = index == puzzle.buggy_line;
        body.push(Line::from(vec![
            Span::styled(format!("{:>2} ", index + 1), dim),
            Span::styled(
                if is_broken { "BUG ▸ " } else { "      " },
                if is_broken { red } else { dim },
            ),
            Span::styled(*source, if is_broken { red } else { white }),
        ]));
    }
    if game.hint_shown() {
        body.push(Line::from(""));
        body.push(Line::from(vec![
            Span::styled("HINT  ", yellow),
            Span::styled(puzzle.hint, dim),
        ]));
    }
    body.push(Line::from(""));
    body.push(Line::from(vec![
        Span::styled("FIX ▸ ", green),
        Span::styled(format!("{}▌", game.input()), white),
    ]));
    if let Some(message) = app.daily_code_message() {
        body.push(Line::styled(message.to_string(), yellow));
    }
    let width = puzzle
        .lines
        .iter()
        .map(|line| line.chars().count() + 9)
        .chain(std::iter::once(game.input().chars().count() + 7))
        .max()
        .unwrap_or(1)
        .min(inner.width as usize) as u16;
    frame.render_widget(
        Paragraph::new(body),
        centered(rows[1], width, rows[1].height),
    );
    frame.render_widget(
        Paragraph::new(Line::styled(
            "TYPE FIX    ⌫ DELETE    ENTER SUBMIT    ESC MENU",
            dim,
        ))
        .alignment(Alignment::Center),
        rows[2],
    );
    frame.render_widget(block, area);
}

fn render_ranked_match(frame: &mut Frame, app: &App) {
    let area = frame.area();
    let title = Style::new().fg(Color::Magenta).add_modifier(Modifier::BOLD);
    let dim = Style::new().fg(Color::DarkGray);
    let green = Style::new().fg(Color::Green).add_modifier(Modifier::BOLD);
    let white = Style::new().fg(Color::White);
    let mut lines = vec![Line::styled("RANKED 1v1", title), Line::from("")];
    let state = app.ranked_match();
    match state {
        Some(state) if state.status == "waiting" => {
            lines.push(Line::styled("FINDING AN OPPONENT", green));
            lines.push(Line::from(""));
            lines.push(Line::styled(
                "Matching you with a similarly skilled developer…",
                dim,
            ));
        }
        Some(state) if state.status == "active" => {
            lines.push(Line::styled(
                format!(
                    "MATCHED AGAINST @{}",
                    state.opponent.as_deref().unwrap_or("PLAYER")
                ),
                green,
            ));
            lines.push(Line::styled(
                "Solve the highlighted line first to win.",
                dim,
            ));
            lines.push(Line::from(""));
            if let Some(puzzle) = &state.puzzle {
                lines.push(Line::styled(
                    puzzle.title.clone(),
                    white.add_modifier(Modifier::BOLD),
                ));
                for (index, source) in puzzle.snippet.iter().enumerate() {
                    let marker = if index == puzzle.buggy_line {
                        "▸ "
                    } else {
                        "  "
                    };
                    let style = if index == puzzle.buggy_line {
                        Style::new().fg(Color::Yellow)
                    } else {
                        dim
                    };
                    lines.push(Line::styled(format!("{marker}{source}"), style));
                }
                lines.push(Line::from(""));
                lines.push(Line::from(vec![
                    Span::styled("FIX ▸ ", green),
                    Span::styled(format!("{}▌", app.ranked_answer()), white),
                ]));
                lines.push(Line::styled(
                    format!("WRONG SUBMISSIONS {}", app.ranked_attempts()),
                    dim,
                ));
            }
        }
        Some(state) if state.status == "completed" => {
            let message = match state.result.as_deref() {
                Some("won") => "YOU WON  +100 MATCH POINTS",
                Some("lost") => "MATCH LOST  —  QUEUE AGAIN TO REMATCH",
                _ => "MATCH COMPLETE",
            };
            lines.push(Line::styled(message, green));
            lines.push(Line::from(""));
            lines.push(Line::styled("Press ENTER to find another opponent.", dim));
        }
        _ => {
            lines.push(Line::styled("RANKED MATCH QUEUE", green));
            lines.push(Line::from(""));
            lines.push(Line::styled(
                "Sign in to find an opponent and submit ranked results.",
                dim,
            ));
            lines.push(Line::styled(
                "Press ENTER to retry. ESC returns to the menu.",
                dim,
            ));
        }
    }
    if let Some(message) = app.ranked_message() {
        lines.push(Line::from(""));
        lines.push(Line::styled(message.to_string(), dim));
    }
    lines.push(Line::from(""));
    lines.push(Line::styled("ENTER SUBMIT / QUEUE AGAIN    ESC BACK", dim));
    let height = (lines.len() as u16).min(area.height);
    frame.render_widget(
        Paragraph::new(lines).alignment(Alignment::Center),
        centered(area, area.width.min(88), height),
    );
}

fn render_leaderboard(frame: &mut Frame, app: &App) {
    let area = frame.area();
    let title = Style::new().fg(Color::Magenta).add_modifier(Modifier::BOLD);
    let dim = Style::new().fg(Color::DarkGray);
    let green = Style::new().fg(Color::Green);
    let mut lines = vec![
        Line::styled("MATCH-POINT LEADERBOARD", title),
        Line::from(""),
    ];
    match app.online_leaderboard() {
        OnlineLeaderboard::NotLoaded | OnlineLeaderboard::Loading => {
            lines.push(Line::styled("Loading leaderboard…", dim));
        }
        OnlineLeaderboard::Unavailable => {
            lines.push(Line::styled("Leaderboard unavailable.", dim));
            lines.push(Line::styled(
                "You can still solve the daily puzzle offline.",
                dim,
            ));
        }
        OnlineLeaderboard::Available(board) => {
            lines.push(Line::styled(
                "  #   Developer                    MATCH POINTS",
                dim,
            ));
            for entry in &board.entries {
                lines.push(Line::from(format!(
                    "{:>3}   {:<24} {:>8}",
                    entry.rank,
                    entry.user.display_name,
                    format_score(entry.points.max(0) as u64),
                )));
            }
            if let Some(name) = app.online_username() {
                lines.push(Line::from(""));
                lines.push(Line::styled(format!("SIGNED IN AS @{name}"), green));
            }
        }
    }
    lines.push(Line::from(""));
    lines.push(Line::styled("[ ESC ] BACK", dim));
    frame.render_widget(
        Paragraph::new(lines).alignment(Alignment::Center),
        centered(area, area.width, area.height.min(18)),
    );
}

fn render_profile(frame: &mut Frame, app: &App) {
    let area = frame.area();
    let title = Style::new().fg(Color::Magenta).add_modifier(Modifier::BOLD);
    let dim = Style::new().fg(Color::DarkGray);
    let value = Style::new().fg(Color::White).add_modifier(Modifier::BOLD);
    let mut lines = vec![Line::styled("YOUR PROFILE", title), Line::from("")];
    match app.profile() {
        ProfileState::NotLoaded | ProfileState::Loading => {
            lines.push(Line::styled("Loading profile…", dim));
        }
        ProfileState::Unavailable(message) => {
            lines.push(Line::styled(message.clone(), dim));
        }
        ProfileState::Available(profile) => {
            lines.push(Line::styled(
                format!("{}  (@{})", profile.display_name, profile.username),
                value,
            ));
            lines.push(Line::from(""));
            lines.push(Line::from(vec![
                Span::styled("DAILY RANK       ", dim),
                Span::styled(format_rank(profile.stats.daily_rank), value),
            ]));
            lines.push(Line::from(vec![
                Span::styled("WEEKLY RANK      ", dim),
                Span::styled(format_rank(profile.stats.weekly_rank), value),
            ]));
            lines.push(Line::from(vec![
                Span::styled("GLOBAL RANK      ", dim),
                Span::styled(format_rank(profile.stats.global_rank), value),
            ]));
            lines.push(Line::from(vec![
                Span::styled("MATCH POINTS     ", dim),
                Span::styled(format_score(u64::from(profile.stats.match_points)), value),
            ]));
            lines.push(Line::from(vec![
                Span::styled("RANKED RECORD    ", dim),
                Span::styled(
                    format!(
                        "{} W  /  {} L",
                        profile.stats.ranked_wins, profile.stats.ranked_losses
                    ),
                    value,
                ),
            ]));
        }
    }
    lines.push(Line::from(""));
    lines.push(Line::styled("[ ESC ] BACK", dim));
    let height = (lines.len() as u16).min(area.height);
    frame.render_widget(
        Paragraph::new(lines).alignment(Alignment::Center),
        centered(area, area.width.min(64), height),
    );
}

fn format_rank(rank: Option<u32>) -> String {
    rank.map_or_else(|| "unranked".into(), |rank| format!("#{rank}"))
}

fn render_game(frame: &mut Frame, app: &App) {
    let Some(ActiveGame::DailyCode(game)) = app.game() else {
        render_menu(frame, app);
        return;
    };
    render_daily_puzzle(frame, app, game);
    match app.state {
        AppState::PausedManual => render_paused(frame, frame.area(), app),
        AppState::GameOver => render_game_over(frame, frame.area(), app, game),
        _ => {}
    }
}

fn render_paused(frame: &mut Frame, area: Rect, _app: &App) {
    let lines = vec![
        Line::styled(
            "PAUSED",
            Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD),
        ),
        Line::from(""),
        Line::styled("P resume    ESC menu", Style::new().fg(Color::DarkGray)),
    ];
    let rect = centered(area, 40, lines.len() as u16 + 2);
    frame.render_widget(Clear, rect);
    let block = Block::bordered().border_style(Style::new().fg(Color::Yellow));
    let inner = block.inner(rect);
    frame.render_widget(Paragraph::new(lines).alignment(Alignment::Center), inner);
    frame.render_widget(block, rect);
}

fn render_game_over(frame: &mut Frame, area: Rect, app: &App, game: &DailyCodePuzzle) {
    let mut lines = vec![
        Line::styled(
            "PUZZLE SOLVED",
            Style::new().fg(Color::Green).add_modifier(Modifier::BOLD),
        ),
        Line::from(""),
        Line::styled(
            format!("TIME  {}", format_elapsed(game.total_seconds())),
            Style::new().fg(Color::White),
        ),
        Line::styled(
            format!("ATTEMPTS  {}", game.attempts()),
            Style::new().fg(Color::DarkGray),
        ),
        Line::styled(game.bug().explainer, Style::new().fg(Color::DarkGray)),
    ];
    if app.is_new_record() {
        lines.push(Line::styled(
            "NEW DAILY BEST!",
            Style::new().fg(Color::Green).add_modifier(Modifier::BOLD),
        ));
    }
    if app.mvp_just_set() {
        lines.push(Line::styled(
            "DAILY MVP!",
            Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD),
        ));
    }
    lines.push(Line::from(""));
    lines.push(Line::styled("[ESC] MENU", Style::new().fg(Color::DarkGray)));
    let rect = centered(area, 48, lines.len() as u16 + 2);
    frame.render_widget(Clear, rect);
    let block = Block::bordered().border_style(Style::new().fg(Color::Green));
    let inner = block.inner(rect);
    frame.render_widget(Paragraph::new(lines).alignment(Alignment::Center), inner);
    frame.render_widget(block, rect);
}

fn render_too_small(frame: &mut Frame, app: &App) {
    let (cols, rows) = app.terminal_size().unwrap_or((0, 0));
    let lines = vec![
        Line::styled(
            "TERMINAL TOO SMALL",
            Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD),
        ),
        Line::from(""),
        Line::from("MVP requires at least 60×20."),
        Line::from(format!("Current size: {cols}×{rows}")),
        Line::from("Resize the terminal to keep playing."),
    ];
    frame.render_widget(
        Paragraph::new(lines).alignment(Alignment::Center),
        centered(frame.area(), frame.area().width, 6),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::HighScoreStore;
    use crate::event::AppInput;
    use ratatui::Terminal;
    use ratatui::backend::TestBackend;

    fn test_app() -> App {
        let path = std::env::temp_dir().join(format!("mvp_ui_test_{}.json", uuid::Uuid::new_v4()));
        let mut app = App::new(HighScoreStore::load(path));
        app.set_terminal_size(100, 30);
        app
    }

    fn render_text(app: &App) -> String {
        let backend = TestBackend::new(100, 30);
        let mut terminal = Terminal::new(backend).unwrap();
        terminal.draw(|frame| render(frame, app)).unwrap();
        let buffer = terminal.backend().buffer();
        let mut text = String::new();
        for y in 0..buffer.area.height {
            for x in 0..buffer.area.width {
                text.push_str(buffer[(x, y)].symbol());
            }
            text.push('\n');
        }
        text
    }

    #[test]
    fn mode_menu_contains_only_the_daily_puzzle_and_ranked_duel() {
        let mut app = test_app();
        app.handle_input(AppInput::Confirm);
        let text = render_text(&app);
        assert!(text.contains("Daily Code Puzzle"));
        assert!(text.contains("Ranked 1v1"));
    }

    #[test]
    fn daily_code_mode_renders_the_broken_line_and_input() {
        let mut app = test_app();
        app.start_game_of(GameKind::DailyCode);
        let text = render_text(&app);
        assert!(text.contains("DAILY CODE PUZZLE"));
        assert!(text.contains("BUG ▸"));
        assert!(text.contains("FIX ▸"));
        assert!(text.contains("TYPE FIX"));
    }

    #[test]
    fn ranked_mode_renders_matchmaking_and_company_neutral_match_points() {
        let mut app = test_app();
        app.start_game_of(GameKind::RankedMatch);
        let text = render_text(&app);
        assert!(text.contains("RANKED 1v1"));
        assert!(text.contains("Sign in to find an opponent"));
    }

    #[test]
    fn profile_screen_renders_online_competition_stats() {
        let mut app = test_app();
        let (commands, _) = std::sync::mpsc::channel();
        app.configure_online(commands, Some("coder".into()));
        app.handle_input(AppInput::Account);
        let profile = serde_json::from_value::<crate::api::OnlineProfile>(serde_json::json!({
            "id": uuid::Uuid::nil(),
            "username": "coder",
            "display_name": "Coder",
            "avatar_url": null,
            "stats": {
                "daily_rank": 2,
                "weekly_rank": 3,
                "global_rank": 4,
                "match_points": 1250,
                "ranked_wins": 5,
                "ranked_losses": 2
            }
        }))
        .unwrap();
        app.handle_online_event(crate::api::WorkerEvent::Profile(Ok(profile)));

        let text = render_text(&app);
        assert!(text.contains("YOUR PROFILE"));
        assert!(text.contains("Coder  (@coder)"));
        assert!(text.contains("MATCH POINTS"));
        assert!(text.contains("1,250"));
        assert!(text.contains("5 W  /  2 L"));
    }
}
