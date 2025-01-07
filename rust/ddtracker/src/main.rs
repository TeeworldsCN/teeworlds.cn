use std::str::FromStr;

use chrono::Utc;
use cron::Schedule;
use reqwest::Client;
use rusqlite::{params, Connection, Transaction};
use serde_json::{Map, Value};
use tokio::time::Duration;

const SERVERS_URL: &str = "https://master1.ddnet.org/ddnet/15/servers.json";
const CRON_EXPRESSION: &str = "0 * * * * *";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut conn = Connection::open("./cache/ddtracker.db")?;
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS info (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS clients (name TEXT, region TEXT, current_skin TEXT, current_skin_time INTEGER, PRIMARY KEY (name, region));
        CREATE INDEX IF NOT EXISTS clients_name_region ON clients (name, region);
        CREATE INDEX IF NOT EXISTS clients_name ON clients (name);
        "
    )?;

    let client = Client::new();
    let schedule = Schedule::from_str(CRON_EXPRESSION).expect("Failed to parse CRON expression");

    loop {
        let now = Utc::now();
        if let Some(next) = schedule.upcoming(Utc).take(1).next() {
            let until_next = next - now;
            tokio::time::sleep(Duration::from_millis(until_next.num_milliseconds() as u64)).await;
            task(&client, &mut conn).await?;
        }
    }
}

async fn task(client: &Client, conn: &mut Connection) -> Result<(), Box<dyn std::error::Error>> {
    let now = chrono::Utc::now().timestamp() / 60;
    let response = client.get(SERVERS_URL).send().await?;
    let body = response.text().await;
    match body {
        Ok(body) => {
            let servers_data: Value = serde_json::from_str(&body)?;

            let tx = conn.transaction()?;

            fn client_update_stmt<'b>(
                tx: &'b Transaction<'b>,
                name: &str,
                region: &str,
                current_skin: &str,
                current_skin_time: i64,
            ) {
                let mut stmt = tx
            .prepare(
                "INSERT OR REPLACE INTO clients (name, region, current_skin, current_skin_time) VALUES (?, ?, ?, ?)",
            )
            .unwrap();
                stmt.execute(params![name, region, current_skin, current_skin_time])
                    .unwrap();
            }

            fn client_update_skin_time<'b>(
                tx: &'b Transaction<'b>,
                name: &str,
                region: &str,
                current_skin_time: i64,
            ) {
                let mut stmt = tx
                    .prepare("UPDATE clients SET current_skin_time = ? WHERE name = ? AND region = ?")
                    .unwrap();
                stmt.execute(params![current_skin_time, name, region])
                    .unwrap();
            }

            fn client_get_stmt<'a>(
                tx: &'a Transaction<'a>,
                name: &str,
                region: &str,
            ) -> Result<(String, i64), rusqlite::Error> {
                let mut stmt = tx
            .prepare(
                "SELECT current_skin, current_skin_time FROM clients WHERE name = ? AND region = ?",
            )
            .unwrap();
                return stmt.query_row(params![name, region], |row| {
                    let current_skin: String = row.get(0)?;
                    let current_skin_time: i64 = row.get(1)?;
                    Ok((current_skin, current_skin_time))
                });
            }

            fn update_time_info_stmt<'a>(tx: &'a Transaction<'a>, time: i64) {
                let mut stmt = tx
                    .prepare("INSERT OR REPLACE INTO info (key, value) VALUES (?, ?)")
                    .unwrap();
                stmt.execute(params!["last_update", time]).unwrap();
            }

            // first pass, check if the same skin is in use and update the skin time
            if let Some(servers) = servers_data["servers"].as_array() {
                for server in servers {
                    if let (Some(info), Some(location)) =
                        (server["info"].as_object(), server["location"].as_str())
                    {
                        if let Some(clients) = info["clients"].as_array() {
                            for client in clients {
                                if let (Some(name), Some(skin_info)) =
                                    (client["name"].as_str(), client["skin"].as_object())
                                {
                                    let mut skin = Map::new();
                                    if let Some(name) = skin_info.get("name") {
                                        skin.insert("n".to_string(), name.clone());
                                    }

                                    if let Some(color_body) = skin_info.get("color_body") {
                                        skin.insert("b".to_string(), color_body.clone());
                                    }

                                    if let Some(color_feet) = skin_info.get("color_feet") {
                                        skin.insert("f".to_string(), color_feet.clone());
                                    }
                                    let skin = Value::Object(skin);
                                    let skin_data = skin.to_string();

                                    if let Ok((current_skin, _current_skin_time)) =
                                        client_get_stmt(&tx, &name, &location)
                                    {
                                        if current_skin == skin_data {
                                            // same skin, update the skin time
                                            client_update_skin_time(&tx, &name, &location, now);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // second pass, update the skin if the current skin has not been seen in the last 30 minutes
            if let Some(servers) = servers_data["servers"].as_array() {
                for server in servers {
                    if let (Some(info), Some(location)) =
                        (server["info"].as_object(), server["location"].as_str())
                    {
                        if let Some(clients) = info["clients"].as_array() {
                            for client in clients {
                                if let (Some(name), Some(skin_info)) =
                                    (client["name"].as_str(), client["skin"].as_object())
                                {
                                    let mut skin = Map::new();
                                    if let Some(name) = skin_info.get("name") {
                                        skin.insert("n".to_string(), name.clone());
                                    }

                                    if let Some(color_body) = skin_info.get("color_body") {
                                        skin.insert("b".to_string(), color_body.clone());
                                    }

                                    if let Some(color_feet) = skin_info.get("color_feet") {
                                        skin.insert("f".to_string(), color_feet.clone());
                                    }
                                    let skin = Value::Object(skin);
                                    let skin_data = skin.to_string();
                                    if let Ok((current_skin, current_skin_time)) =
                                        client_get_stmt(&tx, &name, &location)
                                    {
                                        if current_skin != skin_data && current_skin_time + 30 < now
                                        {
                                            client_update_stmt(
                                                &tx,
                                                name,
                                                location,
                                                skin_data.as_str(),
                                                now,
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                update_time_info_stmt(&tx, now);
                tx.commit()?;
            }
        }
        Err(_) => {
            // failed to fetch the server list, ignore
        }
    }
    Ok(())
}
