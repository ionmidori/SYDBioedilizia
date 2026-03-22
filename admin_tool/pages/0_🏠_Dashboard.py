"""
Home Dashboard — KPI overview, weekly approval trend, and quick-access metrics.

Skill: building-admin-dashboards — §KPI Dashboard
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import pandas as pd
import plotly.express as px
import streamlit as st

from src.db.quote_repo import QuoteRepository
from src.db.testimonial_repo import TestimonialRepository

logger = logging.getLogger(__name__)

st.set_page_config(
    page_title="Dashboard | SYD Admin",
    page_icon="🏠",
    layout="wide",
)

# ─── Auth guard ──────────────────────────────────────────────────────────────
if not st.session_state.get("authentication_status"):
    st.warning("🔒 Accesso riservato. Torna alla home per autenticarti.")
    st.stop()


# ─── Data Loaders ─────────────────────────────────────────────────────────────
# cache_data(ttl=60): dashboard metrics — 1-minute staleness is acceptable.

@st.cache_data(ttl=60, show_spinner=False)
def _load_dashboard_data() -> dict[str, Any]:
    """Load all collections needed for KPIs and charts in a single pass."""
    quote_repo = QuoteRepository()
    test_repo = TestimonialRepository()
    return {
        "pending": quote_repo.get_pending_quotes(),
        "historical": quote_repo.get_historical_quotes(),
        "testimonial_stats": test_repo.get_stats(),
    }


def _to_dt(val: Any) -> datetime | None:
    """Safely convert a Firestore timestamp or Python datetime to a naive UTC datetime."""
    if val is None:
        return None
    try:
        # DatetimeWithNanoseconds subclasses datetime; handle both aware and naive
        if hasattr(val, "tzinfo") and val.tzinfo is not None:
            return val.astimezone(timezone.utc).replace(tzinfo=None)
        return val
    except Exception:
        return None


# ─── Page Header ──────────────────────────────────────────────────────────────
col_title, col_refresh = st.columns([5, 1])
col_title.title("🏠 Dashboard")
if col_refresh.button("🔄 Aggiorna", help="Ricarica tutti i dati da Firestore"):
    _load_dashboard_data.clear()
    st.rerun()

data = _load_dashboard_data()
pending: list[dict[str, Any]] = data["pending"]
historical: list[dict[str, Any]] = data["historical"]
test_stats: dict[str, int] = data["testimonial_stats"]

approved = [q for q in historical if q.get("status") == "approved"]
rejected = [q for q in historical if q.get("status") == "rejected"]

pending_value = sum(
    q.get("financials", {}).get("grand_total", 0.0) for q in pending
)

# ─── KPI Row ──────────────────────────────────────────────────────────────────
st.subheader("📊 Metriche in Tempo Reale")
k1, k2, k3, k4, k5 = st.columns(5)
k1.metric("⏳ In Attesa", len(pending))
k2.metric("💶 Valore In Attesa", f"€{pending_value:,.0f}")
k3.metric("✅ Approvati", len(approved))
k4.metric("❌ Rifiutati", len(rejected))
k5.metric("💬 Recensioni Pending", test_stats.get("pending", 0))

st.divider()

# ─── Charts + Recent ──────────────────────────────────────────────────────────
col_chart, col_recent = st.columns([2, 1])

with col_chart:
    st.subheader("📈 Approvazioni Settimanali (ultime 8 settimane)")
    if approved:
        today = datetime.utcnow()
        # Build Monday-anchored week buckets for the last 8 weeks
        weeks = []
        for w in range(7, -1, -1):
            week_start = today - timedelta(days=today.weekday()) - timedelta(weeks=w)
            week_end = week_start + timedelta(days=7)
            count = sum(
                1
                for q in approved
                if (dt := _to_dt(q.get("created_at")))
                and week_start <= dt < week_end
            )
            weeks.append({"Settimana": week_start.strftime("%d %b"), "Approvazioni": count})

        df_chart = pd.DataFrame(weeks)
        fig = px.bar(
            df_chart,
            x="Settimana",
            y="Approvazioni",
            color_discrete_sequence=["#C9A84C"],
            template="plotly_dark",
        )
        fig.update_layout(
            plot_bgcolor="rgba(0,0,0,0)",
            paper_bgcolor="rgba(0,0,0,0)",
            margin=dict(l=0, r=0, t=10, b=0),
            xaxis=dict(showgrid=False),
            yaxis=dict(showgrid=True, gridcolor="rgba(255,255,255,0.05)"),
        )
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Nessun preventivo approvato ancora — il grafico apparirà qui.")

with col_recent:
    st.subheader("🕒 Ultimi Approvati")
    if approved:
        recent = sorted(
            approved,
            key=lambda q: _to_dt(q.get("created_at")) or datetime.min,
            reverse=True,
        )[:6]
        for q in recent:
            pid = q.get("project_id", "—")
            client = q.get("client_name", "—")
            total = q.get("financials", {}).get("grand_total", 0.0)
            st.markdown(f"**{pid}**  \n`{client}` — €{total:,.0f}")
            st.divider()
    else:
        st.info("Nessun preventivo approvato.")

# ─── Testimonials Summary ─────────────────────────────────────────────────────
st.divider()
st.subheader("⭐ Stato Recensioni")
t1, t2, t3 = st.columns(3)
t1.metric("In Attesa", test_stats.get("pending", 0))
t2.metric("Approvate", test_stats.get("approved", 0))
t3.metric("Rifiutate", test_stats.get("rejected", 0))
