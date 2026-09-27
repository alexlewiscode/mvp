//! Command-line interface for MVP.

use clap::{Parser, Subcommand, ValueEnum};

#[derive(Debug, Parser)]
#[command(
    name = "mvp",
    version,
    about = "Most Valued Programmer — compete with coders from your terminal"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Run the terminal games (the default command)
    Play,
    /// Sign in through the MVP website
    Login {
        /// Use GitHub Device Flow instead of browser handoff
        #[arg(long, conflicts_with = "email")]
        github: bool,
        /// Use an email magic link instead of browser handoff
        #[arg(long, value_name = "ADDRESS", conflicts_with = "github")]
        email: Option<String>,
    },
    /// Revoke the MVP session and remove it from the credential store
    Logout,
    /// Show the local player and online identity
    Whoami,
    /// Show online ranks and game statistics
    Profile,
    /// Show a global MVP leaderboard (daily by default)
    Leaderboard {
        /// Board to display
        #[arg(value_enum, default_value_t = LeaderboardKind::Daily)]
        board: LeaderboardKind,
    },
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, ValueEnum)]
pub enum LeaderboardKind {
    #[default]
    Daily,
    Weekly,
    AllTime,
    StackOverflow,
    DailyPr,
    DailyFix,
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    #[test]
    fn bare_invocation_runs_the_game() {
        let cli = Cli::try_parse_from(["mvp"]).unwrap();
        assert!(cli.command.is_none());
    }

    #[test]
    fn help_uses_mvp_branding_without_agent_integrations() {
        let mut command = Cli::command();
        assert_eq!(command.get_name(), "mvp");
        let help = command.render_long_help().to_string();
        assert!(help.contains("compete with coders"));
        for removed in ["claude", "codex", "gemini", "opencode", "integrations"] {
            assert!(!help.to_ascii_lowercase().contains(removed));
        }
    }

    #[test]
    fn online_commands_parse() {
        assert!(matches!(
            Cli::try_parse_from(["mvp", "login"]).unwrap().command,
            Some(Command::Login {
                github: false,
                email: None
            })
        ));
        assert!(matches!(
            Cli::try_parse_from(["mvp", "leaderboard"]).unwrap().command,
            Some(Command::Leaderboard {
                board: LeaderboardKind::Daily
            })
        ));
        assert!(Cli::try_parse_from(["mvp", "claude", "install"]).is_err());
        assert!(Cli::try_parse_from(["mvp", "integrations"]).is_err());
    }
}
