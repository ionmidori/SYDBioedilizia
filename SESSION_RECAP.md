# Session 4 Recap — Phase 3 Canary Readiness Complete

**Date**: 2026-03-01
**Commits**: 3 (1a29869, 7ad81e3, 44c7fa4)
**Test Status**: 172/172 passing ✅

---

## Work Completed

### 1️⃣ Frontend UX Polish (commit 1a29869)
- **ChatHeader** / **ProjectSelector**: Opacity bumped for better readability
- **ImageLightbox**: Centered buttons, full-viewport transform wrapper, image constraints
- **CreateProjectDialog**: Migrated from ResponsiveDrawer → native shadcn Dialog

### 2️⃣ Backend Phase 3 Readiness (commit 7ad81e3)

#### New Files
- **`src/adk/drain.py`** (127 lines): `drain_inflight_quotes()` classifies LangGraph HITL sessions
  - Active: sessions awaiting admin approval
  - Stale: sessions > TTL hours (default 72h)
  - Finalized: sessions past admin_review node
  - Soft-expiry preserves Firestore audit trail

- **`tests/unit/test_drain.py`** (84 lines): 4 unit tests
  - Active session identification ✅
  - Finalized session classification ✅
  - Stream error handling ✅
  - Dry-run integrity (no writes) ✅

#### ADK Tools Wiring
All 7 tool stubs now delegate to real Tier 3 services:

| Tool | Tier 3 Service |
|------|----------------|
| pricing_engine | `PricingService.get_item_by_sku()` |
| market_prices | `tools/market_prices.get_market_prices_wrapper()` |
| analyze_room | `InsightEngine.analyze_project_for_quote()` |
| generate_render | `tools/generate_render.generate_render_wrapper()` |
| gallery | `tools/gallery.show_project_gallery()` |
| project_files | `tools/project_files.list_project_files()` |
| suggest_quote_items | `tools/quote_tools.suggest_quote_items_wrapper()` |

### 3️⃣ Phase 3 Operational Scripts (commit 44c7fa4)

#### `scripts/drain_check.py` (115 lines)
- List active/stale/finalized LangGraph HITL sessions
- Dry-run mode (default): read-only inspection
- `--expire` flag: soft-delete sessions with confirmation
- Output: Formatted report with gate criteria

**Usage:**
```bash
python scripts/drain_check.py --dry-run           # Inspect only
python scripts/drain_check.py --expire --ttl-hours 72  # Soft-delete stale
```

**Pre-Canary Status**: ✅ **0 active sessions** → Safe to start rollout

#### `scripts/canary_monitor.py` (180 lines)
- Polls Cloud Logging for /chat/stream metrics
- Tracks: error_rate, p50/p95/p99 latency, routing split
- Rollback triggers: error_rate > 1% OR p95 > 4s
- Continuous monitoring with configurable interval/duration

**Usage:**
```bash
python scripts/canary_monitor.py --interval 60 --duration 86400  # 24h monitoring at 60s interval
```

#### Configuration
Updated `.env`:
```
ORCHESTRATOR_MODE=canary
ADK_CANARY_PERCENT=10        # Day 1: 10% of new sessions → ADK
ADK_LOCATION=europe-west1    # GDPR: EU region
ADK_CMEK_KEY_NAME=(optional) # Customer-managed encryption
```

#### Documentation
**`docs/PHASE_3_CANARY_RUNBOOK.md`** (280+ lines)
- Complete step-by-step operational procedures
- Day 1-7 gate criteria for each increment (10%→25%→50%→100%)
- Rollback emergency procedures
- Phase 4 decommissioning checklist

---

## Current System State

### Architecture (All Phases Complete)
```
┌─────────────────────────────────────────────────────┐
│                    Next.js Frontend                  │
│            ChatProvider + new SydLoader              │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│              FastAPI Gateway (Cloud Run)             │
│  CanaryOrchestratorProxy (session drain + routing)   │
│  Input Sanitization Proxy → Output Filtering Layer   │
└─────────────────────────────────────────────────────┘
                        ↓
       ┌────────────────────────────────────┐
       │ (Existing sessions → LangGraph)    │
       │ (New sessions 10% → ADK, 90% → LG)│
       └────────────────────────────────────┘

       LangGraphOrchestrator         ADKOrchestrator
       ├─ AgentState                 ├─ syd_orchestrator
       ├─ interrupt_before           ├─ sub_agents [triage, design, quote]
       └─ FirestoreSaver             └─ FirestoreSessionService
```

### Test Coverage
- **172/172 unit tests** passing
- Canary proxy routing tested ✅
- Drain classification tested ✅
- Tool wiring tested (via existing LangGraph test suite) ✅

