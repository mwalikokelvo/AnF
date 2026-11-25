"""generate-slides.py 纯函数测试。

这个 skill 的正确职责切分是"确定性脚本上真测试、生成结果靠 agent 校对"——
这里是前者：扩展名契约、幂等跳过、以及 webp→PNG 转换（PPTX/PDF 合并端只认
png/jpg，落盘 .webp 会被静默丢页，这是实测过的缺陷形态）。

运行：python3 -m pytest paper-slide-deck/tests/
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "generate-slides.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("generate_slides", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["generate_slides"] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def gs():
    return _load_module()


class TestExtForMime:
    def test_known_mimes_map_to_their_extensions(self, gs):
        assert gs.ext_for_mime("image/png") == ".png"
        assert gs.ext_for_mime("image/jpeg") == ".jpg"
        assert gs.ext_for_mime("image/jpg") == ".jpg"
        assert gs.ext_for_mime("image/webp") == ".webp"

    def test_unknown_or_empty_falls_back_to_png(self, gs):
        assert gs.ext_for_mime("") == ".png"
        assert gs.ext_for_mime(None) == ".png"
        assert gs.ext_for_mime("image/avif") == ".png"

    def test_matching_is_case_insensitive_and_whitespace_tolerant(self, gs):
        assert gs.ext_for_mime("  Image/JPEG ") == ".jpg"


class TestSlideImageRe:
    def test_matches_supported_slide_names(self, gs):
        for name in ("01-slide-cover.png", "02-slide-intro.JPG", "3-slide-x.JPEG"):
            assert gs.SLIDE_IMAGE_RE.match(name), name

    def test_rejects_non_slide_names(self, gs):
        for name in ("cover.png", "01-figure.png", "01-slide.webp", "notes.md"):
            assert not gs.SLIDE_IMAGE_RE.match(name), name


class TestExistingOutput:
    def test_small_files_are_not_treated_as_valid_outputs(self, gs, tmp_path):
        (tmp_path / "01-slide-a.png").write_bytes(b"x" * 100)
        assert gs.existing_output(tmp_path / "01-slide-a") is None

    def test_large_file_in_any_image_ext_counts(self, gs, tmp_path):
        (tmp_path / "01-slide-a.webp").write_bytes(b"x" * 20000)
        assert gs.existing_output(tmp_path / "01-slide-a") == tmp_path / "01-slide-a.webp"


class TestWebpConversion:
    @pytest.fixture
    def webp_bytes(self):
        from PIL import Image

        import io

        buffer = io.BytesIO()
        Image.new("RGB", (16, 9), color=(30, 60, 90)).save(buffer, format="WEBP")
        return buffer.getvalue()

    def test_webp_bytes_become_png_bytes(self, gs, webp_bytes):
        converted, ext = gs.finalize_image_data(webp_bytes, "image/webp")

        assert ext == ".png"
        assert converted[:8] == b"\x89PNG\r\n\x1a\n"
        from PIL import Image

        import io

        with Image.open(io.BytesIO(converted)) as image:
            assert image.size == (16, 9)

    def test_non_webp_passthrough_untouched(self, gs):
        payload = b"\x89PNG\r\n\x1a\n" + b"x" * 32
        data, ext = gs.finalize_image_data(payload, "image/png")
        assert (data, ext) == (payload, ".png")

    def test_finalize_matches_ext_for_mime_for_plain_jpeg(self, gs):
        payload = b"\xff\xd8\xff" + b"x" * 16
        assert gs.finalize_image_data(payload, "image/JPEG") == (payload, ".jpg")

    def test_corrupt_webp_raises_a_readable_error(self, gs):
        with pytest.raises(Exception, match="(?i)pillow|webp|image"):
            gs.convert_webp_to_png(b"not a webp at all")


def test_record_generated_writes_sha_prompt_and_model(gs, tmp_path):
    import hashlib
    import json

    slide = tmp_path / "03-slide-results.png"
    slide.write_bytes(b"\x89PNG fake bytes")
    gs.record_generated(tmp_path, slide, tmp_path / "prompts" / "03-slide-results.md", "gemini-x")
    entry = json.loads((tmp_path / "generated.json").read_text())["slides"]["03-slide-results.png"]
    assert entry == {
        "sha256": hashlib.sha256(b"\x89PNG fake bytes").hexdigest(),
        "prompt": "prompts/03-slide-results.md",
        "model": "gemini-x",
    }


def test_record_generated_keeps_other_slides_and_replaces_a_new_extension(gs, tmp_path):
    import json

    (tmp_path / "01-slide-cover.png").write_bytes(b"a")
    gs.record_generated(tmp_path, tmp_path / "01-slide-cover.png", tmp_path / "p" / "01-slide-cover.md", "m")
    (tmp_path / "02-slide-x.png").write_bytes(b"b")
    gs.record_generated(tmp_path, tmp_path / "02-slide-x.png", tmp_path / "p" / "02-slide-x.md", "m")
    (tmp_path / "02-slide-x.jpg").write_bytes(b"c")
    gs.record_generated(tmp_path, tmp_path / "02-slide-x.jpg", tmp_path / "p" / "02-slide-x.md", "m")
    slides = json.loads((tmp_path / "generated.json").read_text())["slides"]
    assert sorted(slides) == ["01-slide-cover.png", "02-slide-x.jpg"]


def test_main_records_every_slide_it_generates(gs, tmp_path, monkeypatch):
    """回归（对抗方 S5-1）：接线必须走 main()——只测 record_generated 时删掉调用也全绿。"""
    import json
    from types import SimpleNamespace

    (tmp_path / "prompts").mkdir()
    (tmp_path / "prompts" / "01-slide-cover.md").write_text("cover", encoding="utf-8")
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    part = SimpleNamespace(inline_data=SimpleNamespace(data=png, mime_type="image/png"))
    response = SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[part]))])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **_: response))
    genai = SimpleNamespace(Client=lambda api_key: client)
    types = SimpleNamespace(GenerateContentConfig=lambda **k: k, ImageConfig=lambda **k: k)
    monkeypatch.setattr(gs, "check_dependencies", lambda: (genai, types))
    monkeypatch.setenv("GOOGLE_API_KEY", "k-test")
    monkeypatch.setattr(sys, "argv", ["generate-slides.py", str(tmp_path), "--model", "gemini-x"])

    gs.main()

    slides = json.loads((tmp_path / "generated.json").read_text())["slides"]
    assert list(slides) == ["01-slide-cover.png"]
    assert slides["01-slide-cover.png"]["model"] == "gemini-x"


def test_unrecorded_existing_names_skipped_slides_missing_from_the_ledger(gs, tmp_path):
    (tmp_path / "prompts").mkdir()
    for stem in ("01-slide-a", "02-slide-b"):
        (tmp_path / "prompts" / f"{stem}.md").write_text("p", encoding="utf-8")
        (tmp_path / f"{stem}.png").write_bytes(b"x" * 20000)
    gs.record_generated(tmp_path, tmp_path / "01-slide-a.png", tmp_path / "prompts" / "01-slide-a.md", "m")
    prompts = gs.list_prompt_files(tmp_path / "prompts")
    assert gs.unrecorded_existing(prompts, tmp_path) == ["02-slide-b.png"]
