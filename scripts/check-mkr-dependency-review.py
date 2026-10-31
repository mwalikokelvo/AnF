"""Offline negative/positive checks for the metadata-only review collector."""
import importlib.util
from pathlib import Path
import unittest

source = Path(__file__).resolve().parent.parent / "integrations/mkr-music/audit-dependency-review.py"
spec = importlib.util.spec_from_file_location("dependency_review", source)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class ReviewChecks(unittest.TestCase):
    def test_namespaced_declarations_are_evidence_not_approval(self):
        result = review.pom_evidence(b'''<project xmlns="http://maven.apache.org/POM/4.0.0">
          <licenses><license><name>Example license</name><url>https://example.invalid/license</url></license></licenses>
          <scm><url>${unresolved.repo}</url><tag>exact-tag</tag></scm></project>''')
        self.assertEqual(result["declaredLicenses"][0]["name"], "Example license")
        self.assertEqual(result["scm"]["url"], "${unresolved.repo}")
        self.assertTrue(result["sourceReviewRequired"])

    def test_inherited_license_is_not_invented(self):
        result = review.pom_evidence(b"<project><parent><artifactId>parent</artifactId></parent></project>")
        self.assertEqual(result["declaredLicenses"], [])
        self.assertTrue(result["licenseInheritanceUnresolved"])
        self.assertEqual(review.parent_evidence(Path("unused"), {"groupId": "../private", "artifactId": "x", "version": "1"}), [])
        self.assertEqual(review.parent_evidence(Path("unused"), {"groupId": "org.example", "artifactId": "x", "version": "${revision}"}), [])

    def test_entities_oversize_and_malformed_xml_rejected(self):
        for value in [b'<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///private">]><project>&secret;</project>',
                      b"<project>" + b"x" * review.MAX_METADATA + b"</project>", b"<project>"]:
            with self.assertRaises(Exception):
                review.pom_evidence(value)

    def test_mixed_versions_flagged_without_attributing_a_failure(self):
        values = [{"coordinate": "io.ktor:module-one:3.5.2"}, {"coordinate": "io.ktor:module-two:3.4.0"}]
        finding = review.version_findings(values)[0]
        self.assertEqual(finding["versions"], ["3.4.0", "3.5.2"])
        self.assertFalse(finding["causeOfEarlierFailureEstablished"])
        self.assertEqual(review.version_findings(values[:1]), [])


if __name__ == "__main__":
    unittest.main()
