//! Authenticated fixed-route local provider backed by the existing serialized AI
//! engine. Its stable endpoint never exposes the engine's restartable URL/key.
use serde_json::{json, Value};
use std::time::Duration;
use tauri::Manager;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::watch,
};
pub struct Proxy {
    pub port: u16,
    pub key: String,
    stop: watch::Sender<bool>,
    task: tokio::task::JoinHandle<()>,
}
impl Proxy {
    pub async fn start(app: tauri::AppHandle) -> Result<Self, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|_| "Cannot allocate managed local model port.")?;
        let port = listener
            .local_addr()
            .map_err(|_| "Cannot inspect managed local model port.")?
            .port();
        let key = crate::local_ai::random_key()?;
        let auth = key.clone();
        let (stop, rx) = watch::channel(false);
        let task = tokio::spawn(async move {
            let mut children = tokio::task::JoinSet::new();
            let permits = std::sync::Arc::new(tokio::sync::Semaphore::new(2));
            let mut stopping = rx.clone();
            loop {
                tokio::select! {_=stopping.changed()=>break,result=listener.accept()=>{let Ok((socket,peer))=result else{break};if !peer.ip().is_loopback(){continue;}let Ok(permit)=permits.clone().try_acquire_owned()else{continue};let app=app.clone();let key=auth.clone();let cancel=rx.clone();children.spawn(async move{let _permit=permit;let _=handle(socket,&key,app,cancel).await;});},_=children.join_next(),if !children.is_empty()=>{}}
            }
            while children.join_next().await.is_some() {}
        });
        Ok(Self {
            port,
            key,
            stop,
            task,
        })
    }
    pub fn stop(&self) {
        self.stop.send_replace(true);
    }
}
impl Drop for Proxy {
    fn drop(&mut self) {
        self.stop.send_replace(true);
        let task = self.task.abort_handle();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(500)).await;
            task.abort();
        });
    }
}
async fn respond(socket: &mut TcpStream, status: u16, value: Value) -> Result<(), String> {
    let body = value.to_string();
    let head=format!("HTTP/1.1 {status} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",if status==200{"OK"}else{"Error"},body.len());
    tokio::time::timeout(Duration::from_secs(5), async {
        socket.write_all(head.as_bytes()).await?;
        socket.write_all(body.as_bytes()).await
    })
    .await
    .map_err(|_| "Local provider response timed out.")?
    .map_err(|_| "Local provider closed.".into())
}
fn messages(body: &[u8]) -> Result<Vec<Value>, String> {
    let value: Value = serde_json::from_slice(body).map_err(|_| "Invalid local model request.")?;
    if value["model"] != "anf-local" || value["stream"].as_bool() == Some(true) {
        return Err("Only non-streaming anf-local requests are supported.".into());
    }
    let input = value["messages"]
        .as_array()
        .filter(|m| !m.is_empty() && m.len() <= 30)
        .ok_or("Local model requires 1–30 messages.")?;
    let mut total = 0;
    for m in input {
        if !matches!(m["role"].as_str(), Some("user" | "assistant" | "system")) {
            return Err("Unsupported local message role.".into());
        }
        let text = m["content"]
            .as_str()
            .ok_or("Only plain text local messages are supported.")?;
        total += text.len();
        if total > 64000 {
            return Err("Local context exceeds 64 KB.".into());
        }
    }
    Ok(input
        .iter()
        .map(|m| json!({"role":m["role"],"content":m["content"]}))
        .collect())
}
async fn handle(
    mut socket: TcpStream,
    key: &str,
    app: tauri::AppHandle,
    stop: watch::Receiver<bool>,
) -> Result<(), String> {
    let request = tokio::time::timeout(Duration::from_secs(10), async {
        let mut bytes = Vec::new();
        let end = loop {
            if bytes.len() > 8192 {
                return Err("Local headers exceed 8 KB.".to_string());
            }
            let mut chunk = [0u8; 1024];
            let n = socket
                .read(&mut chunk)
                .await
                .map_err(|_| "Local request closed.")?;
            if n == 0 {
                return Err("Local request closed.".into());
            }
            bytes.extend_from_slice(&chunk[..n]);
            if let Some(i) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
                break i + 4;
            }
        };
        if end > 8192 {
            return Err("Local headers exceed 8 KB.".into());
        }
        let header = std::str::from_utf8(&bytes[..end]).map_err(|_| "Invalid local headers.")?;
        let mut lines = header.split("\r\n");
        let request = lines.next().unwrap_or("").to_string();
        let mut auth = false;
        let mut auth_seen = false;
        let mut length = None;
        for line in lines {
            if let Some((name, value)) = line.split_once(':') {
                if name.eq_ignore_ascii_case("authorization") {
                    if auth_seen {
                        return Err("Duplicate local authorization.".into());
                    }
                    auth_seen = true;
                    auth = value.trim() == format!("Bearer {key}");
                }
                if name.eq_ignore_ascii_case("content-length") {
                    if length.is_some() {
                        return Err("Duplicate local content length.".into());
                    }
                    length = Some(
                        value
                            .trim()
                            .parse::<usize>()
                            .map_err(|_| "Invalid local body size.")?,
                    );
                }
                if name.eq_ignore_ascii_case("transfer-encoding") {
                    return Err("Chunked local requests are unsupported.".into());
                }
            }
        }
        if !auth {
            return Err("Local provider authentication required.".into());
        }
        let length = length.unwrap_or(0);
        if length > 256000 {
            return Err("Local body exceeds 256 KB.".into());
        }
        if bytes.len() > end + length {
            return Err("Pipelined local requests are refused.".into());
        }
        while bytes.len() < end + length {
            let mut chunk = [0u8; 4096];
            let n = socket
                .read(&mut chunk)
                .await
                .map_err(|_| "Local body closed.")?;
            if n == 0 {
                return Err("Incomplete local body.".into());
            }
            bytes.extend_from_slice(&chunk[..n]);
            if bytes.len() > end + length {
                return Err("Pipelined local requests are refused.".into());
            }
        }
        Ok((request, bytes[end..end + length].to_vec()))
    })
    .await
    .map_err(|_| "Local request timed out.")?;
    let (request, body) =
        match request {
            Ok(r) => r,
            Err(_) => return respond(
                &mut socket,
                400,
                json!({"error":{"message":"Invalid or unauthenticated local provider request."}}),
            )
            .await,
        };
    if request == "GET /v1/models HTTP/1.1" {
        return respond(&mut socket,200,json!({"object":"list","data":[{"id":"anf-local","object":"model","owned_by":"AnF local CPU"}]})).await;
    }
    if request != "POST /v1/chat/completions HTTP/1.1" {
        return respond(
            &mut socket,
            404,
            json!({"error":{"message":"Unsupported local route."}}),
        )
        .await;
    }
    let input = match messages(&body) {
        Ok(v) => v,
        Err(_) => {
            return respond(
                &mut socket,
                400,
                json!({"error":{"message":"Unsupported or oversized local model request."}}),
            )
            .await
        }
    };
    let chat = app.state::<crate::ai::Chat>();
    let (cancel, rx) = watch::channel(*stop.borrow());
    let mut stopping = stop.clone();
    let mut disconnected = [0u8; 1];
    let inference = chat.local.reply_managed(&input, rx);
    tokio::pin!(inference);
    let result = tokio::select! {r=&mut inference=>r,_=stopping.changed()=>{cancel.send_replace(true);inference.await},_=socket.read(&mut disconnected)=>{cancel.send_replace(true);let _=inference.await;return Ok(());}};
    match result{Ok((text,truncated))=>respond(&mut socket,200,json!({"id":"anf-managed-local","object":"chat.completion","model":"anf-local","choices":[{"index":0,"message":{"role":"assistant","content":text},"finish_reason":if truncated{"length"}else{"stop"}}]})).await,Err(_)=>respond(&mut socket,503,json!({"error":{"message":"AnF local model is unavailable, stopped or cancelled. No cloud fallback occurred."}})).await}
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn schema_is_fixed_and_bounded() {
        assert!(messages(
            br#"{"model":"anf-local","messages":[{"role":"user","content":"hello"}]}"#
        )
        .is_ok());
        for bad in [
            json!({"model":"other","messages":[{"role":"user","content":"hello"}]}),
            json!({"model":"anf-local","messages":[{"role":"tool","content":"hello"}]}),
            json!({"model":"anf-local","stream":true,"messages":[{"role":"user","content":"hello"}]}),
            json!({"model":"anf-local","messages":[{"role":"user","content":"x".repeat(64001)}]}),
        ] {
            assert!(messages(bad.to_string().as_bytes()).is_err());
        }
    }
}
