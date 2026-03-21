"""
Batches Management — Streamlit page for reviewing cross-project quote batches.

Skill: building-admin-dashboards
"""
import logging
import streamlit as st
import pandas as pd

from src.services.batch_admin_service import BatchAdminService

logger = logging.getLogger(__name__)

st.set_page_config(
    page_title="Gestione Lotti | SYD Admin",
    page_icon="📦",
    layout="wide",
)

# ─── Auth guard ──────────────────────────────────────────────────────────────
if not st.session_state.get("authentication_status"):
    st.warning("🔒 Accesso riservato. Torna alla home per autenticarti.")
    st.stop()

# ─── Service ─────────────────────────────────────────────────────────────────
@st.cache_resource
def _get_batch_service() -> BatchAdminService:
    return BatchAdminService()

service = _get_batch_service()

# ─── Session State ───────────────────────────────────────────────────────────
if "batch_view" not in st.session_state:
    st.session_state.batch_view = "list"
if "selected_batch_id" not in st.session_state:
    st.session_state.selected_batch_id = None

# ─── Event Handlers ──────────────────────────────────────────────────────────
def goto_list():
    st.session_state.batch_view = "list"
    st.session_state.selected_batch_id = None

def goto_detail(batch_id: str):
    st.session_state.batch_view = "detail"
    st.session_state.selected_batch_id = batch_id

def handle_decision(batch_id: str, project_id: str, decision: str, notes: str):
    with st.spinner(f"Processando elaborazione ({decision}) per {project_id}..."):
        service.decide_project_in_batch(batch_id, project_id, decision, notes)
        st.toast(f"Progetto {project_id} elaborato con successo: {decision}!", icon="✅")


# ─── List View ───────────────────────────────────────────────────────────────
def render_list_view():
    st.title("📦 Lotti in Attesa di Approvazione")
    st.markdown("Questa dashboard permette di revisionare i lotti multisito (Quote Batch) sottoposti dagli utenti.")
    
    df = service.get_submitted_batches_df()
    if df.empty:
        st.info("Nessun lotto in attesa di revisione al momento.")
        return

    st.dataframe(
        df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "batch_id": st.column_config.TextColumn("ID Lotto"),
            "status": st.column_config.TextColumn(
                "Stato Lotto",
                help="Stato attuale del lotto",
            ),
            "total_projects": st.column_config.NumberColumn("N° Progetti"),
            "batch_grand_total": st.column_config.NumberColumn(
                "Totale Lordo",
                format="€ %.2f",
            ),
            "potential_savings": st.column_config.NumberColumn(
                "Risparmi Previsti",
                format="€ %.2f",
            ),
            "user_id": st.column_config.TextColumn("ID Utente"),
            "submitted_at": st.column_config.TextColumn("Data Invio")
        }
    )

    st.subheader("Seleziona Lotto")
    selected_id = st.selectbox("Apri il lotto per autorizzare i singoli progetti:", df["batch_id"].tolist())
    if st.button("Revisiona Lotto", type="primary"):
        goto_detail(selected_id)
        st.rerun()

# ─── Detail View ─────────────────────────────────────────────────────────────
def render_detail_view():
    st.button("⬅ Torna alla lista", on_click=goto_list)

    batch_id = st.session_state.selected_batch_id
    batch = service.get_batch_details(batch_id)
    if not batch:
        st.error("Errore: lotto non trovato o non disponibile.")
        return

    st.header(f"Dettaglio Lotto: {batch_id}")
    
    col1, col2, col3 = st.columns(3)
    original_total = batch.get('batch_grand_total', 0.0)
    savings = batch.get('potential_savings', 0.0)
    
    col1.metric("Totale Originale", f"€ {original_total:.2f}")
    col2.metric("Risparmi Aggregazione (Preview)", f"€ {savings:.2f}")
    col3.metric("Totale Ottimizzato", f"€ {original_total - savings:.2f}")

    if batch.get("aggregation_preview"):
        with st.expander("Visualizza Dettagli Ottimizzazione Multiprogetto"):
            st.json(batch.get("aggregation_preview"))

    st.markdown("---")
    st.subheader("Progetti Inclusi")
    projects = batch.get("projects", [])
    
    for p in projects:
        pid = p.get("project_id")
        pname = p.get("project_name", pid)
        pstatus = p.get("status", "draft")
        subtotal = p.get("subtotal", 0.0)

        # Usiamo un'icona testuale basata sullo stato
        icon = "⏳"
        if pstatus == "approved":
            icon = "✅"
        elif pstatus == "rejected":
            icon = "❌"

        with st.expander(f"{icon} {pname} [{pstatus}] — Subtotale: € {subtotal:.2f}"):
            st.caption(f"Project ID: `{pid}` | Elementi originari: {p.get('item_count', 0)}")
            if p.get("admin_notes"):
                st.write(f"**Note Storiche:** {p.get('admin_notes')}")
            
            # Form per decidere se non è ancora approvato/rifiutato
            if pstatus not in ("approved", "rejected"):
                notes = st.text_area("Aggiungi note per il cliente (opzionale)", key=f"notes_{pid}")
                
                c1, c2, _ = st.columns([2, 2, 6])
                with c1:
                    if st.button("👍 Approva Progetto", key=f"approve_{pid}", type="primary"):
                        handle_decision(batch_id, pid, "approve", notes)
                        st.rerun()
                with c2:
                    if st.button("👎 Rifiuta Progetto", key=f"reject_{pid}"):
                        handle_decision(batch_id, pid, "reject", notes)
                        st.rerun()
            else:
                st.success(f"Questo progetto è già stato elaborato con stato: {pstatus}")

# ─── Main Routing ────────────────────────────────────────────────────────────
if st.session_state.batch_view == "list":
    render_list_view()
else:
    render_detail_view()
