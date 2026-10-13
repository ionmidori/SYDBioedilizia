"""Portfolio image upload (Phase 128, Fase 6.2b): what the server accepts, how it
cleans the picture (re-encode, metadata and GPS removed) and what it stores."""
import io
import re

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from PIL import Image, ImageCms
from src.api.routes import admin_portfolio, upload
from src.auth.jwt_handler import verify_token
from src.core.config import settings
from src.core.exceptions import AppException
from src.core.rate_limit import limiter
from src.schemas.admin_content import portfolio_blob_path
from src.schemas.internal import UserSession
from src.services import portfolio_images

BUCKET = "test-bucket.appspot.com"


def _png(size=(40, 30), color=(200, 30, 30), mode="RGB") -> bytes:
    out = io.BytesIO()
    Image.new(mode, size, color).save(out, format="PNG")
    return out.getvalue()


def _jpeg_with_gps(size=(3000, 2000)) -> bytes:
    """A 'phone photo': large, rotated by EXIF, and carrying a GPS position."""
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation: rotate 90 degrees
    gps = exif.get_ifd(0x8825)
    gps[1], gps[2] = "N", (41.0, 53.0, 24.0)  # latitude of Rome
    gps[3], gps[4] = "E", (12.0, 29.0, 32.0)
    out = io.BytesIO()
    Image.new("RGB", size, (10, 120, 200)).save(out, format="JPEG", exif=exif)
    return out.getvalue()


# ── Processing ────────────────────────────────────────────────────────────────


def test_metadata_and_gps_never_survive():
    original = _jpeg_with_gps()
    assert Image.open(io.BytesIO(original)).getexif().get_ifd(0x8825)  # the input really has GPS

    data, width, height = portfolio_images.process_image(original)
    out = Image.open(io.BytesIO(data))
    assert out.format == "WEBP"
    assert not out.getexif().get_ifd(0x8825) and len(out.getexif()) == 0
    assert b"Exif" not in data[:200] or len(out.getexif()) == 0
    assert (out.width, out.height) == (width, height)


def test_large_photos_are_scaled_and_orientation_applied():
    # 3000x2000 landscape with EXIF "rotate 90" becomes a portrait, then fits 1920 px
    data, width, height = portfolio_images.process_image(_jpeg_with_gps())
    assert max(width, height) == portfolio_images.MAX_SIDE
    assert height > width  # the orientation was applied, not just ignored


def test_small_images_are_not_enlarged():
    _, width, height = portfolio_images.process_image(_png((40, 30)))
    assert (width, height) == (40, 30)


def test_transparency_is_kept():
    data, _, _ = portfolio_images.process_image(_png((20, 20), (255, 0, 0, 0), mode="RGBA"))
    assert Image.open(io.BytesIO(data)).mode == "RGBA"


@pytest.mark.parametrize("raw", [b"", b"not an image at all", b"\x89PNG\r\n\x1a\n" + b"\x00" * 20, _png()[:60]])
def test_garbage_and_truncated_files_are_rejected(raw):
    with pytest.raises(portfolio_images.InvalidImageError):
        portfolio_images.process_image(raw)


def test_a_decompression_bomb_is_rejected_before_it_is_decoded(monkeypatch):
    monkeypatch.setattr(portfolio_images, "MAX_PIXELS", 1000)
    with pytest.raises(portfolio_images.InvalidImageError, match="too many pixels"):
        portfolio_images.process_image(_png((100, 100)))


