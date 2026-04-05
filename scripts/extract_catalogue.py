"""
WHO Genomics Costing Tool v2 — Catalogue Data Extractor
Reads the Excel file and writes clean JSON to src/data/catalogue.json
"""

import json
import re
import warnings
import openpyxl
from pathlib import Path

warnings.filterwarnings("ignore")

XLSX = Path("/home/nabil/.claude/channels/telegram/inbox/1775414348008-AgADdhsAAsRVmFI.xlsx")
OUT  = Path("/home/nabil/projects/genomicscost/src/data/catalogue.json")

wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)


# ── helpers ──────────────────────────────────────────────────────────────────

def clean(v):
    """Coerce a cell value to a clean Python scalar."""
    if v is None:
        return None
    if isinstance(v, str):
        v = v.replace("\xa0", " ").replace("\n", " ").strip()
        return v if v else None
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        # round floats that are really ints
        if isinstance(v, float) and v == int(v):
            return int(v)
        return round(v, 6) if isinstance(v, float) else v
    return v


def rows_of(sheet_name):
    ws = wb[sheet_name]
    return [tuple(clean(c) for c in row) for row in ws.iter_rows(values_only=True)]


def infer_platform_from_kit_name(name: str) -> str:
    """Guess platform family from a sequencing reagent kit name."""
    n = name.lower()
    if any(x in n for x in ["iseq", "miniseq", "miseq", "nextseq", "novaseq"]):
        return "Illumina"
    if any(x in n for x in ["flongle", "minion", "gridion", "promethion", "ont",
                              "flow cell (rna)", "promethion flow cell"]):
        return "ONT"
    if any(x in n for x in ["ion 5", "ion 520", "ion 530", "ion 540", "ion xpress"]):
        return "ThermoFisher"
    if "dnbseq" in n:
        return "MGI"
    return "Other"


# ── 1. platforms — from Annex3 sequencing reagent kits ───────────────────────

def extract_platforms():
    """
    Annex3_Reagents and Consumables rows 3–83:
    col1 = kit name, col2 = unit price, col3 = packs/run,
    col6 = read length bp, col7 = max single reads/flowcell, col8 = max output bytes
    """
    raw = rows_of("Annex3_Reagents and Consumables")

    # Collect sequencing reagent kits (rows 3–88 have price / read-length data)
    platforms: dict[str, dict] = {}

    for i, row in enumerate(raw[2:88], start=3):
        name = row[1] if len(row) > 1 else None
        price = row[2] if len(row) > 2 else None
        read_len = row[6] if len(row) > 6 else None
        max_reads = row[7] if len(row) > 7 else None
        max_output_bytes = row[8] if len(row) > 8 else None

        if not isinstance(name, str):
            continue
        if not isinstance(price, (int, float)) and not isinstance(read_len, (int, float)):
            continue

        platform_family = infer_platform_from_kit_name(name)

        if platform_family not in platforms:
            platforms[platform_family] = {
                "id": platform_family.lower().replace(" ", "_"),
                "name": platform_family,
                "reagent_kits": []
            }

        kit_entry = {
            "name": name,
            "unit_price_usd": price,
            "read_length_bp": int(read_len) if isinstance(read_len, (int, float)) else None,
            "max_reads_per_flowcell": int(max_reads) if isinstance(max_reads, (int, float)) else None,
            "max_output_bytes": int(max_output_bytes) if isinstance(max_output_bytes, (int, float)) else None,
            "max_output_mb": round(int(max_output_bytes) / 1_000_000, 1)
                             if isinstance(max_output_bytes, (int, float)) else None,
        }
        platforms[platform_family]["reagent_kits"].append(kit_entry)

    return list(platforms.values())


# ── 2. library_prep_kits — from Annex1_Library Prep ──────────────────────────

