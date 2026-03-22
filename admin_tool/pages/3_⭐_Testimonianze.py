"""
Testimonials Management — Streamlit page for moderating user-submitted reviews.

Handles the full cycle: pending list → detailed review → approve / reject.
Approved testimonials are immediately visible on the landing page via Firestore.

Skill: building-admin-dashboards — §Testimonial Moderation
"""
import logging
import time

import streamlit as st

from src.services.testimonial_service import TestimonialService

logger = logging.getLogger(__name__)

st.set_page_config(
    page_title="Recensioni | SYD Admin",
    page_icon="⭐",
    layout="wide",
)

# ─── Auth guard ──────────────────────────────────────────────────────────────
if not st.session_state.get("authentication_status"):
    st.warning("🔒 Accesso riservato. Torna alla home per autenticarti.")
    st.stop()


# ─── Service & Data Loaders ───────────────────────────────────────────────────
@st.cache_resource
def _get_service() -> TestimonialService:
    return TestimonialService()


@st.cache_data(ttl=30, show_spinner=False)
def _load_pending() -> list[dict]:
    """Cached pending testimonials — refreshed every 30 seconds."""
    svc = _get_service()
    items = svc.repo.get_by_status("pending")
    return items


service = _get_service()


# ─── Helpers ─────────────────────────────────────────────────────────────────
def _stars(n: int) -> str:
    return "⭐" * min(max(n, 0), 5)


# ─── Page Header ──────────────────────────────────────────────────────────────
col_title, col_refresh = st.columns([5, 1])
col_title.header("⭐ Gestione Recensioni")
if col_refresh.button("🔄 Aggiorna", help="Ricarica da Firestore"):
    _load_pending.clear()
    st.rerun()

pending = _load_pending()

# ─── Stats strip ──────────────────────────────────────────────────────────────
stats = service.get_stats()
s1, s2, s3 = st.columns(3)
s1.metric("In Attesa", stats.get("pending", 0))
s2.metric("Approvate", stats.get("approved", 0))
s3.metric("Rifiutate", stats.get("rejected", 0))

st.divider()

# ─── Pending List ─────────────────────────────────────────────────────────────
if not pending:
    st.success("✅ Nessuna recensione in attesa di moderazione.")
    st.stop()

st.subheader(f"📋 In Attesa di Revisione ({len(pending)})")

for t in pending:
    tid: str = t.get("id", "")
    name: str = t.get("name", "—")
    rating: int = int(t.get("rating", 0))
    text: str = t.get("text", "")

    with st.container(border=True):
        c_info, c_actions = st.columns([4, 1])

        with c_info:
            st.markdown(f"**{name}** &nbsp; {_stars(rating)}")
            st.markdown(f"> {text}")

        with c_actions:
            notes_key = f"notes_{tid}"
            if notes_key not in st.session_state:
                st.session_state[notes_key] = ""

            approve_col, reject_col = st.columns(2)

            if approve_col.button("✅", key=f"approve_{tid}", help="Approva — pubblica sul sito"):
                try:
                    service.approve(tid, st.session_state[notes_key])
                    st.toast(f"Recensione di {name} approvata!", icon="✅")
                    _load_pending.clear()
                    time.sleep(0.5)
                    st.rerun()
                except Exception as exc:
                    logger.exception("Approval failed.", extra={"testimonial_id": tid})
                    st.error(f"Errore: {exc}")

            if reject_col.button("❌", key=f"reject_{tid}", help="Rifiuta — nasconde la recensione"):
                try:
                    service.reject(tid, st.session_state[notes_key])
                    st.toast(f"Recensione di {name} rifiutata.", icon="❌")
                    _load_pending.clear()
                    time.sleep(0.5)
                    st.rerun()
                except Exception as exc:
                    logger.exception("Rejection failed.", extra={"testimonial_id": tid})
                    st.error(f"Errore: {exc}")

            st.text_input(
                "Note admin",
                key=notes_key,
                placeholder="Opzionale...",
                label_visibility="collapsed",
            )
