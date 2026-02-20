"""
Quotes Management — Streamlit multipage entry for quote review workflow.

Handles the full cycle: pending list → detailed review → approve / reject.
Auth check is performed via session_state set by the root app.py.

Skill: building-admin-dashboards — §Quote Review Page, §Approval actions
"""
import logging
import time
from typing import Any

import pandas as pd
import streamlit as st

from src.services.admin_service import AdminService

logger = logging.getLogger(__name__)

st.set_page_config(
    page_title="Preventivi | SYD Admin",
    page_icon="📋",
    layout="wide",
)

# ─── Auth guard ──────────────────────────────────────────────────────────────
if not st.session_state.get("authentication_status"):
    st.warning("🔒 Accesso riservato. Torna alla home per autenticarti.")
    st.stop()

# ─── Service ─────────────────────────────────────────────────────────────────
# Cached per session to avoid re-instantiation on every rerun
@st.cache_resource
def _get_service() -> AdminService:
    return AdminService()

service = _get_service()

# ─── Page routing (within this page) ─────────────────────────────────────────
if "quotes_view" not in st.session_state:
    st.session_state.quotes_view = "list"
if "selected_project_id" not in st.session_state:
    st.session_state.selected_project_id = None


# ═══════════════════════════════════════════════════════════════════════════
# VIEW: List (Dashboard)
# ═══════════════════════════════════════════════════════════════════════════

def _render_list() -> None:
    st.header("📋 Preventivi in Attesa di Revisione")

    df: pd.DataFrame = service.get_pending_quotes_df()

    if df.empty:
        st.info("✅ Nessun preventivo in attesa.")
        return

    # KPI row
    c1, c2, c3 = st.columns(3)
    c1.metric("In attesa", len(df))
    c2.metric("Valore totale", f"€{df['total_amount'].sum():,.2f}")
    c3.metric("Valore medio", f"€{df['total_amount'].mean():,.2f}")

    st.divider()

    for _, row in df.iterrows():
        pid: str         = str(row.get("project_id", "—"))
        client: str      = str(row.get("client_name", "—"))
        status: str      = str(row.get("status", "—"))
        total: float     = float(row.get("total_amount", 0.0))
        n_items: int     = int(row.get("items_count", 0))

        badge = "🟡 Bozza" if status == "draft" else "🔵 In revisione"

        with st.container():
            c1, c2, c3, c4, cta = st.columns([3, 2, 1, 1, 1])
            c1.markdown(f"**{pid}**  \n`{client}`")
            c2.write(badge)
            c3.write(f"€{total:,.2f}")
            c4.write(f"{n_items} voci")
            if cta.button("🔍 Rivedi", key=f"btn_{pid}"):
                st.session_state.quotes_view = "review"
                st.session_state.selected_project_id = pid
                st.rerun()
        st.divider()


# ═══════════════════════════════════════════════════════════════════════════
# VIEW: Review
# ═══════════════════════════════════════════════════════════════════════════

