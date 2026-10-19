//! Opt-in LAN transport. Authenticated encrypted payloads; no cloud relay or stored pairing key.
use crate::{projects, sync_data};
use ring::{aead,rand::{SecureRandom,SystemRandom}};
use serde_json::{json,Value};
use tauri::Manager;
use std::{collections::HashSet,io::{Read,Write},net::{Ipv4Addr,TcpListener,TcpStream},sync::{Arc,Mutex,atomic::{AtomicBool,AtomicUsize,Ordering}},time::Duration};
const LIMIT:usize=16_000_000;
#[derive(Default)]
pub struct Host(Mutex<Option<Arc<Session>>>);
struct Session {key:[u8;32],stop:AtomicBool,active:AtomicUsize,seen:Mutex<HashSet<[u8;12]>>,gate:Mutex<()>,allow_ai:bool}
impl Drop for Host {fn drop(&mut self){if let Some(s)=self.0.get_mut().unwrap().take(){s.stop.store(true,Ordering::SeqCst);}}}
fn private(ip:Ipv4Addr)->bool{ip.is_private()||ip.is_loopback()}
#[tauri::command]
pub fn link_address()->Option<String>{
    // UDP connect chooses a local interface without sending a packet.
    let socket=std::net::UdpSocket::bind("0.0.0.0:0").ok()?;socket.connect("192.0.2.1:9").ok()?;
    match socket.local_addr().ok()?.ip(){std::net::IpAddr::V4(ip) if ip.is_private()=>Some(ip.to_string()),_=>None}
}
#[tauri::command]
pub fn link_status(host:tauri::State<Host>)->bool{host.0.lock().unwrap().as_ref().is_some_and(|s|!s.stop.load(Ordering::SeqCst))}
fn hex(bytes:&[u8])->String{bytes.iter().map(|b|format!("{b:02x}")).collect()}
fn crypt_key(key:&[u8;32])->Result<aead::LessSafeKey,String>{Ok(aead::LessSafeKey::new(aead::UnboundKey::new(&aead::AES_256_GCM,key).map_err(|_|"Invalid key")?))}
pub fn seal(key:&[u8;32],aad:&str,plain:&[u8])->Result<Vec<u8>,String>{
    let mut nonce=[0;12];SystemRandom::new().fill(&mut nonce).map_err(|_|"Random generator unavailable")?;
    let mut body=plain.to_vec();crypt_key(key)?.seal_in_place_append_tag(aead::Nonce::assume_unique_for_key(nonce),aead::Aad::from(aad.as_bytes()),&mut body).map_err(|_|"Encryption failed")?;
    let mut result=nonce.to_vec();result.extend(body);Ok(result)
}
pub fn open(key:&[u8;32],aad:&str,body:&[u8])->Result<Vec<u8>,String>{
    if body.len()<28||body.len()>LIMIT+28{return Err("Invalid message size".into());}
    let nonce= <[u8;12]>::try_from(&body[..12]).map_err(|_|"Invalid nonce")?;
    let mut data=body[12..].to_vec();let k=crypt_key(key)?;
    Ok(k.open_in_place(aead::Nonce::assume_unique_for_key(nonce),aead::Aad::from(aad.as_bytes()),&mut data).map_err(|_|"Pairing key is incorrect or message was changed")?.to_vec())
}
#[tauri::command]
pub fn link_stop(host:tauri::State<Host>){stop(&host);}
fn stop(host:&Host){if let Some(s)=host.0.lock().unwrap().take(){let _gate=s.gate.lock().unwrap();s.stop.store(true,Ordering::SeqCst);}}
#[tauri::command]
pub fn link_start(app:tauri::AppHandle,host:tauri::State<Host>,store:tauri::State<projects::Store>,address:String,allow_ai:Option<bool>)->Result<String,String>{
    let ip:Ipv4Addr=address.trim().parse().map_err(|_|"Enter this PC's private IPv4 address from Windows Wi-Fi settings.")?;
    if !private(ip)||ip.is_loopback(){return Err("Use this PC's private Wi-Fi address (usually 192.168.x.x or 10.x.x.x).".into());}
    let listener=TcpListener::bind((ip,0)).map_err(|_|"Could not share on that address. Check Windows Wi-Fi settings.")?;
    listener.set_nonblocking(true).map_err(|e|e.to_string())?;
    let port=listener.local_addr().map_err(|e|e.to_string())?.port();
    let mut key=[0;32];SystemRandom::new().fill(&mut key).map_err(|_|"Random generator unavailable")?;
    let code=format!("\x63\x6f\x75\x63\x6f\x751:{ip}:{port}:{}",hex(&key));
    stop(&host);
    let session=Arc::new(Session{key,stop:AtomicBool::new(false),active:AtomicUsize::new(0),seen:Mutex::new(HashSet::new()),gate:Mutex::new(()),allow_ai:allow_ai.unwrap_or(false)});
    *host.0.lock().unwrap()=Some(session.clone());let store=store.inner().clone();
    std::thread::spawn(move||{while !session.stop.load(Ordering::SeqCst){match listener.accept(){Ok((stream,peer))=>{
        if !peer.ip().is_ipv4()||!private(match peer.ip(){std::net::IpAddr::V4(ip)=>ip,_=>continue})||session.active.load(Ordering::SeqCst)>=2{continue;}
        session.active.fetch_add(1,Ordering::SeqCst);let s=session.clone();let db=store.clone();let app=app.clone();std::thread::spawn(move||{let _=serve(stream,&s,&db,Some(&app));s.active.fetch_sub(1,Ordering::SeqCst);});
    },Err(e) if e.kind()==std::io::ErrorKind::WouldBlock=>std::thread::sleep(Duration::from_millis(100)),Err(_)=>break,}}});
    Ok(code)
}
fn request(stream:&mut TcpStream)->Result<(String,Vec<u8>),String>{
    stream.set_read_timeout(Some(Duration::from_secs(10))).map_err(|e|e.to_string())?;stream.set_write_timeout(Some(Duration::from_secs(10))).map_err(|e|e.to_string())?;
    let deadline=std::time::Instant::now()+Duration::from_secs(30);
    let mut header=Vec::new();let mut byte=[0];
    while !header.ends_with(b"\r\n\r\n"){if header.len()>=8192{return Err("Header too large".into());}read_until(stream,&mut byte,deadline)?;header.push(byte[0]);}
    let text=std::str::from_utf8(&header).map_err(|_|"Invalid header")?;let mut lines=text.split("\r\n");let first=lines.next().ok_or("Missing request")?.split(' ').collect::<Vec<_>>();
    if first.len()!=3||first[0]!="POST"||first[2]!="HTTP/1.1"||!matches!(first[1],"/v1/list"|"/v1/pull"|"/v1/sync"|"/v1/ask"){return Err("Invalid request".into());}
    let mut size=None;
    for line in lines.filter(|s|!s.is_empty()){let(k,v)=line.split_once(':').ok_or("Invalid header")?;if k.eq_ignore_ascii_case("transfer-encoding"){return Err("Unsupported encoding".into());}if k.eq_ignore_ascii_case("content-length"){if size.is_some(){return Err("Duplicate length".into());}size=Some(v.trim().parse::<usize>().map_err(|_|"Invalid length")?);}}
    let size=size.ok_or("Missing length")?;if !(28..=LIMIT+28).contains(&size){return Err("Message too large".into());}let mut body=vec![0;size];read_until(stream,&mut body,deadline)?;Ok((first[1].into(),body))
}
fn read_until(stream:&mut TcpStream,mut bytes:&mut [u8],deadline:std::time::Instant)->Result<(),String>{while !bytes.is_empty(){let left=deadline.checked_duration_since(std::time::Instant::now()).ok_or("Transfer timed out")?;stream.set_read_timeout(Some(left)).map_err(|e|e.to_string())?;let n=stream.read(bytes).map_err(|e|e.to_string())?;if n==0{return Err("Incomplete request".into());}bytes=&mut bytes[n..];}Ok(())}
fn dispatch(path:&str,v:Value,store:&projects::Store)->Result<Value,String>{
    let documents=v["documents"].as_bool().unwrap_or(false);
    match path{
        "/v1/list"=>{let list=store.list("")?;if list.len()>200{return Err("Sync supports 200 conversations per session. Export older work first.".into());}Ok(json!({"entries":list,"features":["reading-v1"]}))},
        "/v1/pull"=>Ok(serde_json::to_value(sync_data::snapshot(store.load(v["id"].as_str().ok_or("Missing ID")?)?,documents)).map_err(|e|e.to_string())?),
        "/v1/sync"=>{let p:projects::Project=serde_json::from_value(v["project"].clone()).map_err(|_|"Invalid project")?;if documents&&v["readerVersion"].as_u64()!=Some(1)&&(p.sources.iter().any(|s|s.reading.is_some())||store.load(&p.id).ok().is_some_and(|old|old.sources.iter().any(|s|s.reading.is_some()))){return Err("Update both devices before syncing documents with reading notes.".into());}Ok(serde_json::to_value(store.merge_sync(p,v["base"].as_str(),documents)?).map_err(|e|e.to_string())?)},
        _=>Err("Unknown operation".into())
    }
}
fn ask(v:Value,s:&Session,app:Option<&tauri::AppHandle>)->Result<Value,String>{
    if !s.allow_ai{return Err("Phone access to offline AI is off. Enable it on Windows and start sharing again.".into());}
    let app=app.ok_or("Offline AI is unavailable")?;let chat=app.state::<crate::ai::Chat>();
    let query=v["query"].as_str().ok_or("Enter a question")?.to_string();
    let sources=serde_json::from_value(v["sources"].clone()).map_err(|_|"Invalid sources")?;
    let history=serde_json::from_value(v["history"].clone()).map_err(|_|"Invalid history")?;
    let result=tauri::async_runtime::block_on(async{
        let cancelled=async{loop{if s.stop.load(Ordering::SeqCst){break;}tokio::time::sleep(Duration::from_millis(200)).await;}};
        tokio::select!{
            r=crate::workspace_commands::ask_local(&chat,query,sources,history,String::new(),"fast".into(),v["longResponse"].as_bool())=>r,
            _=cancelled=>Err("Windows sharing stopped.".into()),
            _=tokio::time::sleep(Duration::from_secs(900))=>Err("Offline reply timed out. Try a shorter question.".into())
        }
    })?;
    serde_json::to_value(result).map_err(|e|e.to_string())
}
fn serve(mut stream:TcpStream,s:&Session,store:&projects::Store,app:Option<&tauri::AppHandle>)->Result<(),String>{
    let(path,body)=request(&mut stream)?;let plain=open(&s.key,&format!("\x63\x6f\x75\x63\x6f\x75-v1-request|{path}"),&body)?;
    let nonce:[u8;12]=body[..12].try_into().unwrap();
    {let mut seen=s.seen.lock().unwrap();if seen.len()>=100000||!seen.insert(nonce){return Err("Session expired or repeated request".into());}}
    if s.stop.load(Ordering::SeqCst){return Err("Sharing stopped".into());}
    let result=serde_json::from_slice(&plain).map_err(|_|"Invalid JSON".into()).and_then(|v|{
        if path=="/v1/ask"{ask(v,s,app)}else{let _gate=s.gate.lock().unwrap();if s.stop.load(Ordering::SeqCst){return Err("Sharing stopped".into());}dispatch(&path,v,store)}
    });
    if s.stop.load(Ordering::SeqCst){return Err("Sharing stopped".into());}
    let value=match result{Ok(v)=>json!({"ok":v}),Err(e)=>json!({"error":e})};let bytes=serde_json::to_vec(&value).map_err(|e|e.to_string())?;
    let bytes=if bytes.len()>LIMIT{serde_json::to_vec(&json!({"error":"Conversation exceeds transfer size. Export it separately."})).unwrap()}else{bytes};
    let response=seal(&s.key,&format!("\x63\x6f\x75\x63\x6f\x75-v1-response|{path}|{}",hex(&nonce)),&bytes)?;
    write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n",response.len()).map_err(|e|e.to_string())?;stream.write_all(&response).map_err(|e|e.to_string())
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn legacy_peer_cannot_strip_reading_notes(){
        let project=json!({"id":"c".repeat(64),"name":"Reader test","title":"Draft","question":"","draft":"","history":[],"memory":"","model":"fast","sources":[{"name":"Book","text":"Hello","pages":[],"reading":{"offset":0,"bookmarks":[0],"annotations":[]}}]});
        let result=dispatch("/v1/sync",json!({"documents":true,"project":project}),&projects::Store::default());
        assert!(result.unwrap_err().contains("Update both devices"));
    }
    #[test]fn reading_notes_validate_utf16_anchors_and_opt_out(){
        let mut p:projects::Project=serde_json::from_value(json!({"id":"c".repeat(64),"name":"Reader","title":"Draft","question":"","draft":"","history":[],"memory":"","model":"fast","sources":[{"name":"Book","text":"A 🌻 note","pages":[],"reading":{"offset":0,"bookmarks":[0],"annotations":[{"id":"one","start":2,"end":4,"quote":"🌻","color":"gold","note":"Keep"}]}}]})).unwrap();
        assert!(projects::validate(&p).is_ok());assert!(sync_data::clean(p.clone(),false).sources.is_empty());
        p.sources[0].reading.as_mut().unwrap().annotations[0].quote="Other".into();assert!(projects::validate(&p).is_err());
    }
    #[test]fn encryption_authenticates_direction_key_and_content(){let key=[7;32];let msg=seal(&key,"request",b"private notes").unwrap();assert_eq!(open(&key,"request",&msg).unwrap(),b"private notes");assert!(open(&key,"response",&msg).is_err());assert!(open(&[8;32],"request",&msg).is_err());let mut bad=msg.clone();bad[15]^=1;assert!(open(&key,"request",&bad).is_err());assert_ne!(seal(&key,"request",b"private notes").unwrap(),msg);}
    #[test]fn private_addresses_only(){assert!(private("192.168.1.2".parse().unwrap()));assert!(private("172.16.1.2".parse().unwrap()));assert!(!private("8.8.8.8".parse().unwrap()));assert!(!private("0.0.0.0".parse().unwrap()));}
    #[test]fn encrypted_request_replay_is_rejected(){
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();
        let session=Session{key:[7;32],stop:AtomicBool::new(false),active:AtomicUsize::new(0),seen:Mutex::new(HashSet::new()),gate:Mutex::new(()),allow_ai:false};
        let body=seal(&session.key,"\x63\x6f\x75\x63\x6f\x75-v1-request|/v1/list",b"{}").unwrap();let client=std::thread::spawn(move||{for _ in 0..2{let mut stream=TcpStream::connect(address).unwrap();write!(stream,"POST /v1/list HTTP/1.1\r\nContent-Length: {}\r\n\r\n",body.len()).unwrap();stream.write_all(&body).unwrap();let mut result=Vec::new();stream.read_to_end(&mut result).unwrap();}});
        let db=projects::Store::default();assert!(serve(listener.accept().unwrap().0,&session,&db,None).is_ok());assert!(serve(listener.accept().unwrap().0,&session,&db,None).unwrap_err().contains("repeated"));client.join().unwrap();
    }
    #[test]
    #[ignore="runs the Android Java transport against the native server"]
    fn java_transport_interoperates(){
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();let code=format!("\x63\x6f\x75\x63\x6f\x751:127.0.0.1:{}:{}",address.port(),hex(&[7;32]));
        let mut child=std::process::Command::new(std::env::var("ANF_TEST_JAVA").unwrap()).args(["-cp",&std::env::var("ANF_TEST_CLASSES").unwrap(),"com.anf.workspace.LinkCheck",&code]).spawn().unwrap();
        let session=Session{key:[7;32],stop:AtomicBool::new(false),active:AtomicUsize::new(0),seen:Mutex::new(HashSet::new()),gate:Mutex::new(()),allow_ai:false};let db=projects::Store::default();listener.set_nonblocking(true).unwrap();
        let until=std::time::Instant::now()+Duration::from_secs(30);let mut count=0;
        while count<4&&std::time::Instant::now()<until{match listener.accept(){Ok((stream,_))=>{let _=serve(stream,&session,&db,None);count+=1;},Err(_)=>std::thread::sleep(Duration::from_millis(20))}}
        if count!=4{let _=child.kill();panic!("Java did not complete requests");}assert!(child.wait().unwrap().success());
    }
}

