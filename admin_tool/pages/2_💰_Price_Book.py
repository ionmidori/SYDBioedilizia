"""
Price Book Editor — Admin page for managing the Master Price Book.

Skill: building-admin-dashboards — §DATA_EDITOR_PATTERNS
Allows admins to view, edit, add, and save SKU items directly from the UI.
Changes are saved both to the local JSON (source of truth) and persisted.
"""
import json
import logging
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

logger = logging.getLogger(__name__)

# Path to the master price book JSON (shared with backend_python)
_PRICE_BOOK_PATHS = [
    # When running from project root
    Path(__file__).parent.parent.parent.parent / "backend_python" / "src" / "data" / "master_price_book.json",
    # Fallback: relative to this file
    Path(__file__).parent.parent / "data" / "master_price_book.json",
]


def _find_price_book() -> Path | None:
    """Locate the price book JSON, trying known paths."""
    for p in _PRICE_BOOK_PATHS:
        if p.exists():
            return p
    return None


def _load_price_book() -> list[dict[str, Any]]:
    """Load price book items from JSON. Returns empty list on error."""
    path = _find_price_book()
    if not path:
        st.warning("⚠️ master_price_book.json non trovato. Assicurati che il backend sia nella stessa cartella del progetto.")
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data.get("items", [])
    except Exception as exc:
        logger.exception("Error loading price book.")
        st.error(f"Errore nel caricamento del listino: {exc}")
        return []


def _save_price_book(items: list[dict[str, Any]]) -> bool:
    """Persist updated items back to JSON. Returns True on success."""
    path = _find_price_book()
    if not path:
        st.error("Impossibile salvare: file non trovato.")
        return False
    try:
        payload = {"items": items}
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        logger.info("Price book saved.", extra={"path": str(path), "items": len(items)})
        return True
    except Exception as exc:
        logger.exception("Error saving price book.")
        st.error(f"Errore nel salvataggio: {exc}")
        return False


# ─── Streamlit page ───────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Listino Prezzi | SYD Admin",
    page_icon="💰",
    layout="wide",
)

# Auth guard — auth_status set by root app.py
if not st.session_state.get("authentication_status"):
    st.warning("🔒 Accesso riservato. Torna alla home per autenticarti.")
    st.stop()

st.title("💰 Listino Prezzi")
st.caption("Editor del Master Price Book. Le modifiche si propagano all'AI Agent.")

items = _load_price_book()

if items:
    # KPIs
    df_raw = pd.DataFrame(items)
    c1, c2, c3 = st.columns(3)
    c1.metric("Voci nel listino", len(df_raw))
    c2.metric("Categorie", df_raw["category"].nunique() if "category" in df_raw.columns else "—")
    c3.metric("Prezzo medio €/unità", f"€{df_raw['unit_price'].mean():.2f}" if "unit_price" in df_raw.columns else "—")
    st.divider()

    # Filter by category
    categories = ["Tutte"] + sorted(df_raw["category"].unique().tolist()) if "category" in df_raw.columns else ["Tutte"]
    selected_cat = st.selectbox("Filtra per categoria", categories)

    display_df = df_raw if selected_cat == "Tutte" else df_raw[df_raw["category"] == selected_cat]
else:
    display_df = pd.DataFrame(columns=["sku", "description", "unit", "unit_price", "category"])

# Interactive editor
st.subheader("✏️ Modifica Voci")
edited_df: pd.DataFrame = st.data_editor(
    display_df,
    num_rows="dynamic",
    column_config={
        "sku": st.column_config.TextColumn("SKU", width="small", required=True),
        "description": st.column_config.TextColumn("Descrizione", width="large", required=True),
        "unit": st.column_config.SelectboxColumn(
            "Unità",
            options=["mq", "ml", "cad", "ore", "kg", "mc"],
            required=True,
        ),
        "unit_price": st.column_config.NumberColumn(
            "Prezzo €/Unità",
            min_value=0.0,
            format="€%.2f",
            required=True,
        ),
        "category": st.column_config.SelectboxColumn(
            "Categoria",
            options=[
                "Demolizioni",
                "Impianto Elettrico",
                "Impianto Idraulico",
                "Opere Murarie",
                "Pavimentazioni",
                "Tinteggiature",
                "Serramenti",
                "Altro",
            ],
            required=True,
        ),
    },
    use_container_width=True,
    hide_index=True,
    key="price_book_editor",
)

st.divider()

col_save, col_export = st.columns([1, 1])

with col_save:
    if st.button("💾 Salva Listino", type="primary"):
        # If filtering was active, merge back into full dataset
        if selected_cat != "Tutte" and items:
            # Replace filtered category rows with the edited ones
            full_df = pd.DataFrame(items)
            # Drop existing rows for this category and concat with edited
            other_cats = full_df[full_df["category"] != selected_cat]
            merged_df = pd.concat([other_cats, edited_df], ignore_index=True)
            final_items = merged_df.to_dict("records")
        else:
            final_items = edited_df.to_dict("records")

        if _save_price_book(final_items):
            st.success(f"✅ Listino salvato! ({len(final_items)} voci)")
            st.cache_data.clear()

with col_export:
    if not edited_df.empty:
        csv = edited_df.to_csv(index=False).encode("utf-8")
        st.download_button(
            label="📥 Esporta CSV",
            data=csv,
            file_name="price_book_export.csv",
            mime="text/csv",
        )