def _render_review(project_id: str) -> None:
    if st.button("← Torna alla lista"):
        st.session_state.quotes_view = "list"
        st.rerun()

    st.header(f"🔍 Revisione: `{project_id}`")

    # Project info
    project_info: dict[str, Any] = service.get_project_info(project_id)
    if project_info:
        with st.expander("ℹ️ Info Progetto", expanded=True):
            i1, i2, i3 = st.columns(3)
            i1.write(f"**Cliente:** {project_info.get('client_name', '—')}")
            i2.write(f"**Email:** {project_info.get('client_email', project_info.get('email', '—'))}")
            i3.write(f"**Indirizzo:** {project_info.get('address', '—')}")

    # Quote data
    quote_data: dict[str, Any] = service.get_quote_details(project_id)
    if not quote_data:
        st.error("Preventivo non trovato in database.")
        return

    items = quote_data.get("items", [])
    items_df = pd.DataFrame(items) if items else pd.DataFrame(
        columns=["sku", "description", "unit", "qty", "unit_price", "total", "ai_reasoning"]
    )

    # Interactive editor
    st.subheader("✏️ Voci del Preventivo")
    edited_df: pd.DataFrame = st.data_editor(
        items_df,
        num_rows="dynamic",
        column_config={
            "sku":          st.column_config.TextColumn("SKU", width="small"),
            "description":  st.column_config.TextColumn("Descrizione", width="large"),
            "unit":         st.column_config.TextColumn("Unità", width="small"),
            "qty":          st.column_config.NumberColumn("Qtà", min_value=0, format="%.2f"),
            "unit_price":   st.column_config.NumberColumn("€/Unità", min_value=0, format="€%.2f"),
            "total":        st.column_config.NumberColumn("Totale €", format="€%.2f", disabled=True),
            "ai_reasoning": st.column_config.TextColumn("Nota AI", width="medium"),
        },
        use_container_width=True,
        hide_index=True,
        key=f"editor_{project_id}",
    )

    # Live totals
    if not edited_df.empty:
        edited_df["qty"]        = pd.to_numeric(edited_df.get("qty", 0), errors="coerce").fillna(0)
        edited_df["unit_price"] = pd.to_numeric(edited_df.get("unit_price", 0), errors="coerce").fillna(0)
        edited_df["total"]      = edited_df["qty"] * edited_df["unit_price"]

        subtotal    = edited_df["total"].sum()
        vat_amount  = subtotal * 0.22
        grand_total = subtotal + vat_amount

        st.divider()
        m1, m2, m3 = st.columns(3)
        m1.metric("Subtotale", f"€{subtotal:,.2f}")
        m2.metric("IVA (22%)", f"€{vat_amount:,.2f}")
        m3.metric("Totale Finale", f"€{grand_total:,.2f}")

    # Admin notes
    st.divider()
    admin_notes: str = st.text_area(
        "📝 Note Amministratore",
        value=quote_data.get("admin_notes", ""),
        placeholder="Note interne o per il cliente...",
        height=90,
    )

    # Actions
    col_save, col_approve, col_reject = st.columns(3)

    with col_save:
        if st.button("💾 Salva Bozza", type="primary"):
            new_items = edited_df.to_dict("records") if not edited_df.empty else []
            service.update_quote_items(project_id, new_items)
            if admin_notes:
                from src.db.quote_repo import QuoteRepository
                QuoteRepository().update_quote(project_id, {"admin_notes": admin_notes})
            st.success("Bozza salvata!")

    with col_approve:
        if st.button("✅ Approva & Invia"):
            with st.spinner("Generazione PDF e invio…"):
                new_items = edited_df.to_dict("records") if not edited_df.empty else []
                service.update_quote_items(project_id, new_items)
                try:
                    service.approve_quote(project_id, admin_notes=admin_notes)
                    st.balloons()
                    st.success("🎉 Preventivo approvato e inviato al cliente!")
                    time.sleep(2)
                    st.session_state.quotes_view = "list"
                    st.rerun()
                except Exception as exc:
                    logger.exception("Approval failed.", extra={"project_id": project_id})
                    st.error(f"Errore: {exc}")

    with col_reject:
        if st.button("❌ Rifiuta"):
            from src.db.quote_repo import QuoteRepository
            QuoteRepository().update_quote(
                project_id,
                {"status": "rejected", "admin_notes": admin_notes},
            )
            st.warning("Preventivo rifiutato.")
            time.sleep(1)
            st.session_state.quotes_view = "list"
            st.rerun()


# ─── Router ──────────────────────────────────────────────────────────────────
if st.session_state.quotes_view == "list":
    _render_list()
elif st.session_state.quotes_view == "review" and st.session_state.selected_project_id:
    _render_review(st.session_state.selected_project_id)
else:
    st.session_state.quotes_view = "list"
    st.rerun()
