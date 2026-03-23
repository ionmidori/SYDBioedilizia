"""
GDPR Lifecycle Monitor — Manual trigger and result viewer for the account
inactivity pipeline.

The pipeline runs automatically via Cloud Scheduler daily at 03:00 Europe/Rome.
This page lets an admin trigger it on demand and inspect results.

Lifecycle phases:
  Phase 1 (12 mo) → warning email sent
  Phase 2 (13 mo) → Firebase Auth disabled
  Phase 3 (24 mo) → PII anonymized + Auth deleted

Endpoint: POST {BACKEND_URL}/internal/lifecycle/run
Auth:     X-Lifecycle-Secret header (from LIFECYCLE_SECRET env var)

Skill: building-admin-dashboards — §GDPR Lifecycle Monitor
"""
import logging
import os

import httpx
import streamlit as st

logger = logging.getLogger(__name__)

_BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")
_LIFECYCLE_SECRET: str = os.getenv("LIFECYCLE_SECRET", "")
_TIMEOUT = 90.0  # lifecycle pass can take up to ~60s on large user bases

st.set_page_config(
    page_title="GDPR Monitor | SYD Admin",
    page_icon="🛡️",
    layout="wide",
)

if not st.session_state.get("authentication_status"):
    st.warning("🔒 Accesso riservato. Torna alla home per autenticarti.")
    st.stop()

# ─── Page Header ──────────────────────────────────────────────────────────────
st.title("🛡️ GDPR Lifecycle Monitor")
st.caption(
    "Trigger manuale della pipeline di inattività GDPR. "
    "La pipeline viene eseguita automaticamente ogni giorno alle 03:00 (Cloud Scheduler)."
)

# ─── Configuration Status ─────────────────────────────────────────────────────
st.subheader("⚙️ Configurazione")
cfg1, cfg2 = st.columns(2)
cfg1.metric("Backend URL", _BACKEND_URL)
cfg2.metric(
    "Lifecycle Secret",
    "✅ Configurato" if _LIFECYCLE_SECRET else "❌ Mancante (LIFECYCLE_SECRET)",
)

if not _LIFECYCLE_SECRET:
    st.error(
        "**`LIFECYCLE_SECRET` non configurata.** Aggiungi la variabile al file `.env` "
        "dell'admin tool con lo stesso valore usato nel backend."
    )
    st.stop()

st.divider()

# ─── Phase Reference ──────────────────────────────────────────────────────────
with st.expander("ℹ️ Fasi del Ciclo di Vita GDPR", expanded=False):
    st.markdown("""
| Fase | Inattività | Azione |
|------|-----------|--------|
| 1 | 12 mesi | Email di avviso inattività inviata |
| 2 | 13 mesi | Account Firebase Auth disabilitato |
| 3 | 24 mesi | PII anonimizzato + account eliminato |

L'endpoint verifica la data di **ultima attività** (`lastActivityAt`) di ogni utente.
""")

# ─── Manual Trigger ───────────────────────────────────────────────────────────
st.subheader("🚀 Esecuzione Manuale")

col_btn, col_info = st.columns([1, 3])

with col_info:
    st.info(
        "L'esecuzione può richiedere fino a 60 secondi su grandi volumi di utenti. "
        "Non ricaricare la pagina durante il processo."
    )

with col_btn:
    run_now = st.button(
        "▶️ Esegui Ora",
        type="primary",
        help=f"POST {_BACKEND_URL}/internal/lifecycle/run",
    )

if run_now:
    with st.spinner("Pipeline GDPR in esecuzione…"):
        try:
            response = httpx.post(
                f"{_BACKEND_URL}/internal/lifecycle/run",
                headers={"X-Lifecycle-Secret": _LIFECYCLE_SECRET},
                timeout=_TIMEOUT,
            )
            response.raise_for_status()
            result: dict = response.json()

        except httpx.TimeoutException:
            st.error("⏱️ Timeout: il backend non ha risposto entro 90 secondi.")
            st.stop()
        except httpx.HTTPStatusError as exc:
            st.error(
                f"❌ Errore HTTP {exc.response.status_code}: {exc.response.text}"
            )
            logger.error(
                "Lifecycle trigger failed.",
                extra={"status": exc.response.status_code, "body": exc.response.text},
            )
            st.stop()
        except Exception as exc:
            st.error(f"❌ Errore di connessione: {exc}")
            logger.exception("Lifecycle trigger connection error.")
            st.stop()

    # ─── Results ─────────────────────────────────────────────────────────────
    pipeline_status = result.get("status", "unknown")
    if pipeline_status == "ok":
        st.success("✅ Pipeline completata senza errori.")
    else:
        st.warning("⚠️ Pipeline completata con errori parziali.")

    st.divider()
    st.subheader("📊 Risultati")

    r1, r2, r3 = st.columns(3)
    r1.metric("📧 Avvisati (Fase 1)", result.get("warned", 0))
    r2.metric("🔒 Disabilitati (Fase 2)", result.get("disabled", 0))
    r3.metric("🗑️ Anonimizzati (Fase 3)", result.get("anonymized", 0))

    errors: list[str] = result.get("errors", [])
    if errors:
        st.divider()
        st.subheader("⚠️ Errori Parziali")
        for err in errors:
            st.error(err)
    else:
        st.caption("Nessun errore registrato in questa esecuzione.")
