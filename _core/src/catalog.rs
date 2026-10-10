use crate::CoreError;
use serde::Deserialize;

#[derive(Clone, Debug, uniffi::Record)]
pub struct CatalogEntry {
    pub title: String,
    pub authors: Vec<String>,
    pub acquisition: Vec<String>,
}
#[derive(Default, Deserialize)]
struct AtomFeed {
    #[serde(default)]
    entry: Vec<AtomEntry>,
}
#[derive(Default, Deserialize)]
struct AtomEntry {
    #[serde(default)]
    title: String,
    #[serde(default)]
    author: Vec<AtomAuthor>,
    #[serde(default)]
    link: Vec<AtomLink>,
}
#[derive(Default, Deserialize)]
struct AtomAuthor {
    #[serde(default)]
    name: String,
}
#[derive(Default, Deserialize)]
struct AtomLink {
    #[serde(rename = "@rel", default)]
    rel: String,
    #[serde(rename = "@href", default)]
    href: String,
}
#[uniffi::export]
pub fn parse_catalog(feed: String) -> Result<Vec<CatalogEntry>, CoreError> {
    if feed.len() > 8 * 1024 * 1024 {
        return Err(CoreError::InvalidInput);
    }
    if feed.trim_start().starts_with('{') {
        let value: serde_json::Value =
            serde_json::from_str(&feed).map_err(|_| CoreError::InvalidInput)?;
        let publications = value
            .get("publications")
            .and_then(|v| v.as_array())
            .ok_or(CoreError::InvalidInput)?;
        return Ok(publications
            .iter()
            .take(10000)
            .map(|p| {
                let m = &p["metadata"];
                let authors = m["author"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v["name"].as_str().or(v.as_str()).map(str::to_owned))
                            .collect()
                    })
                    .unwrap_or_default();
                let acquisition = p["links"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter(|v| {
                                v["rel"].as_str().is_some_and(|r| {
                                    r.starts_with("http://opds-spec.org/acquisition")
                                })
                            })
                            .filter_map(|v| v["href"].as_str().map(str::to_owned))
                            .collect()
                    })
                    .unwrap_or_default();
                CatalogEntry {
                    title: m["title"].as_str().unwrap_or("Untitled").into(),
                    authors,
                    acquisition,
                }
            })
            .collect());
    }
    if feed.contains("<!DOCTYPE") || feed.contains("<!ENTITY") {
        return Err(CoreError::InvalidInput);
    }
    let parsed: AtomFeed = quick_xml::de::from_str(&feed).map_err(|_| CoreError::InvalidInput)?;
    Ok(parsed
        .entry
        .into_iter()
        .take(10000)
        .map(|e| CatalogEntry {
            title: e.title,
            authors: e.author.into_iter().map(|a| a.name).collect(),
            acquisition: e
                .link
                .into_iter()
                .filter(|l| l.rel.starts_with("http://opds-spec.org/acquisition"))
                .map(|l| l.href)
                .collect(),
        })
        .collect())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atom_and_json() {
        let atom = r#"<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>A book</title><author><name>A writer</name></author><link rel="http://opds-spec.org/acquisition" href="book.epub"/></entry></feed>"#;
        let parsed = parse_catalog(atom.into()).unwrap();
        assert_eq!(parsed[0].acquisition[0], "book.epub");
        let json = r#"{"publications":[{"metadata":{"title":"A book","author":[{"name":"A writer"}]},"links":[{"rel":"http://opds-spec.org/acquisition","href":"book.epub"}]}]}"#;
        assert_eq!(
            parse_catalog(json.into()).unwrap()[0].authors[0],
            "A writer"
        );
    }
    #[test]
    fn reject_entities_and_bad_json() {
        assert!(parse_catalog("<!DOCTYPE feed><feed/>".into()).is_err());
        assert!(parse_catalog("{broken".into()).is_err());
    }
}
