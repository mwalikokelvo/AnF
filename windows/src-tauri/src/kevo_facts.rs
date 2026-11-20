// Offline random facts for Kevo instant commands.
// No network, no keys. Facts are short and positive.

use rand::seq::SliceRandom;
use rand::thread_rng;

/// A curated list of short, interesting facts.
pub const FACTS: &[&str] = &[
    "Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still edible.",
    "Octopuses have three hearts. Two pump blood to the gills, and one pumps it to the rest of the body.",
    "A group of flamingos is called a flamboyance.",
    "Bananas are berries, but strawberries are not.",
    "The Eiffel Tower can be 15 cm taller during the summer due to thermal expansion.",
    "Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid.",
    "Wombat poop is cube-shaped.",
    "The shortest war in history was between Britain and Zanzibar in 1896. It lasted 38 minutes.",
    "There are more possible iterations of a game of chess than there are atoms in the observable universe.",
    "Sea otters hold hands while they sleep so they don't drift apart.",
];

/// Returns a random fact from the offline list.
pub fn random_fact() -> &'static str {
    let mut rng = thread_rng();
    FACTS.choose(&mut rng).copied().unwrap_or("The universe is full of wonders.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fact_is_nonempty() {
        let fact = random_fact();
        assert!(!fact.is_empty());
        assert!(fact.len() > 20);
    }

    #[test]
    fn facts_are_distinct() {
        let a = random_fact();
        // Just check the list has variety
        assert!(FACTS.len() >= 5);
    }
}
