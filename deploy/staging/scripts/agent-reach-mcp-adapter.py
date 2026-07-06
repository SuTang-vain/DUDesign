#!/usr/bin/env python3
"""
DUDesign Agent-Reach MCP HTTP adapter.

This adapter exposes the standard DUDesign MCP executor envelope:

  POST /v1/mcp/invocations
  { "request": McpInvocationRequest }

It intentionally returns a DUDesign-standard MCP result with a normalized
ResearchContextArtifact. DUDesign API remains unaware of Agent-Reach internals.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any
from urllib.parse import quote


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", "application/json; charset=utf-8")
    handler.send_header("content-length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def unavailable_result(request: dict[str, Any], message: str) -> dict[str, Any]:
    return {
        "invocationId": request.get("invocationId", "unknown"),
        "status": "unavailable",
        "mcpToolId": request.get("mcpToolId", "unknown"),
        "source": {
            "serverName": request.get("serverName", "agent-reach"),
            "toolName": request.get("toolName", "search"),
            "scopes": request.get("scopes", []),
        },
        "summary": "Agent-Reach MCP adapter unavailable.",
        "references": [],
        "error": {
            "code": "AGENT_REACH_UNAVAILABLE",
            "message": message,
            "retryable": True,
        },
        "completedAt": utc_now(),
    }


def command_available(command: str) -> bool:
    return shutil.which(command) is not None


def run_agent_reach_search(query: str, limit: int) -> tuple[str, Any]:
    custom_command = os.environ.get("AGENT_REACH_SEARCH_COMMAND", "").strip()
    if custom_command:
        completed = subprocess.run(
            custom_command,
            input=json.dumps({"query": query, "numResults": limit}, ensure_ascii=False),
            shell=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=int(os.environ.get("AGENT_REACH_COMMAND_TIMEOUT_SECONDS", "60")),
            check=False,
        )
        raw = completed.stdout.strip() or completed.stderr.strip()
        if completed.returncode != 0:
            raise RuntimeError(f"AGENT_REACH_SEARCH_COMMAND failed with {completed.returncode}: {raw[:500]}")
        return raw, parse_json_or_text(raw)

    if not command_available("mcporter"):
        raise RuntimeError("mcporter is required for Agent-Reach web search, or set AGENT_REACH_SEARCH_COMMAND.")

    expression = f"exa.web_search_exa(query: {json.dumps(query)}, numResults: {int(limit)})"
    completed = subprocess.run(
        ["mcporter", "call", expression],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=int(os.environ.get("AGENT_REACH_COMMAND_TIMEOUT_SECONDS", "60")),
        check=False,
    )
    raw = completed.stdout.strip() or completed.stderr.strip()
    if completed.returncode != 0:
        raise RuntimeError(f"mcporter Agent-Reach search failed with {completed.returncode}: {raw[:500]}")
    return raw, parse_json_or_text(raw)


def parse_json_or_text(raw: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"rawText": raw}


def collect_sources(payload: Any, query: str, completed_at: str, limit: int) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []

    def visit(value: Any) -> None:
        if len(sources) >= limit:
            return
        if isinstance(value, dict):
            url = first_string(value, ["url", "link", "href"])
            if url and url.startswith(("http://", "https://")):
                title = first_string(value, ["title", "name", "summary"])
                sources.append({
                    "url": url,
                    "title": title or url,
                    "platform": platform_for_url(url),
                    "retrievedAt": completed_at,
                    "licenseHint": "unknown",
                })
            for nested in value.values():
                visit(nested)
        elif isinstance(value, list):
            for item in value:
                visit(item)

    visit(payload)
    if not sources:
        sources.append({
            "url": f"https://agent-reach.local/search?q={quote(query)}",
            "title": f"Agent-Reach search for {query}",
            "platform": "unknown",
            "retrievedAt": completed_at,
            "licenseHint": "unknown",
        })
    return sources[:limit]


def first_string(record: dict[str, Any], keys: list[str]) -> str | None:
    for key in keys:
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def platform_for_url(url: str) -> str:
    lowered = url.lower()
    if "github.com" in lowered:
        return "github"
    if any(host in lowered for host in ["twitter.com", "x.com", "reddit.com", "xiaohongshu.com", "v2ex.com"]):
        return "social"
    if any(host in lowered for host in ["youtube.com", "youtu.be", "bilibili.com"]):
        return "video"
    return "web"


def research_context_for_search(request: dict[str, Any]) -> dict[str, Any]:
    input_payload = request.get("input") if isinstance(request.get("input"), dict) else {}
    query = str(input_payload.get("query") or input_payload.get("topic") or "DUDesign research context").strip()
    limit = input_payload.get("limit", 5)
    if not isinstance(limit, int) or limit < 1 or limit > 10:
        limit = 5
    completed_at = utc_now()
    raw, payload = run_agent_reach_search(query, limit)
    raw_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    sources = collect_sources(payload, query, completed_at, limit)
    risk_flags = []
    if sources and sources[0]["url"].startswith("https://agent-reach.local/"):
        risk_flags.append("no-source-url-detected")
    citations = [
        {
            "sourceUrl": source["url"],
            "note": "Agent-Reach search result normalized by DUDesign MCP adapter.",
        }
        for source in sources
    ]
    return {
        "schemaVersion": "2026-07-06.dudesign-research-context.v1",
        "query": query,
        "sources": sources,
        "summary": f"Agent-Reach returned {len(sources)} reviewed source reference(s) for \"{query}\".",
        "citations": citations,
        "confidence": "medium" if not risk_flags else "low",
        "freshness": "recent",
        "riskFlags": risk_flags,
        "rawPayloadHash": f"sha256:{raw_hash}",
        "reviewStatus": "human_review_required",
    }


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/v1/mcp/invocations":
            json_response(self, 404, {"error": {"code": "NOT_FOUND", "message": "Unknown endpoint."}})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            request = payload["request"]
            if request.get("serverName") != "agent-reach" or request.get("toolName") != "search":
                result = unavailable_result(request, "This adapter currently supports agent-reach.search only.")
            else:
                research_context = research_context_for_search(request)
                result = {
                    "invocationId": request["invocationId"],
                    "status": "ok",
                    "mcpToolId": request["mcpToolId"],
                    "source": {
                        "serverName": request["serverName"],
                        "toolName": request["toolName"],
                        "scopes": request.get("scopes", []),
                    },
                    "summary": research_context["summary"],
                    "references": [
                        {
                            "id": f"src_{index + 1}",
                            "title": source.get("title") or source["url"],
                            "url": source["url"],
                        }
                        for index, source in enumerate(research_context["sources"])
                    ],
                    "data": {
                        "researchContext": research_context,
                        "adapter": "agent-reach-mcp-adapter",
                    },
                    "completedAt": utc_now(),
                }
            json_response(self, 200, {"result": result})
        except Exception as error:  # noqa: BLE001 - adapter must normalize failures.
            request = locals().get("request") if isinstance(locals().get("request"), dict) else {}
            json_response(self, 200, {"result": unavailable_result(request, str(error))})

    def log_message(self, *_args: Any) -> None:
        return


def main() -> None:
    port = int(os.environ.get("AGENT_REACH_MCP_PORT", "4520"))
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
