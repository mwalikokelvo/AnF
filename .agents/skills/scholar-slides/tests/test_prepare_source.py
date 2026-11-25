"""Input-resolution and stem derivation for the Stage-1 orchestrator (no network)."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import prepare_source as ps  # noqa: E402


class TestArxivIdOf:
    def test_bare_id_and_versioned_id(self):
        assert ps._arxiv_id_of("1706.03762") == "1706.03762"
        assert ps._arxiv_id_of("1706.03762v7") == "1706.03762"

    def test_abs_and_pdf_urls(self):
        assert ps._arxiv_id_of("https://arxiv.org/abs/1706.03762") == "1706.03762"
        assert ps._arxiv_id_of("https://arxiv.org/pdf/2501.12948v2") == "2501.12948"

    def test_non_arxiv_inputs_return_none(self):
        assert ps._arxiv_id_of("papers/my.paper.pdf") is None
        assert ps._arxiv_id_of("Attention Is All You Need") is None


class TestStemFor:
    def test_arxiv_ids_keep_their_decimal(self):
        # splitext used to eat it: "1706.03762" -> out/1706
        assert ps._stem_for("1706.03762") == "1706.03762"
        assert ps._stem_for("https://arxiv.org/abs/1706.03762v7") == "1706.03762"

    def test_local_paths_are_sanitized(self):
        assert ps._stem_for("papers/my.paper.pdf") == "my_paper"

    def test_fallback_stem(self):
        assert ps._stem_for("???") == "source"
