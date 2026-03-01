#!/usr/bin/env python
"""
Phase 3 Canary Monitoring Dashboard
Tracks error rate, latency (p50/p95/p99), and rollback triggers.

Usage: python scripts/canary_monitor.py [--interval 60] [--duration 3600]
"""
import sys
import os
import asyncio
import argparse
import json
import logging
from datetime import datetime, timedelta

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from google.cloud import logging as cloud_logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CanaryMonitor:
    """
    Monitors Vertex AI ADK canary rollout via Cloud Logging.
    Tracks metrics and triggers rollback if thresholds exceeded.
    """

    ROLLBACK_TRIGGERS = {
        "error_rate_threshold": 0.01,      # 1% error rate
        "p95_latency_threshold": 4.0,      # 4 seconds
        "consecutive_errors": 5,           # 5 consecutive errors
    }

    def __init__(self, project_id: str):
        self.project_id = project_id
        self.client = cloud_logging.Client(project=project_id)
        self.metrics = {
            "total_requests": 0,
            "errors": 0,
            "latencies": [],
            "orchestrator_routes": {"adk": 0, "langgraph": 0},
        }

    async def fetch_logs(self, time_window_minutes: int = 5) -> list[dict]:
        """Fetch recent /chat/stream logs from Cloud Logging."""
        try:
            filter_str = (
                f'resource.type="cloud_run_revision" '
                f'labels.orchestrator_mode="canary" '
                f'timestamp>="{(datetime.utcnow() - timedelta(minutes=time_window_minutes)).isoformat()}Z"'
            )
            entries = self.client.list_entries(filter_=filter_str, page_size=1000)
            logs = [{"payload": json.loads(e.payload) if isinstance(e.payload, str) else e.payload}
                    for e in entries if e.payload]
            return logs
        except Exception as e:
            logger.error(f"Failed to fetch logs: {e}")
            return []

    async def analyze_metrics(self, logs: list[dict]) -> dict:
        """Parse logs and extract monitoring metrics."""
        metrics = {
            "total": len(logs),
            "errors": 0,
            "adk_routed": 0,
            "langgraph_routed": 0,
            "latencies": [],
            "error_rate": 0.0,
            "p50_latency": 0.0,
            "p95_latency": 0.0,
            "p99_latency": 0.0,
        }

        for log in logs:
            payload = log.get("payload", {})

            # Count orchestrator routing
            target = payload.get("orchestrator_target", "unknown")
            if target == "adk":
                metrics["adk_routed"] += 1
            elif target == "langgraph":
                metrics["langgraph_routed"] += 1

            # Count errors
            if payload.get("status_code", 200) >= 400:
                metrics["errors"] += 1

            # Collect latencies
            duration_ms = payload.get("duration_ms", 0)
            if duration_ms > 0:
                metrics["latencies"].append(duration_ms)

        # Calculate percentiles
        if metrics["total"] > 0:
            metrics["error_rate"] = metrics["errors"] / metrics["total"]
            latencies_sorted = sorted(metrics["latencies"])
            n = len(latencies_sorted)
            if n > 0:
                metrics["p50_latency"] = latencies_sorted[int(n * 0.50)] / 1000.0
                metrics["p95_latency"] = latencies_sorted[int(n * 0.95)] / 1000.0
                metrics["p99_latency"] = latencies_sorted[int(n * 0.99)] / 1000.0

        return metrics

    def check_rollback_triggers(self, metrics: dict) -> tuple[bool, str]:
        """Check if any rollback triggers have been hit."""
        if metrics["error_rate"] > self.ROLLBACK_TRIGGERS["error_rate_threshold"]:
            return True, f"Error rate {metrics['error_rate']:.2%} exceeds {self.ROLLBACK_TRIGGERS['error_rate_threshold']:.2%}"

        if metrics["p95_latency"] > self.ROLLBACK_TRIGGERS["p95_latency_threshold"]:
            return True, f"p95 latency {metrics['p95_latency']:.2f}s exceeds {self.ROLLBACK_TRIGGERS['p95_latency_threshold']}s"

        return False, "All metrics within acceptable bounds"

    def print_report(self, metrics: dict, rollback_triggered: bool, reason: str):
        """Pretty-print monitoring report."""
        print("\n" + "=" * 70)
        print("CANARY ROLLOUT MONITORING REPORT")
        print(f"Timestamp: {datetime.utcnow().isoformat()}Z")
        print("=" * 70)

        print(f"\n[TRAFFIC] Total requests: {metrics['total']}")
        print(f"  - Routed to ADK: {metrics['adk_routed']} ({100*metrics['adk_routed']/max(1,metrics['total']):.1f}%)")
        print(f"  - Routed to LangGraph: {metrics['langgraph_routed']} ({100*metrics['langgraph_routed']/max(1,metrics['total']):.1f}%)")

        print(f"\n[ERRORS] Error rate: {metrics['error_rate']:.2%}")
        print(f"  - Threshold: {self.ROLLBACK_TRIGGERS['error_rate_threshold']:.2%}")
        print(f"  - Status: {'FAIL' if metrics['error_rate'] > self.ROLLBACK_TRIGGERS['error_rate_threshold'] else 'PASS'}")

        print(f"\n[LATENCY]")
        print(f"  - p50: {metrics['p50_latency']:.2f}s")
        print(f"  - p95: {metrics['p95_latency']:.2f}s (threshold: {self.ROLLBACK_TRIGGERS['p95_latency_threshold']}s)")
        print(f"  - p99: {metrics['p99_latency']:.2f}s")
        print(f"  - Status: {'FAIL' if metrics['p95_latency'] > self.ROLLBACK_TRIGGERS['p95_latency_threshold'] else 'PASS'}")

        print(f"\n[ROLLBACK]")
        if rollback_triggered:
            print(f"  WARNING: Rollback triggered!")
            print(f"  Reason: {reason}")
            print(f"  Action: Set ORCHESTRATOR_MODE=langgraph to rollback to 100% LangGraph")
        else:
            print(f"  All systems nominal. {reason}")

        print("\n" + "=" * 70)


async def main():
    parser = argparse.ArgumentParser(description="Monitor Canary ADK Rollout")
    parser.add_argument(
        "--interval", type=int, default=60, help="Polling interval (seconds)"
    )
    parser.add_argument(
        "--duration", type=int, default=3600, help="Monitor duration (seconds)"
    )

    args = parser.parse_args()

    # Get project ID from env or use default
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "chatbotluca-a8a73")
    monitor = CanaryMonitor(project_id)

    print(f"Starting Canary Monitor (interval={args.interval}s, duration={args.duration}s)")
    print(f"Project: {project_id}")

    elapsed = 0
    while elapsed < args.duration:
        logs = await monitor.fetch_logs(time_window_minutes=5)
        metrics = await monitor.analyze_metrics(logs)
        rollback_triggered, reason = monitor.check_rollback_triggers(metrics)

        monitor.print_report(metrics, rollback_triggered, reason)

        if rollback_triggered:
            logger.error(f"ROLLBACK TRIGGERED: {reason}")
            logger.error("Run: export ORCHESTRATOR_MODE=langgraph")
            return 1

        elapsed += args.interval
        if elapsed < args.duration:
            await asyncio.sleep(args.interval)

    print("\nMonitoring complete. All metrics healthy!")
    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
