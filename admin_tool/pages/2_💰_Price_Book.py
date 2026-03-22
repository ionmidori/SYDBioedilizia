"""
Price Book Editor — Admin page for managing the Master Price Book.

Storage strategy: Dual-write (Firestore primary + JSON fallback).
  - Read:  Firestore first; if empty, auto-seed from JSON (one-time migration).
  - Write: Firestore AND JSON in a single save → backend PricingService always
           has a fresh local JSON without any code changes.

Skill: building-admin-dashboards — §DATA_EDITOR_PATTERNS
"""
import json
import logging
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from src.db.price_book_repo import PriceBookRepository

logger = logging.getLogger(__name__)

# ─── JSON path (backend source of truth fallback) ────────────────────────────
_JSON_PATHS = [
    Path(__file__).parent.parent.parent.parent / "backend_python" / "src" / "data" / "master_price_book.json",
    Path(__file__).parent.parent / "data" / "master_price_book.json",
]

_CATEGORIES = [
    "Demolizioni",
    "Impianto Elettrico",
    "Impianto Idraulico",
    "Opere Murarie",
    "Pavimentazioni",
    "Tinteggiature",
    "Serramenti",
    "Altro",
]

_UNITS = ["mq", "ml", "cad", "ore", "kg", "mc"]


def _find_json() -> Path | None:
    for p in _JSON_PATHS:
        if p.exists():
            return p
    return None


def _load_json_items() -> list[dict[str, Any]]:
    path = _find_json()
    if not path:
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("items", [])
    except Exception:
        logger.exception("Error reading price book JSON.")
        return []


def _save_json(items: list[dict[str, Any]]) -> bool:
    path = _find_json()
    if not path:
        logger.warning("JSON price book path not found — skipping JSON write.")
        return False
    try:
        existing = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        existing["items"] = items
        path.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")
        return True
    except Exception:
        logger.exception("Error writing price book JSON.")
        return False


# ─── Cached loader (Firestore primary, JSON auto-seed fallback) ───────────────
@st.cache_data(ttl=120, show_spinner=False)
def _load_items() -> list[dict[str, Any]]:
    """
    Load items from Firestore. If Firestore is empty (first run), auto-seed
    from the backend JSON and persist to Firestore.
    """
    repo = PriceBookRepository()
    items = repo.get_items()
    if items:
        return items

    # One-time migration: seed Firestore from JSON
    json_items = _load_json_items()
    if json_items:
        logger.info(
            "Firestore price book empty — seeding from JSON.",
            extra={"item_count": len(json_items)},
        )
        try:
            repo.save_items(json_items)
            st.toast("✅ Listino migrato su Firestore automaticamente.", icon="✅")
        except Exception:
            logger.exception("Auto-seed to Firestore failed — using JSON only.")
        return json_items

    return []


def _dual_write(items: list[dict[str, Any]]) -> tuple[bool, bool]:
    """
    Persist items to both Firestore and JSON.

    Returns:
        (firestore_ok, json_ok)
    """
    repo = PriceBookRepository()
    firestore_ok = False
    json_ok = False
    try:
        repo.save_items(items)
        firestore_ok = True
    except Exception:
        logger.exception("Firestore write failed.")

    json_ok = _save_json(items)
    return firestore_ok, json_ok


# ─── Streamlit page ───────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Listino Prezzi | SYD Admin",
    page_icon="💰",
    layout="wide",
)

if not st.session_state.get("authentication_status"):
    st.warning("🔒 Accesso riservato. Torna alla home per autenticarti.")
    st.stop()

col_title, col_refresh = st.columns([5, 1])
col_title.title("💰 Listino Prezzi")
col_title.caption("Dual-write: salva su Firestore e aggiorna il JSON del backend.")
if col_refresh.button("🔄 Aggiorna", help="Ricarica da Firestore"):
    _load_items.clear()
    st.rerun()

items = _load_items()
df_raw = pd.DataFrame(items) if items else pd.DataFrame(
    columns=["sku", "description", "unit", "unit_price", "category"]
)

# ─── KPIs ────────────────────────────────────────────────────────────────────
if not df_raw.empty:
    c1, c2, c3 = st.columns(3)
    c1.metric("Voci nel listino", len(df_raw))
    c2.metric(
        "Categorie",
        df_raw["category"].nunique() if "category" in df_raw.columns else "—",
    )
    c3.metric(
        "Prezzo medio €/unità",
        f"€{df_raw['unit_price'].mean():.2f}" if "unit_price" in df_raw.columns else "—",
    )
    st.divider()

# ─── Category filter ─────────────────────────────────────────────────────────
categories = ["Tutte"] + (
    sorted(df_raw["category"].unique().tolist()) if "category" in df_raw.columns else []
)
selected_cat = st.selectbox("Filtra per categoria", categories)
display_df = df_raw if selected_cat == "Tutte" else df_raw[df_raw["category"] == selected_cat]

# ─── Editor ──────────────────────────────────────────────────────────────────
st.subheader("✏️ Modifica Voci")
edited_df: pd.DataFrame = st.data_editor(
    display_df,
    num_rows="dynamic",
    column_config={
        "sku": st.column_config.TextColumn("SKU", width="small", required=True),
        "description": st.column_config.TextColumn("Descrizione", width="large", required=True),
        "unit": st.column_config.SelectboxColumn("Unità", options=_UNITS, required=True),
        "unit_price": st.column_config.NumberColumn(
            "Prezzo €/Unità", min_value=0.0, format="€%.2f", required=True
        ),
        "category": st.column_config.SelectboxColumn(
            "Categoria", options=_CATEGORIES, required=True
        ),
    },
    use_container_width=True,
    hide_index=True,
    key="price_book_editor",
)

st.divider()

col_save, col_export = st.columns(2)

with col_save:
    if st.button("💾 Salva Listino", type="primary"):
        # Merge filtered category back into full dataset
        if selected_cat != "Tutte" and items:
            other = df_raw[df_raw["category"] != selected_cat]
            merged = pd.concat([other, edited_df], ignore_index=True)
            final_items = merged.to_dict("records")
        else:
            final_items = edited_df.to_dict("records")

        with st.spinner("Salvataggio su Firestore e JSON…"):
            fs_ok, json_ok = _dual_write(final_items)

        if fs_ok and json_ok:
            st.success(f"✅ Listino salvato! ({len(final_items)} voci) — Firestore ✓  JSON ✓")
        elif fs_ok:
            st.warning("⚠️ Firestore aggiornato ma JSON non trovato (backend locale assente).")
        elif json_ok:
            st.warning("⚠️ JSON aggiornato ma Firestore non raggiungibile.")
        else:
            st.error("❌ Errore nel salvataggio. Controlla i log.")

        _load_items.clear()

with col_export:
    if not edited_df.empty:
        csv = edited_df.to_csv(index=False).encode("utf-8")
        st.download_button(
            label="📥 Esporta CSV",
            data=csv,
            file_name="price_book_export.csv",
            mime="text/csv",
        )