def extract_library_prep_kits():
    raw = rows_of("Annex1_Library Prep")
    # Header is row 52 (index 51):
    # col1=developer notes, col2=pathogen, col3=kit name, col4=kit+reagents,
    # col5=platform compatibility, col6=pack size, col7=packs seq1, col8=packs seq2,
    # col9=barcoding limit, col10=unit price, col11=enrichment, col12=catalog

    kits = []
    seen = set()

    for row in raw[51:]:  # from the header row onward
        name = row[3] if len(row) > 3 else None
        if not isinstance(name, str):
            continue
        # skip sub-component rows (they lack a pathogen type at col2 or kit name at col3)
        # actual kit rows have the same value in col3 == the kit header name
        pathogen = row[2] if len(row) > 2 else None
        platform = row[5] if len(row) > 5 else None
        pack_size = row[6] if len(row) > 6 else None
        barcoding_limit = row[9] if len(row) > 9 else None
        price = row[10] if len(row) > 10 else None
        enrichment = row[11] if len(row) > 11 else None
        catalog = row[12] if len(row) > 12 else None

        if not isinstance(pathogen, str) or not isinstance(platform, str):
            continue

        kit_key = name
        if kit_key in seen:
            continue
        seen.add(kit_key)

        # Normalise platform string to a list
        platform_list = [p.strip() for p in re.split(r"[,\n]", platform) if p.strip()]

        kits.append({
            "name": name,
            "pathogen_type": pathogen,
            "compatible_platforms": platform_list,
            "pack_size": int(pack_size) if isinstance(pack_size, (int, float)) else None,
            "barcoding_limit": int(barcoding_limit) if isinstance(barcoding_limit, (int, float)) else None,
            "unit_price_usd": price if isinstance(price, (int, float)) else None,
            "enrichment_included": enrichment if isinstance(enrichment, str) else None,
            "catalog_ref": str(catalog) if catalog is not None else None,
        })

    return kits


# ── 3. reagents — from Annex3, consumables/reagent section (rows 92+) ─────────

def extract_reagents():
    raw = rows_of("Annex3_Reagents and Consumables")

    reagents = []

    # Rows 92–145 (index 91–144): col1=category, col2=item, col3=pack size, col4=catalog, col5=qty/sample
    for row in raw[91:145]:
        category = row[1] if len(row) > 1 else None
        name = row[2] if len(row) > 2 else None
        pack_size = row[3] if len(row) > 3 else None
        catalog = row[4] if len(row) > 4 else None
        qty_per_sample = row[5] if len(row) > 5 else None

        if not isinstance(name, str) or not isinstance(category, str):
            continue
        if name.startswith("*") or "choose a bundle" in name.lower():
            continue
        if name.lower() in ("item", "item category", "item(pack size)"):
            continue

        # Normalise category
        cat = category.strip().lower().rstrip()
        if cat in ("reagent", "reagent "):
            cat = "reagent"
        elif cat in ("consumable", "consumable "):
            cat = "consumable"
        elif cat in ("equipment",):
            cat = "equipment"

        # Infer workflow step
        workflow = None
        nl = name.lower()
        if "extraction" in nl or "rna" in nl:
            workflow = "nucleic_acid_extraction"
        elif "pcr" in nl or "polymerase" in nl or "primer" in nl or "dntp" in nl:
            workflow = "pcr_testing"
        elif "library" in nl or "sequencing kit" in nl or "barcod" in nl or "tagment" in nl:
            workflow = "library_prep"
        elif any(x in nl for x in ["glove", "coat", "isoprop", "bleach", "autoclave", "paper", "tape"]):
            workflow = "general_lab"
        elif any(x in nl for x in ["transport", "swab", "cold pack", "specimen"]):
            workflow = "sample_receipt"

        reagents.append({
            "name": name,
            "category": cat,
            "pack_size": int(pack_size) if isinstance(pack_size, (int, float)) else pack_size,
            "catalog_ref": str(catalog) if catalog is not None else None,
            "quantity_per_sample": qty_per_sample if isinstance(qty_per_sample, (int, float)) else None,
            "workflow": workflow,
        })

    # Also rows 132–145 (incidentals block)
    for row in raw[131:145]:
        category = row[1] if len(row) > 1 else None
        name = row[2] if len(row) > 2 else None
        pack_size = row[3] if len(row) > 3 else None
        qty_per_run = row[4] if len(row) > 4 else None
        qty_per_sample = row[5] if len(row) > 5 else None

        if not isinstance(name, str) or not isinstance(category, str):
            continue
        if any(row[:2]) and isinstance(row[1], str) and row[1].startswith("LUMPED"):
            continue

        cat = category.strip().lower()

        # avoid duplicates
        if any(r["name"] == name for r in reagents):
            continue

        reagents.append({
            "name": name,
            "category": "consumable" if "consumable" in cat else cat,
            "pack_size": int(pack_size) if isinstance(pack_size, (int, float)) else pack_size,
            "catalog_ref": None,
            "quantity_per_sample": qty_per_sample if isinstance(qty_per_sample, (int, float)) else None,
            "workflow": "general_lab",
        })

    return reagents


