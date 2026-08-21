#!/usr/bin/env python3
"""API + golden scenario smoke checks for ArchNova seed."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:5050"


def req(method: str, path: str, token: str | None = None, body: dict | None = None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"raw": raw}
        return exc.code, payload


def as_items(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        if isinstance(data.get("items"), list):
            return data["items"]
        if isinstance(data.get("meetings"), list):
            return data["meetings"]
        if isinstance(data.get("tasks"), list):
            return data["tasks"]
    return []


def summarize(data):
    if isinstance(data, dict):
        items = as_items(data)
        if items or "items" in data or "meetings" in data:
            total = data.get("total")
            if total is None and isinstance(data.get("pagination"), dict):
                total = data["pagination"].get("total")
            return f"items={len(items)} total={total}"
        return ",".join(list(data.keys())[:8])
    if isinstance(data, list):
        return f"list={len(data)}"
    return str(type(data))


def main() -> int:
    code, login = req("POST", "/api/v1/auth/login", body={"email": "md@archnova.com", "password": "ArchNovaDemo@2026"})
    print("login", code, login.get("success"))
    token = ((login.get("data") or {}).get("accessToken")) or ""
    if not token:
        print("FAIL: no access token", login)
        return 1

    paths = [
        "/api/v1/auth/me",
        "/api/v1/users?limit=5",
        "/api/v1/employees?search=Sathish",
        "/api/v1/projects?search=OMR",
        "/api/v1/projects?search=Villa",
        "/api/v1/tasks/overdue?limit=5",
        "/api/v1/tasks/today?limit=5",
        "/api/v1/meetings/today",
        "/api/v1/leads?limit=5",
        "/api/v1/customers?limit=5",
        "/api/v1/opportunities/pipeline",
        "/api/v1/sales/summary",
        "/api/v1/finance/summary",
        "/api/v1/finance/accounts",
        "/api/v1/dashboard/md",
        "/api/v1/dashboard/morning-report",
        "/api/v1/dashboard/attention",
        "/api/v1/notifications?limit=5",
        "/api/v1/reminders/today",
        "/api/v1/reminders/upcoming",
    ]
    failures = 0
    for path in paths:
        status, payload = req("GET", path, token=token)
        ok = status == 200 and payload.get("success") is True
        if not ok:
            failures += 1
        print(f"{'OK' if ok else 'FAIL'} {status} {path} :: {summarize(payload.get('data'))}")

    status, emp = req("GET", "/api/v1/employees?search=Sathish", token=token)
    items = as_items(emp.get("data"))
    if not items:
        print("FAIL: Sathish employee not found")
        return 1
    sathish = items[0]
    print("SATHISH", sathish.get("displayName"), sathish.get("employeeCode"), sathish.get("id"))
    sid = sathish.get("id")
    status, tasks = req("GET", f"/api/v1/tasks?assignedTo={sid}&limit=50", token=token)
    task_items = as_items(tasks.get("data"))
    golden = [t for t in task_items if str(t.get("taskId", "")).startswith("AN-TASK-GOLDEN")]
    print("SATHISH_GOLDEN_TASKS", len(golden))
    for t in golden:
        print("-", t.get("taskId"), t.get("status"), t.get("title"))
    needed = {
        "AN-TASK-GOLDEN-SATHISH-TODAY-PENDING",
        "AN-TASK-GOLDEN-SATHISH-TODAY-DONE",
        "AN-TASK-GOLDEN-SATHISH-OVERDUE",
        "AN-TASK-GOLDEN-SATHISH-INPROG",
    }
    found = {t.get("taskId") for t in golden}
    missing = needed - found
    if missing:
        print("FAIL missing golden tasks", missing)
        failures += 1

    status, meetings = req("GET", "/api/v1/meetings/today", token=token)
    mitems = as_items(meetings.get("data"))
    golden_meetings = [m for m in mitems if str(m.get("meetingId", "")).startswith("AN-MTG-GOLDEN")]
    print("GOLDEN_TODAY_MEETINGS", [(m.get("meetingId"), m.get("title")) for m in golden_meetings])
    if not any(m.get("meetingId") == "AN-MTG-GOLDEN-SATHISH-TODAY" for m in golden_meetings):
        status, all_m = req("GET", "/api/v1/meetings?limit=100", token=token)
        all_items = as_items(all_m.get("data"))
        if any(m.get("meetingId") == "AN-MTG-GOLDEN-SATHISH-TODAY" for m in all_items):
            print("WARN: Sathish meeting exists but not in /meetings/today window")
        else:
            print("FAIL: Sathish golden meeting missing")
            failures += 1

    status, omr = req("GET", "/api/v1/projects?search=" + urllib.parse.quote("OMR Commercial"), token=token)
    omr_items = as_items(omr.get("data"))
    print("OMR", [(i.get("projectId"), i.get("status"), i.get("progress"), i.get("budget"), i.get("actualExpense")) for i in omr_items[:3]])

    print("RESULT", "PASS" if failures == 0 else f"FAIL ({failures})")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
