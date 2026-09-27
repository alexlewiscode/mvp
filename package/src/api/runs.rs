use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::{ApiClient, ApiError, Session};
use crate::game::CompletedRun;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GameId {
    DailyCode,
}

impl GameId {
    pub fn as_str(self) -> &'static str {
        "daily_code"
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Challenge {
    pub date: String,
    pub version: i32,
    pub id: String,
}

pub type RunResult = Map<String, Value>;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct RunPayload {
    pub client_run_id: uuid::Uuid,
    pub game_id: GameId,
    pub raw_score: i32,
    pub duration_ms: u32,
    pub client_version: String,
    pub result: RunResult,
    pub challenge: Challenge,
}

impl RunPayload {
    pub fn from_completed(completed: &CompletedRun) -> Result<Self, ApiError> {
        match completed {
            CompletedRun::DailyCode {
                day,
                charged_duration_ms,
                duration_ms,
                attempts,
                hint_used,
                answer,
            } => {
                let mut result = Map::new();
                result.insert("solved".into(), Value::Bool(true));
                result.insert("attempts".into(), Value::from(*attempts));
                result.insert("hint_used".into(), Value::Bool(*hint_used));
                result.insert("answer".into(), Value::String(answer.clone()));
                Self::new(
                    checked_i32(*charged_duration_ms, "charged duration")?,
                    checked_u32(*duration_ms, "duration")?,
                    result,
                    challenge(*day)?,
                )
            }
        }
    }

    pub fn new(
        raw_score: i32,
        duration_ms: u32,
        result: RunResult,
        challenge: Challenge,
    ) -> Result<Self, ApiError> {
        let payload = Self {
            client_run_id: uuid::Uuid::new_v4(),
            game_id: GameId::DailyCode,
            raw_score,
            duration_ms,
            client_version: env!("CARGO_PKG_VERSION").into(),
            result,
            challenge,
        };
        payload.validate()?;
        Ok(payload)
    }

    pub fn validate(&self) -> Result<(), ApiError> {
        let invalid = |message: &str| ApiError::Validation {
            code: "invalid_run".into(),
            message: message.into(),
        };
        if self.raw_score < 0 {
            return Err(invalid("raw_score must be non-negative"));
        }
        if self.duration_ms > 3_600_000 {
            return Err(invalid("daily_code duration exceeds one hour"));
        }
        if self.client_version.is_empty() || self.client_version.len() > 64 {
            return Err(invalid("client_version must contain 1..64 bytes"));
        }
        let solved = self.result.get("solved").and_then(Value::as_bool);
        let attempts = self.result.get("attempts").and_then(Value::as_u64);
        let answer = self.result.get("answer").and_then(Value::as_str);
        let hint_used = self.result.get("hint_used").and_then(Value::as_bool);
        if solved != Some(true)
            || attempts.is_none_or(|value| value > 20)
            || answer.is_none_or(str::is_empty)
            || hint_used != Some(attempts.unwrap_or(0) >= 2)
        {
            return Err(invalid("daily_code completion metrics are invalid"));
        }
        let penalty = attempts.unwrap_or(0) * 5_000 + u64::from(hint_used == Some(true)) * 15_000;
        if u64::from(self.duration_ms) + penalty != self.raw_score as u64 {
            return Err(invalid(
                "daily_code score must equal elapsed time and penalties",
            ));
        }
        Ok(())
    }
}

fn checked_i32(value: u64, name: &str) -> Result<i32, ApiError> {
    i32::try_from(value).map_err(|_| ApiError::Validation {
        code: "invalid_run".into(),
        message: format!("{name} is too large"),
    })
}

fn checked_u32(value: u64, name: &str) -> Result<u32, ApiError> {
    u32::try_from(value).map_err(|_| ApiError::Validation {
        code: "invalid_run".into(),
        message: format!("{name} is too large"),
    })
}

fn challenge(day: u64) -> Result<Challenge, ApiError> {
    let seconds = day
        .checked_mul(86_400)
        .ok_or_else(|| ApiError::Validation {
            code: "invalid_challenge".into(),
            message: "challenge day is out of range".into(),
        })?;
    let seconds = i64::try_from(seconds).map_err(|_| ApiError::Validation {
        code: "invalid_challenge".into(),
        message: "challenge day is out of range".into(),
    })?;
    let date = chrono::DateTime::<chrono::Utc>::from_timestamp(seconds, 0)
        .ok_or_else(|| ApiError::Validation {
            code: "invalid_challenge".into(),
            message: "challenge day is out of range".into(),
        })?
        .format("%Y-%m-%d")
        .to_string();
    Ok(Challenge {
        id: format!("daily_code:v1:{date}"),
        date,
        version: 1,
    })
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct SubmittedRun {
    pub id: uuid::Uuid,
    pub client_run_id: uuid::Uuid,
    pub game_id: GameId,
    pub challenge_date: String,
    pub challenge_version: Option<i32>,
    pub challenge_id: Option<String>,
    pub raw_score: i32,
    pub normalized_score: i32,
    pub result: RunResult,
    pub duration_ms: u32,
    pub client_version: String,
    pub normalization_version: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl ApiClient {
    pub async fn submit_run(
        &self,
        session: &Session,
        run: &RunPayload,
    ) -> Result<SubmittedRun, ApiError> {
        run.validate()?;
        self.post("/v1/runs", Some(session.token()), Some(run))
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn daily_code_payload_has_only_the_current_game_contract() {
        let day = chrono::Utc
            .with_ymd_and_hms(2026, 8, 20, 0, 0, 0)
            .unwrap()
            .timestamp() as u64
            / 86_400;
        let completed = CompletedRun::DailyCode {
            day,
            charged_duration_ms: 60_000,
            duration_ms: 35_000,
            attempts: 2,
            hint_used: true,
            answer: "    (a + b) / 2".into(),
        };
        let run = RunPayload::from_completed(&completed).unwrap();
        assert_eq!(run.game_id, GameId::DailyCode);
        assert_eq!(run.raw_score, 60_000);
        assert_eq!(run.duration_ms, 35_000);
        assert_eq!(run.result["attempts"], 2);
        assert_eq!(run.result["hint_used"], true);
        assert_eq!(run.result["answer"], "    (a + b) / 2");
        assert_eq!(run.challenge.id, "daily_code:v1:2026-08-20");

        let value = serde_json::to_value(run).unwrap();
        assert_eq!(value["game_id"], "daily_code");
        assert_eq!(value["challenge"]["version"], 1);
    }
}
