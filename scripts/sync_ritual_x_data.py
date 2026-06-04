from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
XLSX_PATH = ROOT / "henritual.xlsx"
DATA_PATH = ROOT / "data" / "dapps.js"
AVATAR_DIR = ROOT / "assets" / "avatars"

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
ROW_HEADERS = ("siteUrl", "title", "owner", "xHandle", "xUrl")
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)


def main() -> int:
    if not XLSX_PATH.exists():
        print(f"Missing source file: {XLSX_PATH}", file=sys.stderr)
        return 1

    AVATAR_DIR.mkdir(parents=True, exist_ok=True)

    rows = read_sheet_rows(XLSX_PATH)
    entries = []
    avatar_success = 0
    profile_success = 0
    profile_cache: dict[str, dict[str, str]] = {}

    for index, row in enumerate(rows, start=1):
        site_url = normalize_url(row["siteUrl"])
        title = row["title"].strip()
        owner = row["owner"].strip()
        raw_handle = sanitize_handle(row["xHandle"].strip())
        raw_url = row["xUrl"].strip()
        url_handle = extract_handle_from_url(raw_url)

        # Spreadsheet quality is uneven. When username and URL conflict, prefer the username cell.
        if raw_handle and url_handle and raw_handle.lower() != url_handle.lower():
            x_handle = raw_handle
            x_url = normalize_x_url("", raw_handle)
        else:
            x_handle = raw_handle or url_handle or owner
            x_url = normalize_x_url(raw_url, x_handle)

        profile = profile_cache.get(x_url or x_handle)
        if profile is None:
            profile = fetch_x_profile(x_url, x_handle)
            profile_cache[x_url or x_handle] = profile
            if profile.get("fetched"):
                profile_success += 1

        final_handle = sanitize_handle(profile.get("screen_name") or x_handle or owner)
        final_x_url = profile.get("profile_url") or normalize_x_url(x_url, final_handle)
        avatar_local_path = ""

        if profile.get("avatar_url"):
            avatar_local_path = download_avatar(profile["avatar_url"], final_handle)
            if avatar_local_path:
                avatar_success += 1

        entries.append(
            {
                "siteUrl": site_url,
                "title": title,
                "owner": owner,
                "ownerDisplayName": profile.get("name") or owner,
                "xHandle": final_handle,
                "xUrl": final_x_url,
                "xAvatarUrl": avatar_local_path,
                "ownerRole": "Ritual builder",
                "functionLabel": title,
                "notes": "Synced from henritual.xlsx",
            }
        )

        print(
            f"[{index:02d}/{len(rows):02d}] "
            f"{title} -> @{final_handle} | avatar={'yes' if avatar_local_path else 'no'}"
        )
        time.sleep(0.15)

    output = "window.RITUAL_DAPPS = " + json.dumps(entries, ensure_ascii=False, indent=2) + ";\n"
    DATA_PATH.write_text(output, encoding="utf-8")

    print(
        f"\nSynced {len(entries)} entries. "
        f"Profile fetch success: {profile_success}. "
        f"Avatar download success: {avatar_success}."
    )
    return 0


def read_sheet_rows(path: Path) -> list[dict[str, str]]:
    with ZipFile(path) as archive:
        shared_strings = load_shared_strings(archive)
        sheet_root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        sheet_data = sheet_root.find(f"{{{NS_MAIN}}}sheetData")
        if sheet_data is None:
            return []

        rows = []
        for row in sheet_data.findall(f"{{{NS_MAIN}}}row"):
            cells = parse_row_cells(row, shared_strings)
            if cells and cells[0].strip() == "App Name":
                continue
            if not cells or not cells[0].strip():
                continue

            padded = cells + [""] * (len(ROW_HEADERS) - len(cells))
            rows.append(dict(zip(ROW_HEADERS, padded[: len(ROW_HEADERS)])))

        return rows


def load_shared_strings(archive: ZipFile) -> list[str]:
    shared_path = "xl/sharedStrings.xml"
    if shared_path not in archive.namelist():
        return []

    root = ET.fromstring(archive.read(shared_path))
    strings = []
    for item in root.findall(f"{{{NS_MAIN}}}si"):
        strings.append("".join(node.text or "" for node in item.iter(f"{{{NS_MAIN}}}t")))
    return strings


