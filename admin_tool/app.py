"""
SYD Admin Console — Root App (Auth Shell).

This file handles ONLY authentication. Navigation is handled by Streamlit's
native multipage system (pages/ folder).

Skill: building-admin-dashboards — §Authentication (streamlit-authenticator)
"""
import logging
from pathlib import Path

import streamlit as st
import yaml
from yaml.loader import SafeLoader
import streamlit_authenticator as stauth

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)

# ─── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="SYD Admin Console",
    page_icon="🏗️",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
        /* Force vertical scrolling to work on desktop */
        .stApp {
            overflow-y: auto !important;
        }
        .main .block-container {
            padding-bottom: 5rem !important;
        }
    </style>
    """,
    unsafe_allow_html=True,
)

# ─── Config (CWD-independent path resolution) ─────────────────────────────────
_CONFIG_PATH = Path(__file__).parent / "config.yaml"
with _CONFIG_PATH.open("r", encoding="utf-8") as _f:
    _config = yaml.load(_f, Loader=SafeLoader)

# ─── Authenticator ────────────────────────────────────────────────────────────
authenticator = stauth.Authenticate(
    _config["credentials"],
    _config["cookie"]["name"],
    _config["cookie"]["key"],
    _config["cookie"]["expiry_days"],
)

# ─── Login form + session state population ────────────────────────────────────
try:
    name, authentication_status, username = authenticator.login("Login", "main")
except Exception as e:
    logger.warning("Auth error (stale cookie?): %s — resetting session.", e)
    st.session_state.clear()
    st.warning("⚠️ Sessione non valida. Cancella i cookie del browser se il problema persiste.")
    st.stop()
    authentication_status = None

if authentication_status:
    st.sidebar.title(f"👤 {name}")
    authenticator.logout("Logout", "sidebar")
    st.sidebar.info("Usa il menu di navigazione ↑ per accedere alle sezioni.")

    # Landing content after login
    st.title("🏗️ SYD Bioedilizia — Admin Console")
    st.markdown(
        """
        Benvenuto nella console di amministrazione.

        Seleziona una sezione dal menu laterale:

        | Sezione | Descrizione |
        |---|---|
        | 🏠 Dashboard | KPI in tempo reale, trend approvazioni, riepilogo recensioni |
        | 📋 Preventivi | Revisione, modifica, approvazione e storico dei preventivi |
        | ⭐ Recensioni | Moderazione delle testimonianze utenti (approva / rifiuta) |
        | 📦 Lotti | Gestione dei preventivi multi-progetto (batch) |
        | 💰 Listino Prezzi | Master Price Book con dual-write Firestore + JSON |
        | 🛡️ GDPR Monitor | Trigger manuale pipeline inattività GDPR (3 fasi) |
        | 🖼️ Portfolio | Gestione gallery "I Nostri Capolavori" con upload immagini |
        """
    )

elif authentication_status is False:
    st.error("❌ Username o password non corretti.")
elif authentication_status is None:
    st.info("👆 Inserisci le credenziali nel form qui sopra per accedere.")
