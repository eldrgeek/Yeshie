#!/usr/bin/env python3
"""
Sync DNS records to a Netlify DNS zone.

Usage:
  export NETLIFY_TOKEN=your_token_here
  python netlify_dns_sync.py --domain mike-wolf.com --plan
  python netlify_dns_sync.py --domain mike-wolf.com --apply
  python netlify_dns_sync.py --domain mike-wolf.com --apply --prune

Notes:
- By default this script preserves Netlify-managed records.
- It creates missing records from DESIRED_RECORDS.
- With --prune, it deletes unmanaged records not present in DESIRED_RECORDS.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import requests


API_BASE = "https://api.netlify.com/api/v1"


# -----------------------------
# EDIT THIS LIST FOR YOUR DOMAIN
# -----------------------------
DESIRED_RECORDS: List[Dict[str, Any]] = [
    # Google Workspace MX
    {"type": "MX", "hostname": "mike-wolf.com", "value": "aspmx.l.google.com", "priority": 10},
    {"type": "MX", "hostname": "mike-wolf.com", "value": "alt1.aspmx.l.google.com", "priority": 20},
    {"type": "MX", "hostname": "mike-wolf.com", "value": "alt2.aspmx.l.google.com", "priority": 20},
    {"type": "MX", "hostname": "mike-wolf.com", "value": "aspmx2.googlemail.com", "priority": 30},
    {"type": "MX", "hostname": "mike-wolf.com", "value": "aspmx3.googlemail.com", "priority": 30},
    {"type": "MX", "hostname": "mike-wolf.com", "value": "aspmx4.googlemail.com", "priority": 30},
    {"type": "MX", "hostname": "mike-wolf.com", "value": "aspmx5.googlemail.com", "priority": 30},

    # SPF
    {"type": "TXT", "hostname": "mike-wolf.com", "value": "v=spf1 include:_spf.google.com ~all"},

    # Google service subdomains you mentioned
    {"type": "CNAME", "hostname": "calendar.mike-wolf.com", "value": "ghs.google.com"},
    {"type": "CNAME", "hostname": "docs.mike-wolf.com", "value": "ghs.google.com"},
    {"type": "CNAME", "hostname": "mail.mike-wolf.com", "value": "ghs.google.com"},
    {"type": "CNAME", "hostname": "sites.mike-wolf.com", "value": "ghs.google.com"},
    {"type": "CNAME", "hostname": "start.mike-wolf.com", "value": "ghs.google.com"},
    {"type": "CNAME", "hostname": "bookblog.mike-wolf.com", "value": "ghs.googlehosted.com"},
    {"type": "CNAME", "hostname": "arkhipov.mike-wolf.com", "value": "ghs.googlehosted.com"},
    {"type": "CNAME", "hostname": "thebook.mike-wolf.com", "value": "ghs.googlehosted.com"},
    {"type": "CNAME", "hostname": "notestomyself.mike-wolf.com", "value": "ghs.google.com"},
    {"type": "CNAME", "hostname": "gco.mike-wolf.com", "value": "domains.stunning.so"},

    # Domain verification / SES DKIM from your previous setup
    {"type": "TXT", "hostname": "mike-wolf.com", "value": "amazonses:5Y0E74QsECZiap8WqQhNCCfMBoDsMUbDuaToyH2gLn4="},
    {
        "type": "CNAME",
        "hostname": "hoiata4gbckquoryhykkxj6bjz67hr33._domainkey.mike-wolf.com",
        "value": "hoiata4gbckquoryhykkxj6bjz67hr33.dkim.amazonses.com",
    },
    {
        "type": "CNAME",
        "hostname": "trc7xk7w55dttzg6bnts5p4mmcihondg._domainkey.mike-wolf.com",
        "value": "trc7xk7w55dttzg6bnts5p4mmcihondg.dkim.amazonses.com",
    },

    # Optional Google verification CNAME you had
    {
        "type": "CNAME",
        "hostname": "tqsuohqiwadg.mike-wolf.com",
        "value": "gv-nddnqgwa2dcizh.dv.googlehosted.com",
    },

]


@dataclass(frozen=True)
class RecordKey:
    type: str
    hostname: str
    value: str
    priority: Optional[int] = None
    flag: Optional[int] = None
    tag: Optional[str] = None
    port: Optional[int] = None
    weight: Optional[int] = None


class NetlifyDNS:
    def __init__(self, token: str, timeout: int = 30) -> None:
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "netlify-dns-sync/1.0",
            }
        )
        self.timeout = timeout

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        url = f"{API_BASE}{path}"
        resp = self.session.request(method, url, timeout=self.timeout, **kwargs)
        if not resp.ok:
            msg = f"{method} {url} failed: {resp.status_code} {resp.text}"
            raise RuntimeError(msg)
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    def list_zones(self) -> List[Dict[str, Any]]:
        return self._request("GET", "/dns_zones")

    def get_zone_by_name(self, domain: str) -> Dict[str, Any]:
        zones = self.list_zones()
        for zone in zones:
            if zone.get("name") == domain or zone.get("domain") == domain:
                return zone
        available = [z.get("name") or z.get("domain") for z in zones]
        raise RuntimeError(f"DNS zone for {domain!r} not found. Available zones: {available}")

    def list_records(self, zone_id: str) -> List[Dict[str, Any]]:
        return self._request("GET", f"/dns_zones/{zone_id}/dns_records")

    def create_record(self, zone_id: str, record: Dict[str, Any]) -> Dict[str, Any]:
        payload = {k: v for k, v in record.items() if v is not None}
        return self._request("POST", f"/dns_zones/{zone_id}/dns_records", data=json.dumps(payload))

    def delete_record(self, zone_id: str, record_id: str) -> None:
        self._request("DELETE", f"/dns_zones/{zone_id}/dns_records/{record_id}")


def normalize_hostname(hostname: str, domain: str) -> str:
    h = hostname.strip().rstrip(".")
    if h == "@":
        return domain
    return h


def canonical_value(value: str) -> str:
    return value.strip().rstrip(".")


def record_key(rec: Dict[str, Any], domain: str) -> RecordKey:
    return RecordKey(
        type=str(rec["type"]).upper(),
        hostname=normalize_hostname(str(rec["hostname"]), domain).lower(),
        value=canonical_value(str(rec["value"])).lower(),
        priority=rec.get("priority"),
        flag=rec.get("flag"),
        tag=rec.get("tag"),
        port=rec.get("port"),
        weight=rec.get("weight"),
    )


def is_netlify_managed(rec: Dict[str, Any]) -> bool:
    if rec.get("managed") is True:
        return True
    t = str(rec.get("type", "")).upper()
    return t in {"NETLIFY", "NETLIFYV6"}


def pretty_record(rec: Dict[str, Any]) -> str:
    parts = [rec.get("type", "?"), rec.get("hostname", "?"), "->", rec.get("value", "?")]
    if rec.get("priority") is not None:
        parts.append(f"priority={rec['priority']}")
    return " ".join(str(x) for x in parts)


def build_create_payloads(domain: str) -> List[Dict[str, Any]]:
    payloads: List[Dict[str, Any]] = []
    for rec in DESIRED_RECORDS:
        payload = dict(rec)
        payload["type"] = payload["type"].upper()
        payload["hostname"] = normalize_hostname(payload["hostname"], domain)
        payload["value"] = canonical_value(payload["value"])
        payloads.append(payload)
    return payloads


def diff_records(
    domain: str,
    existing: List[Dict[str, Any]],
    desired: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    existing_keys = {record_key(r, domain): r for r in existing}
    desired_keys = {record_key(r, domain): r for r in desired}

    to_create = [r for k, r in desired_keys.items() if k not in existing_keys]
    to_delete = [r for k, r in existing_keys.items() if k not in desired_keys]
    return to_create, to_delete


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync DNS records to Netlify")
    parser.add_argument("--domain", required=True, help="DNS zone name, e.g. mike-wolf.com")
    parser.add_argument("--apply", action="store_true", help="Actually create/delete records")
    parser.add_argument("--plan", action="store_true", help="Show what would happen")
    parser.add_argument("--prune", action="store_true", help="Delete unmanaged records not in desired spec")
    parser.add_argument(
        "--include-netlify-managed-delete",
        action="store_true",
        help="Allow deletion of Netlify-managed records (dangerous; normally never do this)",
    )
    args = parser.parse_args()

    if not args.plan and not args.apply:
        parser.error("Choose --plan or --apply")

    token = 'nfp_RAzgqht6pX44aFkcdnUedbMiykXjsgz3bd95'
    if not token:
        print("Missing NETLIFY_TOKEN environment variable", file=sys.stderr)
        return 2

    client = NetlifyDNS(token=token)
    domain = args.domain.strip().lower()

    zone = client.get_zone_by_name(domain)
    zone_id = zone["id"]

    print(f"Zone: {domain}")
    print(f"Zone ID: {zone_id}")

    existing = client.list_records(zone_id)
    desired = build_create_payloads(domain)

    to_create, to_delete = diff_records(domain, existing, desired)

    # By default, never delete Netlify-managed records.
    prunable: List[Dict[str, Any]] = []
    if args.prune:
        for rec in to_delete:
            if is_netlify_managed(rec) and not args.include_netlify_managed_delete:
                continue
            prunable.append(rec)

    print("\nRecords to create:")
    if to_create:
        for rec in to_create:
            print("  +", pretty_record(rec))
    else:
        print("  (none)")

    print("\nRecords to delete:")
    if prunable:
        for rec in prunable:
            print("  -", pretty_record(rec))
    else:
        print("  (none)")

    if args.plan and not args.apply:
        return 0

    if args.apply:
        for rec in to_create:
            print("Creating:", pretty_record(rec))
            client.create_record(zone_id, rec)
            time.sleep(0.2)

        for rec in prunable:
            rid = rec.get("id")
            if not rid:
                print(f"Skipping delete; missing id: {pretty_record(rec)}", file=sys.stderr)
                continue
            print("Deleting:", pretty_record(rec))
            client.delete_record(zone_id, rid)
            time.sleep(0.2)

        print("\nDone.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())