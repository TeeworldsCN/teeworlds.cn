use std::str::FromStr;

use chrono::Utc;
use cron::Schedule;
use indexmap::IndexMap;
use reqwest::Client;
use rusqlite::{params, Connection, Transaction};
use serde_json::{json, Map, Value};
use tokio::time::Duration;
use uuid::Uuid;

const SERVERS_URL: &str = "https://master1.ddnet.org/ddnet/15/servers.json";
const CRON_EXPRESSION: &str = "0 * * * * *";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut conn = Connection::open("./cache/ddtracker.db")?;
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS info (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS servers (addr TEXT PRIMARY KEY, server TEXT, last_seen INTEGER);
        CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, name TEXT, region TEXT, current_skin TEXT, skin_history TEXT);
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
    let body = response.text().await?;
    let servers_data: Value = serde_json::from_str(&body)?;

    let tx = conn.transaction()?;

    fn server_update_stmt<'a>(tx: &'a Transaction<'a>, addr: &str, server: &str, last_seen: i64) {
        let mut stmt = tx
            .prepare("INSERT OR REPLACE INTO servers (addr, server, last_seen) VALUES (?, ?, ?)")
            .unwrap();
        stmt.execute(params![addr, server, last_seen]).unwrap();
    }

    fn client_update_stmt<'b>(
        tx: &'b Transaction<'b>,
        id: &str,
        name: &str,
        region: &str,
        current_skin: &str,
        skin_history: &str,
    ) {
        let mut stmt = tx
            .prepare(
                "INSERT OR REPLACE INTO clients (id, name, region, current_skin, skin_history) VALUES (?, ?, ?, ?, ?)",
            )
            .unwrap();
        stmt.execute(params![id, name, region, current_skin, skin_history])
            .unwrap();
    }

    fn client_get_stmt<'a>(
        tx: &'a Transaction<'a>,
        name: &str,
        region: &str,
    ) -> Result<(String, String, String), rusqlite::Error> {
        let mut stmt = tx
            .prepare(
                "SELECT id, current_skin, skin_history FROM clients WHERE name = ? AND region = ?",
            )
            .unwrap();
        return stmt.query_row(params![name, region], |row| {
            let id: String = row.get(0)?;
            let current_skin: String = row.get(1)?;
            let skin_history: String = row.get(2)?;
            Ok((id, current_skin, skin_history))
        });
    }

    fn update_time_info_stmt<'a>(tx: &'a Transaction<'a>, time: i64) {
        let mut stmt = tx
            .prepare("INSERT OR REPLACE INTO info (key, value) VALUES (?, ?)")
            .unwrap();
        stmt.execute(params!["last_update", time]).unwrap();
    }

    if let Some(servers) = servers_data["servers"].as_array() {
        for server in servers {
            if let (Some(addresses), Some(info), Some(location)) = (
                server["addresses"].as_array(),
                server["info"].as_object(),
                server["location"].as_str(),
            ) {
                let mut addr_proto_map = IndexMap::new();

                for addr in addresses {
                    if let Some(url_str) = addr.as_str() {
                        let url = reqwest::Url::parse(url_str)?;
                        let protocol = url.scheme();
                        addr_proto_map
                            .entry(url.host_str().unwrap().to_string())
                            .or_insert_with(Vec::new)
                            .push(protocol.to_string());
                    }
                }

                for (host, protocols) in addr_proto_map {
                    let mut server_info = info.clone();
                    server_info.insert("protocols".to_string(), protocols.into());
                    server_update_stmt(&tx, &host, &serde_json::to_string(&server_info)?, now);
                }

                if let Some(clients) = server["info"]["clients"].as_array() {
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
                            let skin_json = skin.to_string();
                            if let Ok((id, current_skin, skin_history)) =
                                client_get_stmt(&tx, &name, &location)
                            {
                                if current_skin != skin_json {
                                    let mut history: Vec<Value> =
                                        serde_json::from_str(&skin_history)?;
                                    history.push(json!({"t": now, "s": skin_json}));
                                    if history.len() > 10 {
                                        history.drain(0..history.len() - 10);
                                    }
                                    let skin_history_json = serde_json::to_string(&history)?;

                                    client_update_stmt(
                                        &tx,
                                        id.as_str(),
                                        name,
                                        location,
                                        skin_json.as_str(),
                                        skin_history_json.as_str(),
                                    );
                                }
                            } else {
                                let id = Uuid::new_v4().to_string();
                                let skin_history_json = serde_json::to_string(&vec![
                                    json!({"t": now, "s": skin_json}),
                                ])?;
                                client_update_stmt(
                                    &tx,
                                    id.as_str(),
                                    name,
                                    location,
                                    skin_json.as_str(),
                                    skin_history_json.as_str(),
                                );
                            }
                        }
                    }
                }
            }
        }
        update_time_info_stmt(&tx, now);
        tx.commit()?;
    }
    Ok(())
}
