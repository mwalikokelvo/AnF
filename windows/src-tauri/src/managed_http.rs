//! Fixed numeric-loopback HTTP transport. The connected server-side TCP tuple is
//! attested before any bytes (including credentials) are written. Never reconnects,
//! redirects, resolves a hostname, consults proxy settings or decompresses a body.
use crate::managed_process::ProcessIdentity;
use std::time::Duration;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt, BufReader},
    net::TcpStream,
};

pub struct Response {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}
const HEAD_LIMIT: usize = 32 * 1024;
const BODY_LIMIT: usize = 2 * 1024 * 1024;
const ERROR: &str =
    "Managed gateway connection or response was invalid; no retry or fallback occurred.";

pub async fn request(
    owner: &ProcessIdentity,
    port: u16,
    method: &str,
    path: &str,
    headers: &[(&str, &str)],
    body: &[u8],
    deadline: Duration,
) -> Result<Response, String> {
    if !matches!(method, "GET" | "POST")
        || !path.starts_with('/')
        || path.len() > 1000
        || !path.bytes().all(|b| b.is_ascii_graphic())
        || body.len() > 256_000
        || headers.len() > 10
        || headers.iter().any(|(k, v)| {
            k.is_empty()
                || !k.bytes().all(|b| b.is_ascii_alphabetic() || b == b'-')
                || v.len() > 8192
                || v.bytes().any(|b| b.is_ascii_control())
                || [
                    "host",
                    "connection",
                    "content-length",
                    "transfer-encoding",
                    "accept-encoding",
                ]
                .contains(&k.to_ascii_lowercase().as_str())
        })
    {
        return Err(ERROR.into());
    }
    tokio::time::timeout(deadline, async {
        let mut stream=tokio::time::timeout(Duration::from_secs(2),TcpStream::connect((std::net::Ipv4Addr::LOCALHOST,port)))
            .await.map_err(|_|ERROR)?.map_err(|_|ERROR)?;
        let client_port=stream.local_addr().map_err(|_|ERROR)?.port();
        // The identity holds a duplicated original process handle, preventing PID
        // reuse. This check targets the connection actually held by this stream.
        if !owner.owns_connection(port,client_port) { return Err(ERROR.to_string()); }
        let mut head=format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\nAccept-Encoding: identity\r\nContent-Length: {}\r\n",body.len());
        for (key,value) in headers { head.push_str(&format!("{key}: {value}\r\n")); }
        if head.len()>HEAD_LIMIT { return Err(ERROR.into()); }
        head.push_str("\r\n");
        stream.write_all(head.as_bytes()).await.map_err(|_|ERROR)?;
        stream.write_all(body).await.map_err(|_|ERROR)?;
        decode(BufReader::new(stream)).await
    }).await.map_err(|_|"Managed gateway request timed out; no retry or fallback occurred.".to_string())?
}

