//! Optional public search. Only the explicit query leaves this computer.
use scraper::{Html,Selector};
use serde::Serialize;
#[derive(Debug,Serialize)]
pub struct Hit {pub title:String,pub url:String,pub snippet:String}
pub fn parse(body:&str)->Vec<Hit>{
    let html=Html::parse_document(body);
    let rows=Selector::parse(".result").unwrap();
    let links=Selector::parse(".result__a").unwrap();
    let snippets=Selector::parse(".result__snippet").unwrap();
    let mut hits=Vec::new();
    for row in html.select(&rows){
        let Some(a)=row.select(&links).next() else {continue};
        let Some(href)=a.value().attr("href") else {continue};
        let Ok(mut url)=reqwest::Url::parse(href).or_else(|_|reqwest::Url::parse("https://html.duckduckgo.com/").unwrap().join(href)) else{continue};
        if matches!(url.host_str(),Some("duckduckgo.com"|"html.duckduckgo.com")){
            let Some(target)=url.query_pairs().find(|(k,_)|k=="uddg").map(|(_,v)|v.into_owned()) else{continue};
            let Ok(target)=reqwest::Url::parse(&target) else{continue};url=target;
        }
        if url.scheme()!="https"||url.host_str().is_none()||!url.username().is_empty()||url.password().is_some(){continue;}
        if hits.iter().any(|h:&Hit|h.url==url.as_str()){continue;}
        let title=a.text().collect::<Vec<_>>().join(" ").chars().take(300).collect();
        let snippet=row.select(&snippets).next().map(|e|e.text().collect::<Vec<_>>().join(" ").chars().take(1000).collect()).unwrap_or_default();
        hits.push(Hit{title,url:url.to_string(),snippet});if hits.len()==6{break;}
    }hits
}
pub async fn search(query:&str,enabled:bool)->Result<Vec<Hit>,String>{
    if !enabled{return Err("Web search is off. Turn it on to search.".into());}
    let query=query.trim();if query.is_empty()||query.len()>1000{return Err("Enter public search terms under 1,000 bytes.".into());}
    let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(25)).redirect(reqwest::redirect::Policy::none()).build().map_err(|e|e.to_string())?;
    let mut response=client.get("https://html.duckduckgo.com/html/").query(&[("q",query)]).header("User-Agent","AnF/0.1.10 optional public search").send().await.map_err(|_|"Search could not connect. Try Open search in browser.")?;
    if !response.status().is_success(){return Err("The search service is unavailable. Try Open search in browser.".into());}
    let mut bytes=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|_|"Search download stopped.")?{if bytes.len()+chunk.len()>2_000_000{return Err("Search response exceeded the size limit.".into());}bytes.extend_from_slice(&chunk);}
    let hits=parse(&String::from_utf8_lossy(&bytes));if hits.is_empty(){return Err("No usable results returned. The service may require a browser check; use Open search in browser. No check is bypassed.".into());}Ok(hits)
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn accepts_https_and_unwraps_provider_links(){let hits=parse(r#"<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Farticle">Example</a><a class="result__snippet">Useful evidence</a></div><div class="result"><a class="result__a" href="javascript:alert(1)">Unsafe</a></div><div class="result"><a class="result__a" href="https://example.org/article">Duplicate</a></div>"#);assert_eq!(hits.len(),1);assert_eq!(hits[0].url,"https://example.org/article");assert_eq!(hits[0].snippet,"Useful evidence");}
    #[test]fn off_refuses_without_network(){let rt=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();assert!(rt.block_on(search("sample",false)).unwrap_err().contains("off"));}
    #[test]#[ignore="requires internet; service may rate limit"]fn live_public_search(){let rt=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();let results=rt.block_on(search("public library reading benefits",true)).unwrap();assert!(!results.is_empty());assert!(results.iter().all(|h|h.url.starts_with("https://")));println!("Live search returned {} usable links",results.len());}
}
