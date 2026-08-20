from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import importlib.util
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
EXPRESSIONS = [("01", "happy"), ("02", "laugh"), ("03", "aggrieved"), ("04", "angry"), ("05", "shocked"), ("06", "speechless"), ("07", "received"), ("08", "thanks"), ("09", "love-you"), ("10", "good-night")]


def run(script: str, *args: object, expect: int = 0) -> subprocess.CompletedProcess[str]:
    result = subprocess.run([sys.executable, str(SCRIPTS / script), *map(str, args)], text=True, encoding="utf-8", capture_output=True)
    if result.returncode != expect:
        raise AssertionError(f"{script} returned {result.returncode}, expected {expect}\nSTDOUT:{result.stdout}\nSTDERR:{result.stderr}")
    return result


def sticker(path: Path, size: int = 1024) -> None:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse((170, 120, 854, 804), fill=(221, 165, 106, 255), outline=(80, 48, 36, 255), width=18)
    im.save(path)


class ScriptBehaviorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="pet-sticker-test-")
        self.base = Path(self.tmp.name)

    def tearDown(self): self.tmp.cleanup()

    def test_full_deterministic_flow_and_no_overwrite(self):
        photos = self.base / "photos"; photos.mkdir()
        for i in range(5): Image.new("RGB", (800+i, 700+i), (150, 120+i, 90)).save(photos / f"ref-{i+1}.jpg")
        inspection = self.base / "inspection.json"
        run("inspect_inputs.py", photos, "--output", inspection)
        data = json.loads(inspection.read_text(encoding="utf-8")); self.assertEqual(data["photo_count"], 5); self.assertEqual(data["photos"][0]["photo_id"], "photo-01")
        run("inspect_inputs.py", photos, "--output", inspection, expect=2)

        no_caption = self.base / "no-caption"; no_caption.mkdir()
        for seq, key in EXPRESSIONS: sticker(no_caption / f"{seq}-{key}.png")
        final = self.base / "final"
        run("apply_captions.py", no_caption, final)
        self.assertEqual(len(list(final.glob("*.png"))), 10)
        with Image.open(final / "01-happy.png") as im: self.assertEqual(im.mode, "RGBA"); self.assertEqual(im.getchannel("A").getextrema()[0], 0)
        run("apply_captions.py", no_caption, final, expect=2)

        qa = self.base / "qa"; run("validate_exports.py", final, "--report-dir", qa)
        self.assertTrue(json.loads((qa / "qa_report.json").read_text(encoding="utf-8"))["passed"])
        bad = self.base / "bad"; bad.mkdir()
        for p in list(final.glob("*.png"))[:9]: Image.open(p).save(bad / p.name)
        run("validate_exports.py", bad, "--report-dir", self.base / "bad-qa", expect=1)

        preview = self.base / "preview.jpg"; run("create_contact_sheet.py", final, preview, "--pet-name", "团子")
        with Image.open(preview) as im: self.assertEqual(im.size, (1600, 808))
        run("create_contact_sheet.py", final, preview, "--pet-name", "团子", expect=2)

        order = self.base / "order.json"; order.write_text(json.dumps({"order_id":"PS-TEST-001", "pet_name":"团子", "photo_rights_confirmation":True, "case_display_authorization":False}, ensure_ascii=False), encoding="utf-8")
        identity = self.base / "identity"; identity.mkdir(); (identity / "pet_identity.json").write_text("{}", encoding="utf-8"); (identity / "pet_identity.md").write_text("# identity", encoding="utf-8")
        anchor = self.base / "anchor.png"; sticker(anchor); pilots = self.base / "pilots"; pilots.mkdir()
        for name in ["01-happy.png", "03-aggrieved.png"]: sticker(pilots / name)
        package = self.base / "package"
        run("package_order.py", "--order-json", order, "--inputs", photos, "--identity", identity, "--anchor", anchor, "--pilots", pilots, "--no-caption", no_caption, "--final", final, "--preview", preview, "--qa", qa, "--output", package)
        self.assertTrue((package / "manifest.json").is_file()); self.assertEqual(len(list((package / "final").glob("*.png"))), 10)
        run("package_order.py", "--order-json", order, "--inputs", photos, "--identity", identity, "--anchor", anchor, "--pilots", pilots, "--no-caption", no_caption, "--final", final, "--preview", preview, "--qa", qa, "--output", package, expect=2)

    def test_style_profile_save_and_no_overwrite(self):
        style_images = self.base / "style-images"; style_images.mkdir()
        for i in range(3): Image.new("RGB", (640+i, 640+i), (180, 150, 120+i)).save(style_images / f"style-ref-{i+1}.png")
        style_report = self.base / "style-report.json"
        run("inspect_style_inputs.py", style_images, "--output", style_report)
        style_data = json.loads(style_report.read_text(encoding="utf-8")); self.assertEqual(style_data["image_count"], 3); self.assertEqual(style_data["images"][0]["style_image_id"], "style-01")
        analysis = self.base / "analysis.json"
        analysis.write_text(json.dumps({"profile_id":"warm-rounded", "display_name":"暖圆贴纸", "version":1, "source_image_ids":["style-01","style-02","style-03"], "rights_confirmed":True, "status":"approved", "summary":"温暖圆润", "positive_requirements":["圆润轮廓"], "negative_constraints":["无文字"], "visual_parameters":{"background":"transparent"}, "evidence":[{"observation":"圆润", "image_ids":["style-01"], "confidence":"high"}], "prohibited_references":[]}, ensure_ascii=False), encoding="utf-8")
        profiles = self.base / "profiles"
        run("save_style_profile.py", analysis, profiles)
        self.assertTrue((profiles / "warm-rounded-v1.json").is_file()); self.assertTrue((profiles / "warm-rounded-v1.md").is_file())
        run("save_style_profile.py", analysis, profiles, expect=2)

    def test_all_scripts_offer_help(self):
        for script in ["inspect_inputs.py", "inspect_style_inputs.py", "apply_captions.py", "validate_exports.py", "create_contact_sheet.py", "package_order.py", "save_style_profile.py", "generate_external_image.py"]:
            run(script, "--help")

    def test_external_image_config_and_response_parsing(self):
        spec = importlib.util.spec_from_file_location("generate_external_image", SCRIPTS / "generate_external_image.py")
        module = importlib.util.module_from_spec(spec)
        assert spec.loader
        spec.loader.exec_module(module)

        csv_config = self.base / ".env.csv"
        csv_config.write_text("id,value\napiKey,secret\ndashScope,https://example.invalid/api/v1\n", encoding="utf-8")
        config = module.load_config(csv_config)
        self.assertEqual(module.config_value(config, "DASHSCOPE_API_KEY", "apiKey"), "secret")
        response = {"output": {"choices": [{"message": {"content": [{"image": "https://example.invalid/image.png"}]}}]}}
        self.assertEqual(module.find_image_url(response), "https://example.invalid/image.png")
        reference = self.base / "reference.jpg"
        Image.new("RGB", (32, 32), (255, 255, 255)).save(reference)
        encoded = module.image_data_url(reference)
        self.assertTrue(encoded.startswith("data:image/jpeg;base64,"))
        self.assertNotIn(str(reference), encoded)

    def test_chroma_removal_accepts_generated_blue_gradient(self):
        shell = shutil.which("pwsh") or shutil.which("powershell.exe")
        if not shell:
            self.skipTest("PowerShell is required for the chroma-key script")

        source = self.base / "gradient-blue.png"
        output = self.base / "transparent.png"
        im = Image.new("RGB", (128, 128))
        pixels = []
        for y in range(128):
            for x in range(128):
                pixels.append((5 + x // 64, 78 + y // 32, 198 + x // 32))
        im.putdata(pixels)
        ImageDraw.Draw(im).ellipse((32, 20, 96, 108), fill=(246, 241, 226))
        im.save(source)

        command = [
            shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
            str(SCRIPTS / "remove_chroma_background.ps1"),
            "-InputPath", str(source), "-OutputPath", str(output), "-Size", "128",
        ]
        result = subprocess.run(command, text=True, encoding="utf-8", capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        with Image.open(output).convert("RGBA") as cutout:
            alpha = cutout.getchannel("A")
            self.assertEqual([alpha.getpixel(p) for p in [(0, 0), (127, 0), (0, 127), (127, 127)]], [0, 0, 0, 0])
            self.assertEqual(alpha.getpixel((64, 64)), 255)
            self.assertGreater(alpha.histogram()[0], 8000)


if __name__ == "__main__": unittest.main()