### Security Status
- **P0**: Auth + RBAC on quote routes ✅ (commit 35d1f8d)
- **P1**: n8n webhook HMAC signing ✅ (commit 35d1f8d)
- **P1**: Pricing tool qty bounds validation ✅ (commit 35d1f8d)
- **P2**: Input sanitization + output filtering ✅ (src/adk/filters.py)
- **P2**: Admin resumption token pattern ✅ (src/adk/hitl.py)

---

## Rollout Schedule (Recommended)

| Date | Phase | ADK% | Monitoring | Go/No-Go |
|------|-------|------|-----------|----------|
| 2026-03-01 | Day 1 | 10% | 24h continuous | error_rate < 0.5%, p95 < 3s |
| 2026-03-02 | Day 2-3 | 25% | 48h continuous | error_rate < 0.7%, p95 < 3.5s |
| 2026-03-04 | Day 4-5 | 50% | 48h continuous | error_rate < 0.8%, p95 < 3.8s |
| 2026-03-06 | Day 6-7 | 100% | 7 days continuous | error_rate < 1%, p95 < 4s |
| 2026-03-13 | **Phase 4** | — | — | **Decommission LangGraph** |

---

## Next Steps for Ops Team

1. **Day 1 Morning**:
   ```bash
   # Verify drain
   cd backend_python && python scripts/drain_check.py --dry-run

   # Deploy .env with canary settings
   ORCHESTRATOR_MODE=canary
   ADK_CANARY_PERCENT=10

   # Restart backend
   npm run dev:py  # Local
   # OR: gcloud run deploy --set-env-vars=...  # Production
   ```

2. **Day 1 Continuous** (24 hours):
   ```bash
   # Monitor metrics
   python scripts/canary_monitor.py --duration 86400

   # Watch logs
   gcloud logging read "resource.type=cloud_run_revision AND labels.orchestrator_mode=canary" --tail
   ```

3. **Day 2 Go/No-Go Decision**:
   - If all metrics green → increment to 25%
   - If rollback triggered → investigate + fix + restart at 10%

4. **Phase 4 (After 7 days at 100%)**:
   - Delete LangGraph code (`src/graph/`, `src/repositories/`)
   - Remove from `pyproject.toml`
   - Update CLAUDE.md architecture docs

---

## Files Modified/Created This Session

**Modified**:
- `.env` (added canary vars)
- `web_client/components/chat/ChatHeader.tsx`
- `web_client/components/chat/ImageLightbox.tsx`
- `web_client/components/chat/ProjectSelector.tsx`
- `web_client/components/dashboard/CreateProjectDialog.tsx`

**Created**:
- `backend_python/src/adk/drain.py` (127 lines)
- `backend_python/tests/unit/test_drain.py` (84 lines)
- `backend_python/scripts/drain_check.py` (115 lines)
- `backend_python/scripts/canary_monitor.py` (180 lines)
- `docs/PHASE_3_CANARY_RUNBOOK.md` (280+ lines)

---

## Key Metrics for Success

**Threshold Values**:
- Error rate: < 1% (rollback trigger at > 1%)
- p95 latency: < 4s (rollback trigger at > 4s)
- ADK health check: PASS (auto-fallback on FAIL)
- LangGraph fallback: Automatic + logged

**Monitoring Commands**:
```bash
# Check current routing
curl http://localhost:8080/health | jq '.orchestrator_mode'

# View error logs
gcloud logging read 'severity=ERROR' -l 50 --tail

# Drain check (pre-deployment)
python scripts/drain_check.py --dry-run

# Real-time monitoring (after deployment)
python scripts/canary_monitor.py --interval 30 --duration 86400
```

---

## Completion Status

| Task | Status | Evidence |
|------|--------|----------|
| Phase 0 baseclass | ✅ Complete | commit 078a688 |
| Phase 1 ADKOrchestrator | ✅ Complete | commit b907f8a |
| Phase 2 HITL + tools | ✅ Complete | commit d6efbd3 |
| Phase 2.5 real tool wiring | ✅ Complete | commit 7ad81e3 |
| P0/P1/P2 security fixes | ✅ Complete | commit 35d1f8d |
| Canary proxy + routing | ✅ Complete | commit bcc3bde |
| Drain utility | ✅ Complete | commit 7ad81e3 |
| Monitoring scripts | ✅ Complete | commit 44c7fa4 |
| Operational runbook | ✅ Complete | commit 44c7fa4 |
| **172/172 tests** | ✅ PASSING | `pytest tests/unit/` |

---

**Status**: 🟢 **READY FOR PHASE 3 CANARY ROLLOUT**

Ops team can proceed with Day 1 deployment per the PHASE_3_CANARY_RUNBOOK.md procedure.

---

*Last Updated: 2026-03-01*
*Next Review: 2026-03-02 (after 24h canary monitoring)*