def parse_row_cells(row: ET.Element, shared_strings: list[str]) -> list[str]:
    values: list[str] = []
    current_index = 0

    for cell in row.findall(f"{{{NS_MAIN}}}c"):
        ref = cell.attrib.get("r", "")
        target_index = column_index(ref)
        while current_index < target_index:
            values.append("")
            current_index += 1

        cell_type = cell.attrib.get("t")
        value_el = cell.find(f"{{{NS_MAIN}}}v")
        value = "" if value_el is None else (value_el.text or "")

        if cell_type == "s" and value:
            value = shared_strings[int(value)]

        values.append(value)
        current_index += 1

    return values


def column_index(cell_ref: str) -> int:
    match = re.match(r"([A-Z]+)", cell_ref)
    if not match:
        return 0

    name = match.group(1)
    value = 0
    for char in name:
        value = value * 26 + (ord(char) - 64)
    return value - 1


def normalize_url(value: str) -> str:
    if not value:
        return ""
    if value.startswith(("http://", "https://")):
        return value
    return "https://" + value


def sanitize_handle(value: str) -> str:
    return value.strip().replace("@", "").replace("`", "")


def extract_handle_from_url(value: str) -> str:
    if not value:
        return ""

    try:
        parsed = urllib.parse.urlparse(value)
    except ValueError:
        return ""

    path = parsed.path.strip("/")
    if not path:
        return ""

    return sanitize_handle(path.split("/")[0])


def normalize_x_url(x_url: str, x_handle: str) -> str:
    if x_url:
        if x_url.startswith(("http://", "https://")):
            return x_url
        return "https://" + x_url.lstrip("/")

    handle = sanitize_handle(x_handle)
    if not handle:
        return ""

    return f"https://x.com/{urllib.parse.quote(handle)}"


def fetch_x_profile(x_url: str, x_handle: str) -> dict[str, str]:
    profile_url = x_url or normalize_x_url("", x_handle)
    if not profile_url:
        return {}

    request = urllib.request.Request(
        profile_url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            html = response.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError):
        return {}

    avatar_url = first_match(html, r'"profile_image_url_https":"([^"]+)"')
    display_name = first_match(html, r'"name":"([^"]+)"')
    screen_name = first_match(html, r'"screen_name":"([^"]+)"')

    if avatar_url:
        avatar_url = avatar_url.replace("\\/", "/")

    return {
        "fetched": "1",
        "avatar_url": upgrade_avatar_resolution(avatar_url),
        "name": decode_json_fragment(display_name),
        "screen_name": decode_json_fragment(screen_name),
        "profile_url": normalize_x_url("", decode_json_fragment(screen_name) or x_handle),
    }


def first_match(text: str, pattern: str) -> str:
    match = re.search(pattern, text)
    return "" if match is None else match.group(1)


def decode_json_fragment(value: str) -> str:
    if not value:
        return ""

    try:
        decoded = json.loads(f'"{value}"')
    except json.JSONDecodeError:
        decoded = value

    if isinstance(decoded, str) and "â" in decoded:
        try:
            decoded = decoded.encode("latin1").decode("utf-8")
        except UnicodeError:
            pass

    return decoded


def upgrade_avatar_resolution(url: str) -> str:
    if not url:
        return ""
    return re.sub(r"_normal(\.[a-zA-Z0-9]+)$", r"_400x400\1", url)


def download_avatar(url: str, handle: str) -> str:
    if not url:
        return ""

    file_ext = Path(urllib.parse.urlparse(url).path).suffix or ".jpg"
    safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "-", handle.lower()).strip("-") or "avatar"
    target = AVATAR_DIR / f"{safe_name}{file_ext}"

    if target.exists():
        return relative_asset_path(target)

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Referer": "https://x.com/",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            target.write_bytes(response.read())
    except (urllib.error.URLError, TimeoutError):
        return ""

    return relative_asset_path(target)


def relative_asset_path(path: Path) -> str:
    return "./" + path.relative_to(ROOT).as_posix()


if __name__ == "__main__":
    raise SystemExit(main())