# ── 4. equipment — from Annex2_Equipment ────────────────────────────────────

def extract_equipment():
    raw = rows_of("Annex2_Equipment")

    equipment = []

    # Rows 4–23 (index 3–22): sequencing equipment
    # col1=workflow step, col2=item, col3=unit cost, col4=catalog, col5=comment
    for row in raw[3:23]:
        workflow = row[1] if len(row) > 1 else None
        name = row[2] if len(row) > 2 else None
        cost = row[3] if len(row) > 3 else None
        catalog = row[4] if len(row) > 4 else None
        comment = row[5] if len(row) > 5 else None

        if not isinstance(name, str):
            continue
        if name in ("Select Item", "Item"):
            continue

        equipment.append({
            "name": name,
            "category": "sequencing_platform",
            "workflow_step": clean(workflow),
            "unit_cost_usd": cost if isinstance(cost, (int, float)) else None,
            "catalog_ref": str(catalog) if catalog is not None else None,
            "recommended_quantity": None,
            "comment": clean(comment),
        })

    # Rows 26–66 (index 25–65): lab equipment
    # col1=workflow (None), col2=item, col3=unit cost, col4=recommended qty, col5=comment
    for row in raw[25:66]:
        name = row[2] if len(row) > 2 else None
        cost = row[3] if len(row) > 3 else None
        qty  = row[4] if len(row) > 4 else None
        comment = row[5] if len(row) > 5 else None

        if not isinstance(name, str):
            continue
        if name in ("Item", "EQUIPMENT"):
            continue

        # Infer category
        nl = name.lower()
        if any(x in nl for x in ["server", "gpu", "computer", "hdd"]):
            cat = "bioinformatics"
        elif any(x in nl for x in ["sequenc", "sequencer"]):
            cat = "sequencing_platform"
        elif any(x in nl for x in ["centrifuge", "vortex", "bath", "pipette", "rack", "block", "magnet",
                                     "autoclave", "balance", "freezer", "refrigerator", "gel", "fluorometer",
                                     "thermal cycler", "bioanalyzer", "tapestation", "biosafety", "handler",
                                     "liquid handler", "ups", "uninterrupted"]):
            cat = "lab_equipment"
        elif any(x in nl for x in ["air condition", "temperature logger"]):
            cat = "facility"
        else:
            cat = "lab_equipment"

        equipment.append({
            "name": name,
            "category": cat,
            "workflow_step": None,
            "unit_cost_usd": cost if isinstance(cost, (int, float)) else None,
            "catalog_ref": None,
            "recommended_quantity": int(qty) if isinstance(qty, (int, float)) else None,
            "comment": clean(comment),
        })

    return equipment


# ── 5. personnel_roles — from Personnel and training ─────────────────────────

def extract_personnel_roles():
    raw = rows_of("Personnel and training")

    roles = []
    seen = set()

    for row in raw[4:37]:
        name = row[1] if len(row) > 1 else None
        if not isinstance(name, str):
            continue
        if name in seen:
            continue
        seen.add(name)
        roles.append({"role": name})

    return roles


# ── 6. bioinformatics_cloud — from Bioinformatics sheet ──────────────────────

def extract_bioinformatics_cloud():
    raw = rows_of("Bioinformatics")

    cloud = []
    inhouse = []

    # Cloud section: rows 7–17 (index 6–16)
    for row in raw[6:22]:
        name = row[0] if len(row) > 0 else None
        description = row[1] if len(row) > 1 else None
        if not isinstance(name, str):
            continue

        cloud.append({
            "name": name,
            "description": description,
            "pricing_model": "per_unit" if isinstance(row[2] if len(row) > 2 else None, (int, float)) else "variable",
        })

    # In-house section: rows 28–41 (index 27–40)
    for row in raw[27:45]:
        name = row[1] if len(row) > 1 else None
        description = row[0] if len(row) > 0 else None
        if not isinstance(name, str):
            continue

        inhouse.append({
            "name": name,
            "description": description,
        })

    return {
        "cloud_platforms": cloud,
        "inhouse_components": inhouse,
    }


