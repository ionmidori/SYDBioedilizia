"""
Review Page: interactive quote editor with approval/rejection actions.

Skill: building-admin-dashboards — §Quote Review Page + §Approval actions
"""
import streamlit as st
import pandas as pd
from src.services.admin_service import AdminService


def show_quote_review(service: AdminService) -> None:
    """
    Detailed quote review with data editor, totals, project context, and approval flow.
    """
    project_id: str = st.session_state.get("selected_project_id", "")

    if st.button("← Torna alla Dashboard"):
        st.session_state.page = "dashboard"
        st.rerun()

    st.header(f"🔍 Revisione Preventivo: `{project_id}`")

    # --- Project context info ---
    project_info: dict = service.get_project_info(project_id)
    if project_info:
        with st.expander("ℹ️ Info Progetto", expanded=True):
            pi_c1, pi_c2, pi_c3 = st.columns(3)
            pi_c1.write(f"**Cliente:** {project_info.get('client_name', '—')}")
            pi_c2.write(f"**Email:** {project_info.get('client_email', project_info.get('email', '—'))}")
            pi_c3.write(f"**Indirizzo:** {project_info.get('address', '—')}")

    # --- Load quote ---
    quote_data: dict = service.get_quote_details(project_id)
    if not quote_data:
        st.error("Preventivo non trovato.")
        return

    items = quote_data.get("items", [])
    if items:
        items_df = pd.DataFrame(items)
    else:
        st.warning("Nessuna voce in questo preventivo.")
        items_df = pd.DataFrame(
            columns=["sku", "description", "unit", "qty", "unit_price", "total", "ai_reasoning"]
        )

    # --- Interactive Editor (skill: building-admin-dashboards §st.data_editor) ---
    st.subheader("✏️ Modifica Voci Preventivo")
    edited_df: pd.DataFrame = st.data_editor(
        items_df,
        num_rows="dynamic",
        column_config={
            "sku": st.column_config.TextColumn("SKU", width="small"),
            "description": st.column_config.TextColumn("Descrizione", width="large"),
            "unit": st.column_config.TextColumn("Unità", width="small"),
            "qty": st.column_config.NumberColumn("Quantità", min_value=0, format="%.2f"),
            "unit_price": st.column_config.NumberColumn("€/Unità", min_value=0, format="€%.2f"),
            "total": st.column_config.NumberColumn("Totale €", format="€%.2f", disabled=True),
            "ai_reasoning": st.column_config.TextColumn("Nota AI", width="medium"),
        },
        use_container_width=True,
        hide_index=True,
    )

    # --- Live totals recalculation ---
    if not edited_df.empty:
        edited_df["qty"] = pd.to_numeric(edited_df["qty"], errors="coerce").fillna(0)
        edited_df["unit_price"] = pd.to_numeric(edited_df["unit_price"], errors="coerce").fillna(0)
        edited_df["total"] = edited_df["qty"] * edited_df["unit_price"]

        subtotal = edited_df["total"].sum()
        vat_amount = subtotal * 0.22
        grand_total = subtotal + vat_amount

        st.divider()
        m1, m2, m3 = st.columns(3)
        m1.metric("Subtotale", f"€{subtotal:,.2f}")
        m2.metric("IVA (22%)", f"€{vat_amount:,.2f}")
        m3.metric("Totale", f"€{grand_total:,.2f}", delta=None)

    # --- Admin Notes ---
    st.divider()
    admin_notes: str = st.text_area(
        "📝 Note Amministratore",
        value=quote_data.get("admin_notes", ""),
        placeholder="Inserisci note interne o comunicazioni per il cliente...",
        height=100,
    )

    # --- Action buttons ---
    col_save, col_approve, col_reject = st.columns([1, 1, 1])

    with col_save:
        if st.button("💾 Salva Bozza", type="primary"):
            new_items = edited_df.to_dict("records") if not edited_df.empty else []
            service.update_quote_items(project_id, new_items)
            if admin_notes:
                from src.db.quote_repo import QuoteRepository
                QuoteRepository().update_quote(project_id, {"admin_notes": admin_notes})
            st.success("✅ Bozza salvata!")

    with col_approve:
        if st.button("✅ Approva & Invia", type="secondary"):
            with st.spinner("Generazione PDF e invio in corso..."):
                new_items = edited_df.to_dict("records") if not edited_df.empty else []
                service.update_quote_items(project_id, new_items)
                try:
                    service.approve_quote(project_id, admin_notes=admin_notes)
                    st.balloons()
                    st.success("🎉 Preventivo approvato e inviato al cliente!")
                except Exception as exc:
                    st.error(f"Errore durante l'approvazione: {exc}")
                    st.stop()

            import time
            time.sleep(2)
            st.session_state.page = "dashboard"
            st.rerun()

    with col_reject:
        if st.button("❌ Rifiuta"):
            from src.db.quote_repo import QuoteRepository
            QuoteRepository().update_quote(
                project_id, {"status": "rejected", "admin_notes": admin_notes}
            )
            st.warning("Preventivo rifiutato.")
            import time
            time.sleep(1)
            st.session_state.page = "dashboard"
            st.rerun()
