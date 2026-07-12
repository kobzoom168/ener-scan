"""Compare FTP directory listings by filename, not raw ls lines."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, Iterable, List, TypedDict


class ChangeItem(TypedDict):
    name: str
    kind: str
    size: int
    mtime: str
    perms: str


class ModifiedItem(TypedDict):
    name: str
    kind: str
    changes: List[str]


class ListingDiff(TypedDict):
    added: List[ChangeItem]
    removed: List[ChangeItem]
    modified: List[ModifiedItem]


UNIX_LS_RE = re.compile(
    r"^(?P<perms>[drwx-]{10})\s+"
    r"\d+\s+"
    r"\S+\s+\S+\s+"
    r"(?P<size>\d+)\s+"
    r"(?P<mtime>.+?)\s+"
    r"(?P<name>.+)$"
)


@dataclass(frozen=True)
class FtpEntry:
    name: str
    perms: str
    size: int
    mtime: str
    raw: str

    @property
    def kind(self) -> str:
        if self.perms.startswith("d"):
            return "directory"
        if self.perms.startswith("l"):
            return "symlink"
        return "file"


def _entry_icon(kind: str) -> str:
    if kind == "directory":
        return "📁"
    if kind == "symlink":
        return "🔗"
    return "📄"


def parse_listing(lines: Iterable[str]) -> Dict[str, FtpEntry]:
    entries: Dict[str, FtpEntry] = {}
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("total "):
            continue

        match = UNIX_LS_RE.match(line)
        if match:
            name = match.group("name")
            entries[name] = FtpEntry(
                name=name,
                perms=match.group("perms"),
                size=int(match.group("size")),
                mtime=match.group("mtime"),
                raw=line,
            )
            continue

        parts = line.split(None, 8)
        if len(parts) < 9:
            continue
        name = parts[8]
        entries[name] = FtpEntry(
            name=name,
            perms=parts[0],
            size=int(parts[4]),
            mtime=" ".join(parts[5:8]),
            raw=line,
        )
    return entries


def diff_listings(old_lines: Iterable[str], new_lines: Iterable[str]) -> ListingDiff:
    old = parse_listing(old_lines)
    new = parse_listing(new_lines)

    added: List[ChangeItem] = []
    removed: List[ChangeItem] = []
    modified: List[ModifiedItem] = []

    for name in sorted(set(new) - set(old)):
        entry = new[name]
        added.append(
            {
                "name": name,
                "kind": entry.kind,
                "size": entry.size,
                "mtime": entry.mtime,
                "perms": entry.perms,
            }
        )

    for name in sorted(set(old) - set(new)):
        entry = old[name]
        removed.append(
            {
                "name": name,
                "kind": entry.kind,
                "size": entry.size,
                "mtime": entry.mtime,
                "perms": entry.perms,
            }
        )

    for name in sorted(set(old) & set(new)):
        previous, current = old[name], new[name]
        changes: List[str] = []
        if previous.size != current.size:
            changes.append(f"size {previous.size} -> {current.size}")
        if previous.mtime != current.mtime:
            changes.append(f"mtime {previous.mtime} -> {current.mtime}")
        if previous.perms != current.perms:
            changes.append(f"perms {previous.perms} -> {current.perms}")
        if changes:
            modified.append(
                {
                    "name": name,
                    "kind": current.kind,
                    "changes": changes,
                }
            )

    return {"added": added, "removed": removed, "modified": modified}


def has_changes(diff: ListingDiff) -> bool:
    return bool(diff["added"] or diff["removed"] or diff["modified"])


def format_change_lines(items: List[ChangeItem]) -> str:
    lines: List[str] = []
    for item in items:
        icon = _entry_icon(item["kind"])
        lines.append(
            f"{icon} **{item['name']}** ({item['kind']}, {item['size']} bytes, {item['mtime']})"
        )
    return "\n".join(lines)


def format_modified_lines(items: List[ModifiedItem]) -> str:
    lines: List[str] = []
    for item in items:
        icon = _entry_icon(item["kind"])
        detail = "; ".join(item["changes"])
        lines.append(f"{icon} **{item['name']}** ({item['kind']}) - {detail}")
    return "\n".join(lines)


def build_discord_fields(diff: ListingDiff) -> List[dict]:
    fields: List[dict] = []

    if diff["added"]:
        fields.append(
            {
                "name": f"Added ({len(diff['added'])})",
                "value": format_change_lines(diff["added"])[:1024],
                "inline": False,
            }
        )

    if diff["removed"]:
        fields.append(
            {
                "name": f"Removed ({len(diff['removed'])})",
                "value": format_change_lines(diff["removed"])[:1024],
                "inline": False,
            }
        )

    if diff["modified"]:
        fields.append(
            {
                "name": f"Modified ({len(diff['modified'])})",
                "value": format_modified_lines(diff["modified"])[:1024],
                "inline": False,
            }
        )

    return fields


def build_summary_footer(diff: ListingDiff) -> str:
    parts: List[str] = []
    if diff["added"]:
        parts.append(f"Added: {len(diff['added'])}")
    if diff["removed"]:
        parts.append(f"Removed: {len(diff['removed'])}")
    if diff["modified"]:
        parts.append(f"Modified: {len(diff['modified'])}")
    summary = " | ".join(parts) if parts else "No changes"
    return f"{summary}\nFTP listing changed - please check site files"