def test_blob_paths_and_urls_pass_the_public_site_validation():
    path = portfolio_images.new_blob_path()
    assert re.fullmatch(r"portfolio/\d{13}_[0-9a-f]{8}\.webp", path)
    assert path != portfolio_images.new_blob_path()
    url = portfolio_images.public_url(BUCKET, path)
    assert url.startswith(f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%2F")
    assert portfolio_blob_path(url, BUCKET) == path


# ── Route ─────────────────────────────────────────────────────────────────────


@pytest.fixture
def stored(monkeypatch):
    saved: list[tuple[str, bytes]] = []
    monkeypatch.setattr(portfolio_images, "upload_sync", lambda path, data: saved.append((path, data)))
    monkeypatch.setattr(settings, "FIREBASE_STORAGE_BUCKET", BUCKET)
    monkeypatch.setattr(admin_portfolio, "emit_audit_event", lambda *a, **k: None)
    limiter.reset()
    return saved


def _client(role: str | None = "admin") -> TestClient:
    app = FastAPI()
    app.include_router(admin_portfolio.router)

    @app.exception_handler(AppException)
    async def _handler(_request: Request, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content={"error_code": exc.error_code, "detail": exc.detail})

    async def _session():
        return UserSession(
            uid="admin-a", email="a@syd.it", is_authenticated=True, claims={"role": role} if role else {}
        )

    app.dependency_overrides[verify_token] = _session
    return TestClient(app)


def _post(client, content: bytes, content_type="image/png", name="foto.png"):
    return client.post("/api/admin/portfolio/image", files={"file": (name, content, content_type)})


def test_a_valid_photo_is_cleaned_stored_and_returns_a_usable_url(stored):
    resp = _post(_client(), _jpeg_with_gps(), "image/jpeg", "IMG_0001.jpg")
    assert resp.status_code == 201
    body = resp.json()
    [(path, data)] = stored
    assert portfolio_blob_path(body["image_url"], BUCKET) == path  # the URL the project will save validates
    assert "IMG_0001" not in path  # the client's file name is never used
    assert Image.open(io.BytesIO(data)).format == "WEBP"
    assert body["size_bytes"] == len(data) and max(body["width"], body["height"]) == 1920


def test_only_admins_can_upload(stored):
    resp = _post(_client(role=None), _png())
    assert resp.status_code == 403 and resp.json()["error_code"] == "ADMIN_REQUIRED"
    assert stored == []


@pytest.mark.parametrize(
    "content, content_type, name",
    [
        (b"MZ\x90\x00 this is an executable", "image/png", "evil.png"),  # wrong signature
        (_png(), "image/jpeg", "liar.jpg"),  # declared type does not match the bytes
        (b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "image/svg+xml", "x.svg"),
        (b"GIF", "image/gif", "tiny.gif"),
    ],
)
def test_files_that_are_not_what_they_claim_are_refused(stored, content, content_type, name):
    assert _post(_client(), content, content_type, name).status_code == 400
    assert stored == []


def test_a_file_with_a_valid_signature_but_undecodable_body_is_a_422(stored):
    resp = _post(_client(), b"\x89PNG\r\n\x1a\n" + b"junk" * 10)
    assert resp.status_code == 422 and resp.json()["error_code"] == "INVALID_IMAGE"
    assert stored == []


def test_oversized_uploads_are_cut_off_while_reading(stored, monkeypatch):
    monkeypatch.setattr(portfolio_images, "MAX_UPLOAD_BYTES", 100)
    monkeypatch.setattr(upload, "CHUNK_SIZE", 64)
    assert _post(_client(), _png((300, 300))).status_code == 413
    assert stored == []


# ── Colour management, formats and failures ───────────────────────────────────


def _with_profile(color=(200, 40, 40)) -> bytes:
    srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    out = io.BytesIO()
    Image.new("RGB", (30, 30), color).save(out, format="PNG", icc_profile=srgb)
    return out.getvalue()


def test_an_embedded_profile_is_applied_then_dropped():
    data, _, _ = portfolio_images.process_image(_with_profile())
    out = Image.open(io.BytesIO(data))
    assert "icc_profile" not in out.info
    r, g, b = out.convert("RGB").getpixel((5, 5))
    assert (abs(r - 200), abs(g - 40), abs(b - 40)) < (4, 4, 4)  # sRGB -> sRGB leaves the colours alone


def test_a_broken_profile_never_rejects_the_photo():
    out = io.BytesIO()
    Image.new("RGB", (30, 30), (10, 200, 10)).save(out, format="PNG", icc_profile=b"definitely not a profile")
    data, width, height = portfolio_images.process_image(out.getvalue())
    assert Image.open(io.BytesIO(data)).format == "WEBP" and (width, height) == (30, 30)


@pytest.mark.parametrize("mode", ["CMYK", "L", "P", "1", "LA", "I;16"])
def test_unusual_colour_modes_come_out_as_rgb(mode):
    out = io.BytesIO()
    fmt = "TIFF" if mode in ("CMYK", "I;16") else "PNG"
    Image.new(mode, (40, 40)).save(out, format=fmt)
    data, _, _ = portfolio_images.process_image(out.getvalue())
    assert Image.open(io.BytesIO(data)).mode in ("RGB", "RGBA")


def test_a_big_palette_image_is_converted_before_it_is_resized():
    out = io.BytesIO()
    Image.new("P", (3000, 2000)).save(out, format="PNG")
    data, width, height = portfolio_images.process_image(out.getvalue())
    assert max(width, height) == portfolio_images.MAX_SIDE
    assert Image.open(io.BytesIO(data)).mode == "RGB"


def test_a_jpeg_whose_first_marker_is_not_jfif_is_accepted(stored):
    jpeg = bytearray(_jpeg_with_gps((200, 100)))
    assert bytes(jpeg[:3]) == b"\xff\xd8\xff"  # Pillow writes JFIF (E0) first; the loop swaps the marker
    for marker in (0xE2, 0xED, 0xEE):  # ICC/MPF, Photoshop, Adobe: all valid first markers
        jpeg[3] = marker
        assert _post(_client(), bytes(jpeg), "image/jpeg", "x.jpg").status_code == 201, hex(marker)


def test_a_storage_failure_is_a_clean_502_and_nothing_is_audited(monkeypatch):
    from google.api_core.exceptions import ServiceUnavailable

    audited: list[tuple] = []

    def boom(path, data):
        raise ServiceUnavailable("storage down")

    monkeypatch.setattr(portfolio_images, "upload_sync", boom)
    monkeypatch.setattr(settings, "FIREBASE_STORAGE_BUCKET", BUCKET)
    monkeypatch.setattr(admin_portfolio, "emit_audit_event", lambda *a, **k: audited.append(a))
    limiter.reset()
    resp = _post(_client(), _png())
    assert resp.status_code == 502 and resp.json()["error_code"] == "PORTFOLIO_UPLOAD_FAILED"
    assert "storage down" not in resp.text  # no internals leak
    assert audited == []
