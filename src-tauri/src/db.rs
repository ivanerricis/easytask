//! `db_transaction`: several statements run atomically on the SQLite pool of tauri-plugin-sql.

/// One statement of a `db_transaction` call.
#[derive(serde::Deserialize)]
pub(crate) struct Stmt {
    sql: String,
    #[serde(default)]
    params: Vec<serde_json::Value>,
}

/// Outcome of one statement of a `db_transaction` call (camelCase, like the JS side expects).
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StmtResult {
    rows_affected: u64,
    last_insert_id: i64,
}

/// Resolves a `{ "$ref": n, "offset": k }` parameter to `results[n].lastInsertId - k`.
/// Returns None when the value is not a reference object.
fn resolve_ref(value: &serde_json::Value, results: &[StmtResult]) -> Option<Result<i64, String>> {
    let object = value.as_object()?;
    let reference = object.get("$ref")?;
    let index = match reference.as_u64() {
        Some(index) => index as usize,
        None => return Some(Err("$ref must be a non-negative integer".to_string())),
    };
    let offset = object.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);
    Some(match results.get(index) {
        Some(result) => Ok(result.last_insert_id - offset),
        None => Err(format!(
            "$ref {index} does not point to an earlier statement"
        )),
    })
}

/// Runs the statements atomically on `pool`: all share one connection inside a transaction, which is
/// committed if every statement succeeds and rolled back (by dropping it) on the first error.
async fn run_transaction(
    pool: &sqlx::SqlitePool,
    statements: &[Stmt],
) -> Result<Vec<StmtResult>, String> {
    use sqlx::Executor;

    let mut tx = pool
        .begin()
        .await
        .map_err(|error| format!("cannot start the transaction: {error}"))?;
    let mut results: Vec<StmtResult> = Vec::with_capacity(statements.len());

    for (index, statement) in statements.iter().enumerate() {
        let mut query = sqlx::query(&statement.sql);
        for value in &statement.params {
            if let Some(resolved) = resolve_ref(value, &results) {
                let id = resolved.map_err(|error| format!("statement {index}: {error}"))?;
                query = query.bind(id);
                continue;
            }
            query = match value {
                serde_json::Value::Null => query.bind(None::<i64>),
                serde_json::Value::Bool(flag) => query.bind(*flag),
                serde_json::Value::String(text) => query.bind(text.as_str()),
                serde_json::Value::Number(number) => match number.as_i64() {
                    Some(integer) => query.bind(integer),
                    None => query.bind(number.as_f64().unwrap_or_default()),
                },
                other => query.bind(other.to_string()),
            };
        }
        // On error `tx` is dropped, which rolls the transaction back.
        let outcome = tx
            .execute(query)
            .await
            .map_err(|error| format!("statement {index} failed: {error}"))?;
        results.push(StmtResult {
            rows_affected: outcome.rows_affected(),
            last_insert_id: outcome.last_insert_rowid(),
        });
    }

    tx.commit()
        .await
        .map_err(|error| format!("commit failed: {error}"))?;
    Ok(results)
}

/// Runs several statements atomically on the pool loaded by tauri-plugin-sql (same `db` key passed to
/// `Database.load`). See `run_transaction`.
#[tauri::command]
pub(crate) async fn db_transaction(
    db_instances: tauri::State<'_, tauri_plugin_sql::DbInstances>,
    db: String,
    statements: Vec<Stmt>,
) -> Result<Vec<StmtResult>, String> {
    // Clone the pool out of the map: the read guard must not live across the whole transaction (it would block
    // load/close of databases meanwhile)
    let pool = {
        let instances = db_instances.0.read().await;
        match instances.get(&db) {
            Some(tauri_plugin_sql::DbPool::Sqlite(pool)) => pool.clone(),
            None => return Err(format!("database {db} is not loaded")),
        }
    };
    run_transaction(&pool, &statements).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use sqlx::sqlite::SqlitePoolOptions;

    fn results(ids: &[i64]) -> Vec<StmtResult> {
        ids.iter()
            .map(|id| StmtResult {
                rows_affected: 1,
                last_insert_id: *id,
            })
            .collect()
    }

    #[test]
    fn resolve_ref_valid() {
        let out = resolve_ref(&json!({ "$ref": 1 }), &results(&[5, 9]));
        assert_eq!(out, Some(Ok(9)));
    }

    #[test]
    fn resolve_ref_with_offset() {
        let out = resolve_ref(&json!({ "$ref": 0, "offset": 2 }), &results(&[10]));
        assert_eq!(out, Some(Ok(8)));
    }

    #[test]
    fn resolve_ref_index_out_of_range() {
        let out = resolve_ref(&json!({ "$ref": 3 }), &results(&[1]));
        assert!(matches!(out, Some(Err(_))));
    }

    #[test]
    fn resolve_ref_non_integer() {
        for value in [
            json!({ "$ref": "0" }),
            json!({ "$ref": -1 }),
            json!({ "$ref": 1.5 }),
        ] {
            assert!(matches!(
                resolve_ref(&value, &results(&[1, 2])),
                Some(Err(_))
            ));
        }
    }

    #[test]
    fn resolve_ref_non_reference_values() {
        let r = results(&[1]);
        assert_eq!(resolve_ref(&json!(3), &r), None);
        assert_eq!(resolve_ref(&json!("x"), &r), None);
        assert_eq!(resolve_ref(&json!({ "other": 1 }), &r), None);
    }

    async fn memory_pool() -> sqlx::SqlitePool {
        // One connection only: every in-memory connection would otherwise be a separate database.
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL, parent INTEGER)")
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    fn stmt(sql: &str, params: Vec<serde_json::Value>) -> Stmt {
        Stmt {
            sql: sql.to_string(),
            params,
        }
    }

    async fn count(pool: &sqlx::SqlitePool) -> i64 {
        sqlx::query_scalar("SELECT COUNT(*) FROM t")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[test]
    fn run_transaction_commits_and_resolves_refs() {
        tauri::async_runtime::block_on(async {
            let pool = memory_pool().await;
            let statements = [
                stmt("INSERT INTO t (v) VALUES (?)", vec![json!("a")]),
                stmt(
                    "INSERT INTO t (v, parent) VALUES (?, ?)",
                    vec![json!("b"), json!({ "$ref": 0 })],
                ),
            ];
            let out = run_transaction(&pool, &statements).await.unwrap();
            assert_eq!(out.len(), 2);
            assert_eq!(out[0].rows_affected, 1);
            assert_eq!(count(&pool).await, 2);
            let parent: i64 = sqlx::query_scalar("SELECT parent FROM t WHERE v = 'b'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(parent, out[0].last_insert_id);
        });
    }

    #[test]
    fn run_transaction_rolls_back_on_error() {
        tauri::async_runtime::block_on(async {
            let pool = memory_pool().await;
            let statements = [
                stmt("INSERT INTO t (v) VALUES (?)", vec![json!("a")]),
                // NOT NULL violation
                stmt("INSERT INTO t (v) VALUES (?)", vec![json!(null)]),
            ];
            let error = run_transaction(&pool, &statements).await.unwrap_err();
            assert!(error.contains("statement 1"), "{error}");
            assert_eq!(count(&pool).await, 0);
        });
    }
}
