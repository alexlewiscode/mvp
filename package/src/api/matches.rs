use serde::{Deserialize, Serialize};

use super::auth::Session;
use super::{ApiClient, ApiError};

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct DailyPuzzle {
    pub id: String,
    pub date: String,
    pub version: i32,
    pub title: String,
    pub language: String,
    pub snippet: Vec<String>,
    pub buggy_line: usize,
    pub difficulty: u8,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct DailyCodeAttempt {
    pub date: String,
    pub started_at: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct RankedMatchState {
    #[serde(default)]
    pub match_id: Option<String>,
    pub status: String,
    #[serde(default)]
    pub puzzle_date: Option<String>,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub opponent: Option<String>,
    #[serde(default)]
    pub puzzle: Option<DailyPuzzle>,
    #[serde(default)]
    pub result: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct MatchSubmission {
    pub correct: bool,
    #[serde(default)]
    pub attempts: Option<u32>,
    #[serde(default)]
    pub penalty_ms: Option<u64>,
    #[serde(default)]
    pub result: Option<String>,
    #[serde(default)]
    pub points_awarded: Option<u32>,
}

#[derive(Serialize)]
struct MatchAnswer<'a> {
    answer: &'a str,
    attempts: u32,
}

impl ApiClient {
    pub async fn claim_daily_code_attempt(
        &self,
        session: &Session,
    ) -> Result<DailyCodeAttempt, ApiError> {
        self.post(
            "/v1/puzzles/daily/attempt",
            Some(session.token()),
            None::<&serde_json::Value>,
        )
        .await
    }

    pub async fn join_ranked_queue(&self, session: &Session) -> Result<RankedMatchState, ApiError> {
        let _: serde_json::Value = self
            .post(
                "/v1/matches/queue",
                Some(session.token()),
                None::<&serde_json::Value>,
            )
            .await?;
        self.current_ranked_match(session).await
    }

    pub async fn current_ranked_match(
        &self,
        session: &Session,
    ) -> Result<RankedMatchState, ApiError> {
        self.get("/v1/matches/current", Some(session.token())).await
    }

    pub async fn leave_ranked_queue(&self, session: &Session) -> Result<(), ApiError> {
        self.delete_empty("/v1/matches/queue", Some(session.token()))
            .await
    }

    pub async fn submit_ranked_answer(
        &self,
        session: &Session,
        match_id: &str,
        answer: &str,
        attempts: u32,
    ) -> Result<MatchSubmission, ApiError> {
        self.post(
            &format!("/v1/matches/{match_id}/submit"),
            Some(session.token()),
            Some(&MatchAnswer { answer, attempts }),
        )
        .await
    }
}