async fn line<R: tokio::io::AsyncRead + Unpin>(
    reader: &mut R,
    remaining: &mut usize,
) -> Result<String, String> {
    let mut bytes = Vec::new();
    loop {
        if *remaining == 0 {
            return Err(ERROR.into());
        }
        *remaining -= 1;
        let byte = reader.read_u8().await.map_err(|_| ERROR)?;
        bytes.push(byte);
        if byte == b'\n' {
            break;
        }
    }
    if !bytes.ends_with(b"\r\n") {
        return Err(ERROR.into());
    }
    bytes.truncate(bytes.len() - 2);
    if bytes.iter().any(|b| b.is_ascii_control()) {
        return Err(ERROR.into());
    }
    String::from_utf8(bytes).map_err(|_| ERROR.into())
}
async fn decode<R: tokio::io::AsyncRead + Unpin>(mut reader: R) -> Result<Response, String> {
    let mut remaining = HEAD_LIMIT;
    let status = line(&mut reader, &mut remaining).await?;
    let parts = status.splitn(3, ' ').collect::<Vec<_>>();
    if parts.len() != 3
        || !matches!(parts[0], "HTTP/1.0" | "HTTP/1.1")
        || parts[1].len() != 3
        || !parts[1].bytes().all(|b| b.is_ascii_digit())
    {
        return Err(ERROR.into());
    }
    let status: u16 = parts[1].parse().map_err(|_| ERROR)?;
    if !(200..=599).contains(&status) {
        return Err(ERROR.into());
    } // no interim responses
    let mut headers = Vec::new();
    let mut length = None;
    let mut chunked = false;
    loop {
        let text = line(&mut reader, &mut remaining).await?;
        if text.is_empty() {
            break;
        }
        let (key, value) = text.split_once(':').ok_or(ERROR)?;
        if key.is_empty()
            || !key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b))
        {
            return Err(ERROR.into());
        }
        let key = key.to_ascii_lowercase();
        let value = value.trim().to_string();
        match key.as_str() {
            "content-length" => {
                if length.is_some()
                    || value.is_empty()
                    || !value.bytes().all(|b| b.is_ascii_digit())
                {
                    return Err(ERROR.into());
                }
                length = Some(value.parse::<usize>().map_err(|_| ERROR)?);
            }
            "transfer-encoding" => {
                if chunked || !value.eq_ignore_ascii_case("chunked") {
                    return Err(ERROR.into());
                }
                chunked = true;
            }
            "content-encoding" if !value.eq_ignore_ascii_case("identity") => {
                return Err(ERROR.into())
            }
            _ => {}
        }
        headers.push((key, value));
    }
    if chunked && length.is_some() {
        return Err(ERROR.into());
    }
    let mut body = Vec::new();
    if chunked {
        let mut framing = HEAD_LIMIT;
        loop {
            let value = line(&mut reader, &mut framing).await?;
            // Chunk extensions aren't required by the pinned service. Reject them
            // rather than permitting ambiguous framing or unbounded metadata.
            if value.is_empty() || value.len() > 8 || !value.bytes().all(|b| b.is_ascii_hexdigit())
            {
                return Err(ERROR.into());
            }
            let size = usize::from_str_radix(&value, 16).map_err(|_| ERROR)?;
            if size == 0 {
                loop {
                    let trailer = line(&mut reader, &mut framing).await?;
                    if trailer.is_empty() {
                        break;
                    }
                    if !trailer.contains(':') {
                        return Err(ERROR.into());
                    }
                }
                break;
            }
            if size > BODY_LIMIT - body.len() {
                return Err(ERROR.into());
            }
            let start = body.len();
            body.resize(start + size, 0);
            reader
                .read_exact(&mut body[start..])
                .await
                .map_err(|_| ERROR)?;
            let mut crlf = [0; 2];
            reader.read_exact(&mut crlf).await.map_err(|_| ERROR)?;
            if crlf != *b"\r\n" {
                return Err(ERROR.into());
            }
        }
    } else if let Some(size) = length {
        if size > BODY_LIMIT {
            return Err(ERROR.into());
        }
        body.resize(size, 0);
        reader.read_exact(&mut body).await.map_err(|_| ERROR)?;
    } else {
        reader
            .take((BODY_LIMIT + 1) as u64)
            .read_to_end(&mut body)
            .await
            .map_err(|_| ERROR)?;
        if body.len() > BODY_LIMIT {
            return Err(ERROR.into());
        }
    }
    Ok(Response {
        status,
        headers,
        body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[tokio::test]
    async fn held_socket_is_attested_before_any_secret_is_sent() {
        for reject in [false, true] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let port = listener.local_addr().unwrap().port();
            let task = tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut bytes = Vec::new();
                let mut byte = [0; 1];
                while socket.read(&mut byte).await.unwrap() > 0 {
                    bytes.push(byte[0]);
                    if bytes.ends_with(b"\r\n\r\n") {
                        break;
                    }
                }
                if !bytes.is_empty() {
                    socket
                        .write_all(
                            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
                        )
                        .await
                        .unwrap();
                }
                bytes
            });
            let owner = ProcessIdentity::current_for_test(reject);
            let result = request(
                &owner,
                port,
                "GET",
                "/api/health",
                &[("Authorization", "Bearer private-fixture")],
                &[],
                Duration::from_secs(3),
            )
            .await;
            let bytes = task.await.unwrap();
            if reject {
                assert!(result.is_err());
                assert!(
                    bytes.is_empty(),
                    "A secret reached the wrong server identity"
                );
            } else {
                assert_eq!(result.unwrap().body, b"{}");
                assert!(bytes.windows(15).any(|v| v == b"private-fixture"));
            }
        }
    }
    #[tokio::test]
    async fn decodes_next_chunked_json_and_cookies() {
        let r=decode(&b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nSet-Cookie: session=abc; HttpOnly\r\n\r\n2\r\n{}\r\n0\r\n\r\n"[..]).await.unwrap();
        assert_eq!(r.status, 200);
        assert_eq!(r.body, b"{}");
        assert!(r.headers.iter().any(|(k, _)| k == "set-cookie"));
    }
    #[tokio::test]
    async fn refuses_ambiguous_truncated_and_oversized_framing() {
        for value in [
            "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Length: 2\r\n\r\n{}",
            "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nTransfer-Encoding: chunked\r\n\r\n",
            "HTTP/1.1 200 OK\r\nContent-Length: 2097153\r\n\r\n",
            "HTTP/1.1 200 OK\r\nContent-Length: 3\r\n\r\n{}",
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n200001\r\n",
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2;ext=x\r\n{}\r\n0\r\n\r\n",
            "HTTP/1.1 200 OK\n\n{}",
            "HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n\r\n{}",
        ] {
            assert!(decode(value.as_bytes()).await.is_err(), "{value}");
        }
        let oversized = format!(
            "HTTP/1.1 200 OK\r\nX-Fill: {}\r\n\r\n",
            "x".repeat(HEAD_LIMIT)
        );
        assert!(decode(oversized.as_bytes()).await.is_err());
    }
}
