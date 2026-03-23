"""
Portfolio Manager — Admin page for managing "I Nostri Capolavori" gallery.

Workflow:
  - List view: all projects with thumbnail, visibility toggle, edit, delete
  - Add view: form with image upload + metadata
  - Edit view: same form pre-filled with existing data

Images are uploaded directly to Firebase Storage (Admin SDK, make_public()).
The landing page Portfolio.tsx reads from Firestore and falls back to
hardcoded defaults when the collection is empty.

Skill: building-admin-dashboards — §Portfolio Management
"""
import logging
import time

import streamlit as st

from src.services.portfolio_service import PortfolioService

logger = logging.getLogger(__name__)

st.set_page_config(
    page_title="Portfolio | SYD Admin",
    page_icon="🖼️",
    layout="wide",
)

if not st.session_state.get("authentication_status"):
    st.warning("🔒 Accesso riservato. Torna alla home per autenticarti.")
    st.stop()

# ─── Constants ────────────────────────────────────────────────────────────────
CATEGORIES = ["Soggiorno", "Cucina", "Bagno", "Camera da letto", "Ufficio", "Intero Appartamento", "Esterni", "Altro"]

# ─── Service ──────────────────────────────────────────────────────────────────
@st.cache_resource
def _get_service() -> PortfolioService:
    return PortfolioService()


@st.cache_data(ttl=30, show_spinner=False)
def _load_projects() -> list[dict]:
    return _get_service().get_all()


service = _get_service()

# ─── Routing ──────────────────────────────────────────────────────────────────
if "portfolio_view" not in st.session_state:
    st.session_state.portfolio_view = "list"
if "editing_project" not in st.session_state:
    st.session_state.editing_project = None


# ═══════════════════════════════════════════════════════════════════════════════
# VIEW: List
# ═══════════════════════════════════════════════════════════════════════════════

def _render_list() -> None:
    col_title, col_add, col_refresh = st.columns([4, 1, 1])
    col_title.header("🖼️ Portfolio — I Nostri Capolavori")
    if col_add.button("➕ Aggiungi", type="primary"):
        st.session_state.portfolio_view = "add"
        st.rerun()
    if col_refresh.button("🔄"):
        _load_projects.clear()
        st.rerun()

    projects = _load_projects()

    if not projects:
        st.info("Nessun progetto ancora. Clicca **➕ Aggiungi** per iniziare.")
        return

    st.caption(f"{len(projects)} progetti — visibili sul sito: {sum(1 for p in projects if p.get('active', True))}")
    st.divider()

    for p in projects:
        pid: str    = p.get("id", "")
        title: str  = p.get("title", "—")
        cat: str    = p.get("category", "—")
        loc: str    = p.get("location", "—")
        img: str    = p.get("image_url", "")
        active: bool = p.get("active", True)
        order: int  = p.get("order", 0)

        with st.container(border=True):
            c_img, c_info, c_actions = st.columns([1, 4, 2])

            # Thumbnail
            with c_img:
                if img:
                    st.image(img, use_container_width=True)
                else:
                    st.markdown("🖼️ *Nessuna immagine*")

            # Info
            with c_info:
                st.markdown(f"**{title}** &nbsp; `#{order}`")
                st.caption(f"{cat} · {loc}")
                badge = "🟢 Visibile" if active else "⚫ Nascosto"
                st.markdown(badge)

            # Actions
            with c_actions:
                a1, a2 = st.columns(2)
                if a1.button("✏️ Modifica", key=f"edit_{pid}"):
                    st.session_state.portfolio_view = "edit"
                    st.session_state.editing_project = p
                    st.rerun()

                if a2.button("🗑️ Elimina", key=f"del_{pid}"):
                    st.session_state[f"confirm_del_{pid}"] = True

                if st.session_state.get(f"confirm_del_{pid}"):
                    st.warning(f"Eliminare **{title}**? Questa azione non è reversibile.")
                    c_yes, c_no = st.columns(2)
                    if c_yes.button("✅ Sì, elimina", key=f"yes_{pid}"):
                        service.delete(pid, img)
                        _load_projects.clear()
                        st.session_state.pop(f"confirm_del_{pid}", None)
                        st.rerun()
                    if c_no.button("❌ Annulla", key=f"no_{pid}"):
                        st.session_state.pop(f"confirm_del_{pid}", None)
                        st.rerun()

                # Visibility toggle
                new_active = st.toggle(
                    "Visibile sul sito",
                    value=active,
                    key=f"active_{pid}",
                )
                if new_active != active:
                    service.set_active(pid, new_active)
                    _load_projects.clear()
                    st.rerun()


