"""Renders per room (Phase 138, PR-3): the room asked for (or the active one) picks
the source photo, the render is filed in that room and its artifact never
overwrites another room's (`render_{room_id}_{n}.png`)."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.adk import tools
from src.adk.session_context import ACTIVE_ROOM_STATE_KEY
from src.tools import generate_render as render_module

PROJECT = "sess-1"


@pytest.fixture()
def tool_context() -> MagicMock:
    ctx = MagicMock()
    ctx.session.id = PROJECT
    ctx.user_id = "uid-1"
    ctx.invocation_id = "inv-1"
    ctx.save_artifact = AsyncMock(return_value=0)
    ctx.list_artifacts = AsyncMock(return_value=[])
    ctx.state = {}
    return ctx


@pytest.fixture(autouse=True)
def _registered_user_with_quota():
    decision = MagicMock(allowed=True)
    with patch.object(tools, "_is_guest", AsyncMock(return_value=False)), \
         patch.object(tools, "check_quota", AsyncMock(return_value=decision)), \
         patch.object(tools, "increment_quota", AsyncMock()):
        yield


def _repo(rooms: dict[str, str], photos: dict[str, str]) -> MagicMock:
    repo = MagicMock()
    repo.get_room = AsyncMock(side_effect=lambda pid, rid: MagicMock(room_id=rid) if rid in rooms else None)
    repo.latest_room_photo = AsyncMock(side_effect=lambda pid, rid: {"url": photos[rid]} if rid in photos else None)
    repo.latest_unclassified_photo = AsyncMock(return_value=None)
    return repo


async def _render(tool_context, repo, **kwargs):
    wrapper = AsyncMock(return_value={"status": "success", "imageUrl": "https://x/render.png"})
    with patch.object(tools, "get_room_repository", return_value=repo), \
         patch("src.tools.generate_render.generate_render_wrapper", new=wrapper):
        out = await tools.generate_render(prompt="moderno", session_id=PROJECT, tool_context=tool_context, **kwargs)
    return out, wrapper


async def test_an_explicit_room_renders_from_its_photo_and_files_the_render_there(tool_context):
    tool_context.state[ACTIVE_ROOM_STATE_KEY] = "cucina1"
    repo = _repo({"bagno1": "Bagno", "cucina1": "Cucina"}, {"bagno1": "https://x/bagno.jpg", "cucina1": "https://x/cucina.jpg"})

    out, wrapper = await _render(tool_context, repo, room_id="bagno1")

    assert out["status"] == "success"
    assert wrapper.await_args.kwargs["source_image_url"] == "https://x/bagno.jpg"
    assert wrapper.await_args.kwargs["room_id"] == "bagno1"
    assert out["artifact_filename"] == "render_bagno1_1.png"
    # Asking for a room's render does not switch the conversation's active room.
    assert tool_context.state[ACTIVE_ROOM_STATE_KEY] == "cucina1"


async def test_without_a_room_the_active_room_is_rendered(tool_context):
    tool_context.state[ACTIVE_ROOM_STATE_KEY] = "cucina1"
    repo = _repo({"cucina1": "Cucina"}, {"cucina1": "https://x/cucina.jpg"})

    out, wrapper = await _render(tool_context, repo)

    assert wrapper.await_args.kwargs["room_id"] == "cucina1"
    assert wrapper.await_args.kwargs["source_image_url"] == "https://x/cucina.jpg"
    assert out["artifact_filename"] == "render_cucina1_1.png"


async def test_a_second_render_of_a_room_gets_the_next_number(tool_context):
    tool_context.list_artifacts = AsyncMock(
        return_value=["render_bagno1_1.png", "render_cucina1_1.png", "render_bagno1_2.png"]
    )
    repo = _repo({"bagno1": "Bagno"}, {"bagno1": "https://x/bagno.jpg"})

    out, _ = await _render(tool_context, repo, room_id="bagno1")

    assert out["artifact_filename"] == "render_bagno1_3.png"
    tool_context.save_artifact.assert_awaited_once()
    assert tool_context.save_artifact.await_args.args[0] == "render_bagno1_3.png"


@pytest.mark.parametrize("room_id", ["cantina", "../other/rooms/x"])
async def test_a_room_outside_the_project_is_refused_before_generating(tool_context, room_id):
    repo = _repo({"bagno1": "Bagno"}, {})

    out, wrapper = await _render(tool_context, repo, room_id=room_id)

    assert out["status"] == "error" and "Stanza non trovata" in out["error"]
    wrapper.assert_not_awaited()


async def test_a_project_without_rooms_keeps_one_artifact_series(tool_context):
    with patch.object(tools, "latest_uploaded_photo_url", AsyncMock(return_value=None)):
        out, wrapper = await _render(tool_context, _repo({}, {}))

    assert wrapper.await_args.kwargs["room_id"] is None
    assert out["artifact_filename"] == "render_progetto_1.png"


async def test_the_render_file_belongs_to_the_room_rendered_not_the_photo_room():
    """A "Generale" photo used as the source of the bathroom render: the render is the bathroom's."""
    conversations = MagicMock()
    conversations.save_file_metadata = AsyncMock()
    rooms = MagicMock()
    rooms.find_file_by_storage_path = AsyncMock(return_value={"id": "f_old", "roomId": "generale"})
    with patch.object(render_module, "download_image_smart", AsyncMock(return_value=(b"img", "image/jpeg"))), \
         patch.object(render_module, "analyze_image_triage", AsyncMock(return_value={})), \
         patch.object(render_module, "generate_image_i2i", AsyncMock(
             return_value={"success": True, "mime_type": "png", "image_base64": "aW1n"})), \
         patch.object(render_module, "_upload_base64_image_sync", return_value="https://x/renders/r.png"), \
         patch.object(render_module, "session_media_path", return_value=f"projects/{PROJECT}/uploads/old.jpg"), \
         patch.object(render_module, "get_room_repository", return_value=rooms), \
         patch.object(render_module, "get_conversation_repository", return_value=conversations):
        out = await render_module.generate_render_wrapper(
            prompt="moderno", room_type="bagno", style="moderno", session_id=PROJECT,
            mode="modification", source_image_url="https://x/old.jpg", room_id="bagno1",
        )

    assert out["status"] == "success"
    file_meta = conversations.save_file_metadata.await_args.args[1]
    assert conversations.save_file_metadata.await_args.kwargs["room_id"] == "bagno1"
    assert file_meta["metadata"]["source_file_id"] == "f_old"


async def test_the_render_number_counts_only_that_rooms_renders(tool_context):
    """Room "camera" does not count the renders of "camera_2"."""
    tool_context.list_artifacts = AsyncMock(return_value=["render_camera_2_1.png", "render_camera_2_2.png"])
    repo = _repo({"camera": "Camera", "camera_2": "Camera 2"}, {"camera": "https://x/camera.jpg"})

    out, _ = await _render(tool_context, repo, room_id="camera")

    assert out["artifact_filename"] == "render_camera_1.png"
