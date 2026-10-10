//! Inert OPDS 1.2/2.0 feed parsing. Does not perform networking or render HTML.
use crate::CoreError;
use serde::Deserialize;
use serde_json::Value;
use url::Url;

const MAX_ITEMS: usize = 10_000;
#[derive(Clone, Debug, uniffi::Record)]
pub struct OpdsLink {
    pub href: String,
    pub relations: Vec<String>,
    pub media_type: String,
    pub title: String,
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct OpdsPublication {
    pub title: String,
    pub authors: Vec<String>,
    pub contributors: Vec<String>,
    pub links: Vec<OpdsLink>,
    pub acquisition: Vec<OpdsLink>,
    pub images: Vec<OpdsLink>,
    pub summary: String,
    pub published: String,
    pub languages: Vec<String>,
    pub categories: Vec<String>,
    pub identifier: String,
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct OpdsFeed {
    pub title: String,
    pub links: Vec<OpdsLink>,
    pub navigation: Vec<OpdsLink>,
    pub publications: Vec<OpdsPublication>,
}

fn text(v: &Value) -> String {
    if let Some(s) = v.as_str() {
        return s.into();
    }
    v.as_object()
        .and_then(|m| m.get("en").or_else(|| m.values().next()))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .into()
}
fn list(v: &Value) -> Vec<&Value> {
    if v.is_null() {
        vec![]
    } else if let Some(a) = v.as_array() {
        a.iter().collect()
    } else {
        vec![v]
    }
}
fn names(v: &Value) -> Vec<String> {
    list(v)
        .into_iter()
        .map(|v| {
            if v.is_object() {
                text(&v["name"])
            } else {
                text(v)
            }
        })
        .filter(|s| !s.is_empty())
        .collect()
}
fn resolve(href: &str, base: &Url) -> Option<String> {
    if href.is_empty() || href.trim() != href || href.chars().any(char::is_control) {
        return None;
    }
    let url = base.join(href).ok()?;
    if !matches!(url.scheme(), "https" | "http")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return None;
    }
    Some(url.into())
}
fn links(v: &Value, base: &Url) -> Vec<OpdsLink> {
    list(v)
        .into_iter()
        .filter_map(|v| {
            Some(OpdsLink {
                href: resolve(v["href"].as_str()?, base)?,
                relations: names(&v["rel"]),
                media_type: text(&v["type"]),
                title: text(&v["title"]),
            })
        })
        .collect()
}
fn is_acquisition(link: &OpdsLink) -> bool {
    link.relations.iter().any(|r| {
        r == "download"
            || r == "http://opds-spec.org/acquisition"
            || r.starts_with("http://opds-spec.org/acquisition/")
    })
}
fn collection(
    value: &Value,
    base: &Url,
    feed: &mut OpdsFeed,
    depth: usize,
) -> Result<(), CoreError> {
    if depth > 8 {
        return Err(CoreError::InvalidInput);
    }
    feed.navigation.extend(links(&value["navigation"], base));
    for p in list(&value["publications"]) {
        let m = &p["metadata"];
        let links = links(&p["links"], base);
        feed.publications.push(OpdsPublication {
            title: text(&m["title"]),
            authors: names(&m["author"]),
            contributors: names(&m["contributor"]),
            acquisition: links
                .iter()
                .filter(|l| is_acquisition(l))
                .cloned()
                .collect(),
            links,
            images: crate::opds::links(&p["images"], base),
            summary: text(&m["description"]),
            published: text(&m["published"]),
            languages: names(&m["language"]),
            categories: names(&m["subject"]),
            identifier: text(&m["identifier"]),
        });
        if feed.publications.len() > MAX_ITEMS {
            return Err(CoreError::InvalidInput);
        }
    }
    if feed.navigation.len() > MAX_ITEMS {
        return Err(CoreError::InvalidInput);
    }
    for group in list(&value["groups"]) {
        collection(group, base, feed, depth + 1)?;
    }
    Ok(())
}

#[derive(Default, Deserialize)]
struct Atom {
    #[serde(default)]
    title: String,
    #[serde(default)]
    link: Vec<AtomLink>,
    #[serde(default)]
    entry: Vec<Entry>,
}
#[derive(Default, Deserialize)]
struct Entry {
    #[serde(default)]
    title: String,
    #[serde(default)]
    id: String,
    #[serde(default)]
    author: Vec<Person>,
    #[serde(default)]
    contributor: Vec<Person>,
    #[serde(default)]
    link: Vec<AtomLink>,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    published: String,
    #[serde(default)]
    language: Vec<String>,
    #[serde(default)]
    category: Vec<Category>,
}
#[derive(Default, Deserialize)]
struct Person {
    #[serde(default)]
    name: String,
}
#[derive(Default, Deserialize)]
struct Category {
    #[serde(rename = "@term", default)]
    term: String,
    #[serde(rename = "@label", default)]
    label: String,
}
#[derive(Default, Deserialize)]
struct AtomLink {
    #[serde(rename = "@href", default)]
    href: String,
    #[serde(rename = "@rel", default)]
    rel: String,
    #[serde(rename = "@type", default)]
    media_type: String,
    #[serde(rename = "@title", default)]
    title: String,
}
fn atom_links(values: Vec<AtomLink>, base: &Url) -> Vec<OpdsLink> {
    values
        .into_iter()
        .filter_map(|v| {
            Some(OpdsLink {
                href: resolve(&v.href, base)?,
                relations: v.rel.split_whitespace().map(str::to_owned).collect(),
                media_type: v.media_type,
                title: v.title,
            })
        })
        .collect()
}

#[uniffi::export]
pub fn parse_opds(data: String, base_url: String) -> Result<OpdsFeed, CoreError> {
    if data.len() > 8 * 1024 * 1024 {
        return Err(CoreError::InvalidInput);
    }
    let base = Url::parse(&base_url).map_err(|_| CoreError::InvalidInput)?;
    if !matches!(base.scheme(), "http" | "https")
        || !base.username().is_empty()
        || base.password().is_some()
    {
        return Err(CoreError::InvalidInput);
    }
    let data = data.trim_start_matches('\u{feff}').trim_start();
    if data.starts_with('{') {
        let value: Value = serde_json::from_str(data).map_err(|_| CoreError::InvalidInput)?;
        if !["publications", "navigation", "groups"]
            .iter()
            .any(|k| value[*k].is_array())
        {
            return Err(CoreError::InvalidInput);
        }
        let mut feed = OpdsFeed {
            title: text(&value["metadata"]["title"]),
            links: links(&value["links"], &base),
            navigation: vec![],
            publications: vec![],
        };
        collection(&value, &base, &mut feed, 0)?;
        return Ok(feed);
    }
    if data.contains("<!DOCTYPE") || data.contains("<!ENTITY") {
        return Err(CoreError::InvalidInput);
    }
    let mut reader = quick_xml::Reader::from_str(data);
    loop {
        match reader.read_event().map_err(|_| CoreError::InvalidInput)? {
            quick_xml::events::Event::Start(e) | quick_xml::events::Event::Empty(e) => {
                if e.local_name().as_ref() != b"feed" {
                    return Err(CoreError::InvalidInput);
                }
                break;
            }
            quick_xml::events::Event::Eof => return Err(CoreError::InvalidInput),
            _ => {}
        }
    }
    let atom: Atom = quick_xml::de::from_str(data).map_err(|_| CoreError::InvalidInput)?;
    if atom.entry.len() > MAX_ITEMS {
        return Err(CoreError::InvalidInput);
    }
    let mut feed = OpdsFeed {
        title: atom.title,
        links: atom_links(atom.link, &base),
        navigation: vec![],
        publications: vec![],
    };
    for e in atom.entry {
        let links = atom_links(e.link, &base);
        let acquisition: Vec<_> = links
            .iter()
            .filter(|l| is_acquisition(l))
            .cloned()
            .collect();
        if acquisition.is_empty() {
            feed.navigation.extend(
                links
                    .iter()
                    .filter(|l| {
                        l.media_type.contains("application/atom+xml")
                            || l.media_type == "application/opds+json"
                    })
                    .cloned()
                    .map(|mut l| {
                        if l.title.is_empty() {
                            l.title = e.title.clone();
                        }
                        l
                    }),
            );
            continue;
        }
        let images = links
            .iter()
            .filter(|l| {
                l.relations.iter().any(|r| {
                    r == "http://opds-spec.org/image" || r == "http://opds-spec.org/image/thumbnail"
                })
            })
            .cloned()
            .collect();
        feed.publications.push(OpdsPublication {
            title: e.title,
            authors: e.author.into_iter().map(|p| p.name).collect(),
            contributors: e.contributor.into_iter().map(|p| p.name).collect(),
            acquisition,
            links,
            images,
            summary: if e.summary.is_empty() {
                e.content
            } else {
                e.summary
            },
            published: e.published,
            languages: e.language,
            categories: e
                .category
                .into_iter()
                .map(|c| if c.label.is_empty() { c.term } else { c.label })
                .collect(),
            identifier: e.id,
        });
    }
    Ok(feed)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atom_metadata_and_navigation() {
        let data = r#"<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/"><title>Library</title><link rel="next" href="?page=2"/><entry><title>New books</title><link href="new" type="application/atom+xml"/></entry><entry><id>urn:isbn:123</id><title>A book</title><author><name>A writer</name></author><contributor><name>Editor</name></contributor><summary>Read &amp; learn.</summary><dc:language>en</dc:language><category term="history"/><link rel="http://opds-spec.org/acquisition/open-access" href="../a.epub"/><link rel="http://opds-spec.org/image" href="cover.jpg"/></entry></feed>"#;
        let feed = parse_opds(data.into(), "https://example.org/catalog/root".into()).unwrap();
        assert_eq!(feed.navigation[0].title, "New books");
        assert_eq!(
            feed.links[0].href,
            "https://example.org/catalog/root?page=2"
        );
        let book = &feed.publications[0];
        assert_eq!(book.acquisition[0].href, "https://example.org/a.epub");
        assert_eq!(book.summary, "Read & learn.");
        assert_eq!(book.languages, ["en"]);
        assert_eq!(book.categories, ["history"]);
        assert_eq!(book.contributors, ["Editor"]);
        assert_eq!(book.images[0].href, "https://example.org/catalog/cover.jpg");
    }
    #[test]
    fn json_groups_and_string_author() {
        let data = r#"{"metadata":{"title":"Library"},"navigation":[{"title":"Next","href":"next"}],"groups":[{"publications":[{"metadata":{"title":{"en":"A book"},"author":"A writer","language":["en","fr"],"subject":[{"name":"History"}]},"links":[{"rel":["alternate","download"],"href":"a.epub"},{"rel":"http://opds-spec.org/acquisition-malicious","href":"bad.epub"}],"images":[{"href":"cover.jpg"}]}]}]}"#;
        let feed = parse_opds(data.into(), "https://example.org/".into()).unwrap();
        assert_eq!(feed.publications[0].authors, ["A writer"]);
        assert_eq!(feed.publications[0].acquisition.len(), 1);
        assert_eq!(feed.publications[0].categories, ["History"]);
        assert_eq!(feed.navigation[0].href, "https://example.org/next");
    }
    #[test]
    fn reject_hostile_and_oversized_input() {
        let base = "https://example.org/";
        for data in ["<!DOCTYPE feed><feed/>", "{broken", "<html/>", "{}"] {
            assert!(parse_opds(data.into(), base.into()).is_err());
        }
        assert!(parse_opds(" ".repeat(8 * 1024 * 1024 + 1), base.into()).is_err());
        assert!(parse_opds("{\"publications\":[]}".into(), "file:///private".into()).is_err());
        let url = Url::parse(base).unwrap();
        assert!(resolve("javascript:alert(1)", &url).is_none());
        assert!(resolve("https://user:secret@example.org/", &url).is_none());
        let mut data = serde_json::json!({"publications":[]});
        for _ in 0..10 {
            data = serde_json::json!({"groups":[data]});
        }
        assert!(parse_opds(data.to_string(), base.into()).is_err());
    }
}