# ═══════════════════════════════════════════════════════════════════════════════
# VIEW: Add / Edit Form
# ═══════════════════════════════════════════════════════════════════════════════

def _render_form(editing: dict | None = None) -> None:
    is_edit = editing is not None
    title_label = "✏️ Modifica Progetto" if is_edit else "➕ Nuovo Progetto"

    if st.button("← Torna alla lista"):
        st.session_state.portfolio_view = "list"
        st.session_state.editing_project = None
        st.rerun()

    st.header(title_label)

    # ── Image Upload ──────────────────────────────────────────────────────────
    st.subheader("📷 Immagine")
    current_img = (editing or {}).get("image_url", "")
    if current_img:
        st.image(current_img, width=300, caption="Immagine attuale")
        st.caption("Carica una nuova immagine per sostituirla, oppure lascia vuoto per mantenerla.")

    uploaded = st.file_uploader(
        "Carica immagine (JPG, PNG, WebP — max 10 MB)",
        type=["jpg", "jpeg", "png", "webp"],
        key="portfolio_upload",
    )

    # ── Metadata ──────────────────────────────────────────────────────────────
    st.subheader("📝 Dettagli Progetto")
    col1, col2 = st.columns(2)

    with col1:
        title = st.text_input("Titolo *", value=(editing or {}).get("title", ""))
        category = st.selectbox(
            "Categoria *",
            CATEGORIES,
            index=CATEGORIES.index((editing or {}).get("category", CATEGORIES[0]))
            if (editing or {}).get("category") in CATEGORIES
            else 0,
        )

    with col2:
        location = st.text_input("Città / Zona *", value=(editing or {}).get("location", ""))
        order = st.number_input(
            "Ordine di visualizzazione",
            min_value=1,
            value=int((editing or {}).get("order", 99)),
            step=1,
        )

    description = st.text_area(
        "Descrizione",
        value=(editing or {}).get("description", ""),
        height=100,
        placeholder="Descrizione breve del progetto di ristrutturazione…",
    )

    # Stats
    st.subheader("📊 Statistiche")
    current_stats = (editing or {}).get("stats", {})
    s1, s2, s3 = st.columns(3)
    stat_area     = s1.text_input("Superficie (es. 120 mq)",   value=current_stats.get("area", ""))
    stat_duration = s2.text_input("Durata (es. 3 mesi)",       value=current_stats.get("duration", ""))
    stat_budget   = s3.text_input("Budget (es. €85k)",         value=current_stats.get("budget", ""))

    active = st.checkbox("Visibile sul sito", value=(editing or {}).get("active", True))

    st.divider()

    if st.button("💾 Salva Progetto", type="primary"):
        # Validation
        if not title.strip():
            st.error("Il titolo è obbligatorio.")
            return
        if not location.strip():
            st.error("La città/zona è obbligatoria.")
            return
        if not is_edit and not uploaded and not current_img:
            st.error("È necessario caricare un'immagine per un nuovo progetto.")
            return

        with st.spinner("Salvataggio in corso…"):
            try:
                # Upload new image if provided
                image_url = current_img
                if uploaded:
                    image_url = service.upload_image(
                        file_bytes=uploaded.read(),
                        content_type=uploaded.type,
                        original_name=uploaded.name,
                    )

                project_data = {
                    "title": title.strip(),
                    "category": category,
                    "location": location.strip(),
                    "description": description.strip(),
                    "stats": {
                        "area": stat_area.strip(),
                        "duration": stat_duration.strip(),
                        "budget": stat_budget.strip(),
                    },
                    "image_url": image_url,
                    "active": active,
                    "order": int(order),
                }

                if is_edit:
                    service.update(editing["id"], project_data)
                    st.success(f"✅ Progetto **{title}** aggiornato!")
                else:
                    service.create(**{k: project_data[k] for k in
                                     ["title", "category", "location", "description",
                                      "stats", "image_url", "active"]})
                    st.success(f"✅ Progetto **{title}** creato!")

                _load_projects.clear()
                time.sleep(1)
                st.session_state.portfolio_view = "list"
                st.session_state.editing_project = None
                st.rerun()

            except Exception as exc:
                logger.exception("Error saving portfolio project.")
                st.error(f"Errore nel salvataggio: {exc}")


# ─── Router ───────────────────────────────────────────────────────────────────
view = st.session_state.portfolio_view

if view == "list":
    _render_list()
elif view == "add":
    _render_form(editing=None)
elif view == "edit" and st.session_state.editing_project:
    _render_form(editing=st.session_state.editing_project)
else:
    st.session_state.portfolio_view = "list"
    st.rerun()