# ── 7. qms_activities — from Quality management ───────────────────────────────

def extract_qms_activities():
    raw = rows_of("Quality management")

    activities = []

    # Rows 5–11 (index 4–10): col1=activity, col2=cost, col3=qty, col7=comment
    for row in raw[4:12]:
        name = row[1] if len(row) > 1 else None
        cost = row[2] if len(row) > 2 else None
        qty  = row[3] if len(row) > 3 else None
        comment = row[7] if len(row) > 7 else None

        if not isinstance(name, str):
            continue

        activities.append({
            "activity": name,
            "default_cost_usd": cost if isinstance(cost, (int, float)) else None,
            "default_quantity": int(qty) if isinstance(qty, (int, float)) else None,
            "comment": comment,
        })

    return activities


# ── 8. pathogens — from Annex4_Coverage Sample Calc ──────────────────────────

def extract_pathogens():
    raw = rows_of("Annex4_Coverage Sample Calc")

    pathogens = []

    # Rows 27–45 (index 26–44): col2=pathogen, col3=type, col4=genome type,
    # col5=genome size Mb, col6=required coverage
    for row in raw[26:45]:
        name = row[2] if len(row) > 2 else None
        ptype = row[3] if len(row) > 3 else None
        genome = row[4] if len(row) > 4 else None
        size_mb = row[5] if len(row) > 5 else None
        coverage = row[6] if len(row) > 6 else None

        if not isinstance(name, str):
            continue
        if name in ("Pathogen", "Not applicable"):
            continue

        pathogens.append({
            "name": name,
            "type": ptype,  # Virus / Bacteria
            "genome_type": genome,  # RNA / DNA
            "genome_size_mb": size_mb if isinstance(size_mb, (int, float)) else None,
            "required_coverage_x": int(coverage) if isinstance(coverage, (int, float)) else None,
        })

    return pathogens


# ── Assemble and write ────────────────────────────────────────────────────────

def main():
    print("Extracting platforms…")
    platforms = extract_platforms()

    print("Extracting library prep kits…")
    library_prep_kits = extract_library_prep_kits()

    print("Extracting reagents and consumables…")
    reagents = extract_reagents()

    print("Extracting equipment…")
    equipment = extract_equipment()

    print("Extracting personnel roles…")
    personnel_roles = extract_personnel_roles()

    print("Extracting bioinformatics options…")
    bioinformatics_cloud = extract_bioinformatics_cloud()

    print("Extracting QMS activities…")
    qms_activities = extract_qms_activities()

    print("Extracting pathogens…")
    pathogens = extract_pathogens()

    catalogue = {
        "_meta": {
            "source": "WHO Genomics Costing Tool, second edition",
            "extracted": "2026-04-05",
            "notes": "Costs in USD. Some prices not publicly listed (None) — user must enter."
        },
        "platforms": platforms,
        "library_prep_kits": library_prep_kits,
        "reagents": reagents,
        "equipment": equipment,
        "personnel_roles": personnel_roles,
        "bioinformatics_cloud": bioinformatics_cloud,
        "qms_activities": qms_activities,
        "pathogens": pathogens,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(catalogue, indent=2, ensure_ascii=False))
    print(f"\nWrote {OUT}")

    # Stats
    print(f"\n  platforms:         {len(platforms)} (with {sum(len(p['reagent_kits']) for p in platforms)} kits total)")
    print(f"  library_prep_kits: {len(library_prep_kits)}")
    print(f"  reagents:          {len(reagents)}")
    print(f"  equipment:         {len(equipment)}")
    print(f"  personnel_roles:   {len(personnel_roles)}")
    print(f"  cloud platforms:   {len(bioinformatics_cloud['cloud_platforms'])}")
    print(f"  inhouse components:{len(bioinformatics_cloud['inhouse_components'])}")
    print(f"  qms_activities:    {len(qms_activities)}")
    print(f"  pathogens:         {len(pathogens)}")


if __name__ == "__main__":
    main()
