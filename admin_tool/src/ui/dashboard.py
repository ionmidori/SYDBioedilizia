"""
Dashboard: main landing page for the Admin Console.

Skill: building-admin-dashboards — §Quote Review Page
"""
import streamlit as st
import pandas as pd
from src.services.admin_service import AdminService


def show_dashboard(service: AdminService) -> None:
    """
    Display pending quotes dashboard with KPI metrics and per-row review actions.
    """
    st.header("📋 Preventivi in Attesa")

    df: pd.DataFrame = service.get_pending_quotes_df()

    if df.empty:
        st.info("✅ Nessun preventivo in attesa di revisione.")
        return

    # --- KPI aggregate ---
    col_kpi1, col_kpi2, col_kpi3 = st.columns(3)
    col_kpi1.metric("Preventivi in attesa", len(df))
    col_kpi2.metric(
        "Valore totale",
        f"€{df['total_amount'].sum():,.2f}",
    )
    col_kpi3.metric(
        "Valore medio",
        f"€{df['total_amount'].mean():,.2f}" if not df.empty else "—",
    )

    st.divider()

    # --- Per-row review list ---
    for _, row in df.iterrows():
        project_id: str = str(row.get("project_id", "—"))
        client_name: str = str(row.get("client_name", "—"))
        status: str = str(row.get("status", "—"))
        total: float = float(row.get("total_amount", 0.0))
        items_count: int = int(row.get("items_count", 0))

        with st.container():
            c1, c2, c3, c4, c5 = st.columns([3, 2, 1, 1, 1])
            with c1:
                st.write(f"**{project_id}**")
                st.caption(f"Cliente: {client_name}")
            with c2:
                badge = "🟡 draft" if status == "draft" else "🔵 in revisione"
                st.write(badge)
            with c3:
                st.write(f"€{total:,.2f}")
            with c4:
                st.write(f"{items_count} voci")
            with c5:
                if st.button("🔍 Rivedi", key=f"review_{project_id}"):
                    st.session_state.page = "review_quote"
                    st.session_state.selected_project_id = project_id
                    st.rerun()

        st.divider()
