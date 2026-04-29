#!/usr/bin/env python3
"""Build compact frontend amenity points from FEHD and LCSD CSV files."""

import csv
import json
import re
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "frontend" / "data" / "amenities.json"
XLSX_NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

SOURCES = [
    {
        "type": "restaurant",
        "path": ROOT / "raw data" / "FEHD_RL_converted.csv",
        "predicate": None,
        "lat": ("LATITUDE", "GeometryLatitude"),
        "lng": ("LONGITUDE", "GeometryLongitude"),
        "name": ("NSEARCH03_EN", "NSEARCH03_TC", "NAME_EN", "NAME_TC"),
        "address": ("ADDRESS_EN", "ADDRESS_TC"),
        "unique": ("type", "lat", "lng", "name", "address"),
    },
    {
        "type": "supermarket",
        "path": ROOT / "raw data" / "FEHD_FL_converted.csv",
        "predicate": lambda row: row.get("NAME_EN") == "Fresh Provision Shop Licence",
        "lat": ("LATITUDE", "GeometryLatitude"),
        "lng": ("LONGITUDE", "GeometryLongitude"),
        "name": ("NSEARCH03_EN", "NSEARCH03_TC", "NAME_EN", "NAME_TC"),
        "address": ("ADDRESS_EN", "ADDRESS_TC"),
        "unique": ("type", "lat", "lng", "name", "address"),
    },
    {
        "type": "lcsd",
        "path": ROOT / "raw data" / "PARKS_20260412.gdb_converted.csv",
        "predicate": None,
        "lat": ("LATITUDE",),
        "lng": ("LONGITUDE",),
        "name": ("NameEN", "NameTC"),
        "address": ("AddressEN", "AddressTC"),
        "unique": ("type", "name"),
    },
    {
        "type": "lcsd",
        "path": ROOT / "raw data" / "download_20250624_1647_converted.csv",
        "predicate": None,
        "lat": ("Latitude",),
        "lng": ("Longitude",),
        "name": ("Venue_EN", "Venue_TC"),
        "address": ("District_EN", "District_TC"),
        "unique": ("type", "name"),
    },
    {
        "type": "clinic",
        "path": ROOT / "data" / "spc_lat_lon.csv",
        "predicate": lambda row: bool(row.get("lat") and row.get("lon")),
        "lat": ("lat",),
        "lng": ("lon",),
        "name": ("facility_name_en", "facility_name_tc"),
        "address": ("address_en", "address_tc"),
        "unique": ("type", "name", "address"),
    },
]


def first_value(row, fields):
    for field in fields:
        value = (row.get(field) or "").strip()
        if value:
            return value
    return ""


def read_points(source):
    kind = source["type"]
    path = source["path"]
    predicate = source["predicate"]
    with path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        for row in reader:
            if predicate and not predicate(row):
                continue

            try:
                lat = float(first_value(row, source["lat"]))
                lng = float(first_value(row, source["lng"]))
            except (TypeError, ValueError):
                continue

            if not (22.0 <= lat <= 22.7 and 113.75 <= lng <= 114.45):
                continue

            name = first_value(row, source["name"]) or kind
            address = first_value(row, source["address"])

            yield {
                "type": kind,
                "name": name,
                "lat": round(lat, 7),
                "lng": round(lng, 7),
                "address": address,
            }


def unique_key(item, fields):
    parts = []
    for field in fields:
        value = item[field]
        if isinstance(value, str):
            value = re.sub(r"\s+", " ", value).strip().casefold()
        if field == "address":
            value = value[:80]
        parts.append(value)
    return tuple(parts)


def read_mtr_points(path):
    rows = read_xlsx_rows(path)
    if not rows:
        return

    headers = rows[0]
    seen_codes = set()
    for row_values in rows[1:]:
        row = {headers[index]: value for index, value in enumerate(row_values) if index < len(headers)}
        if row.get("Line") == "Light Rail":
            continue
        code = row.get("MTR code")
        if not code or code in seen_codes:
            continue
        seen_codes.add(code)

        try:
            lat = float(row.get("Latitude", ""))
            lng = float(row.get("Longitude", ""))
        except ValueError:
            continue

        if not (22.0 <= lat <= 22.7 and 113.75 <= lng <= 114.45):
            continue

        yield {
            "type": "mtr",
            "name": row.get("Name") or code,
            "lat": round(lat, 7),
            "lng": round(lng, 7),
            "address": row.get("Line") or "",
        }


def read_xlsx_rows(path):
    with zipfile.ZipFile(path) as archive:
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("a:si", XLSX_NS):
                shared_strings.append("".join(text.text or "" for text in item.findall(".//a:t", XLSX_NS)))

        root = ElementTree.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        rows = []
        for row in root.findall(".//a:sheetData/a:row", XLSX_NS):
            values = []
            for cell in row.findall("a:c", XLSX_NS):
                value_node = cell.find("a:v", XLSX_NS)
                value = "" if value_node is None else value_node.text or ""
                if cell.get("t") == "s" and value:
                    value = shared_strings[int(value)]
                values.append(value)
            rows.append(values)
        return rows


def main():
    amenities = []
    seen = set()
    for source in SOURCES:
        for item in read_points(source):
            key = unique_key(item, source["unique"])
            if key in seen:
                continue
            seen.add(key)
            amenities.append(item)

    for item in read_mtr_points(ROOT / "raw data" / "MTR+LR.xlsx"):
        key = unique_key(item, ("type", "name"))
        if key in seen:
            continue
        seen.add(key)
        amenities.append(item)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(amenities, ensure_ascii=False, separators=(",", ":")))
    counts = Counter(item["type"] for item in amenities)
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: {len(amenities):,} points {dict(counts)}")


if __name__ == "__main__":
    main()
