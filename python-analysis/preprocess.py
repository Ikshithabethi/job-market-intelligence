"""
preprocess.py
=============
Cleans the sample job-market CSVs in ../data and prepares feature tables for
analysis.

What it does
------------
  1. Loads every CSV produced by generate_seed.py.
  2. Normalises text, coerces numeric and date columns, drops unusable rows.
  3. Fills missing salary values from the median of the same role.
  4. Derives features: salary midpoint, experience midpoint, posting quarter,
     seniority band and a full role x skill importance matrix.
  5. Writes cleaned tables plus a summary JSON to ./output.

All input data is SYNTHETIC SAMPLE DATA created for academic work. Nothing in
this script contacts a live job board.

Usage
-----
    python3 preprocess.py
    python3 preprocess.py --data-dir ../data --out-dir output
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_DIR = os.path.normpath(os.path.join(HERE, "..", "data"))
DEFAULT_OUT_DIR = os.path.join(HERE, "output")

DATASET_FILES = {
    "jobs": "sample_jobs.csv",
    "skills": "sample_skills.csv",
    "roles": "job_roles.csv",
    "companies": "companies.csv",
    "job_skills": "job_skills.csv",
    "role_skills": "role_skills.csv",
    "transitions": "career_transitions.csv",
    "demand": "skill_demand.csv",
}


def load_datasets(data_dir: str) -> dict:
    """Read every CSV into a DataFrame, failing with a helpful message."""
    frames = {}
    missing = []
    for key, filename in DATASET_FILES.items():
        path = os.path.join(data_dir, filename)
        if not os.path.exists(path):
            missing.append(path)
            continue
        frames[key] = pd.read_csv(path)
    if missing:
        raise FileNotFoundError(
            "Missing dataset file(s):\n  "
            + "\n  ".join(missing)
            + "\nGenerate them first:  python3 generate_seed.py --jobs 8000"
        )
    return frames


def strip_strings(frame: pd.DataFrame, columns: list) -> pd.DataFrame:
    """Trim whitespace and normalise empty strings to NA."""
    for column in columns:
        if column in frame.columns:
            frame[column] = frame[column].astype(str).str.strip()
            frame[column] = frame[column].replace({"": np.nan, "nan": np.nan})
    return frame


def clean_jobs(jobs: pd.DataFrame, roles: pd.DataFrame, companies: pd.DataFrame) -> tuple:
    """
    Clean the postings table and attach role / company attributes.

    Returns (clean_jobs, report) where report records how many rows were fixed
    or dropped, so the cleaning step is auditable.
    """
    report = {"input_rows": int(len(jobs))}
    frame = jobs.copy()

    frame = strip_strings(
        frame,
        ["title", "location", "employment_type", "description", "company_name", "role_title"],
    )

    # --- dates -------------------------------------------------------------
    frame["posted_date"] = pd.to_datetime(frame["posted_date"], errors="coerce")
    invalid_dates = int(frame["posted_date"].isna().sum())
    frame = frame.dropna(subset=["posted_date"])

    # --- numerics ----------------------------------------------------------
    numeric_columns = ["experience_min", "experience_max", "salary_min", "salary_max"]
    for column in numeric_columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    invalid_experience = int(frame["experience_min"].isna().sum())
    frame = frame.dropna(subset=["experience_min", "experience_max"])

    # Salary is genuinely absent for some postings; fall back to the median for
    # the same role rather than dropping the posting entirely.
    missing_salary = int(frame["salary_min"].isna().sum())
    role_median_min = frame.groupby("role_title")["salary_min"].transform("median")
    role_median_max = frame.groupby("role_title")["salary_max"].transform("median")
    frame["salary_min"] = frame["salary_min"].fillna(role_median_min).fillna(frame["salary_min"].median())
    frame["salary_max"] = frame["salary_max"].fillna(role_median_max).fillna(frame["salary_max"].median())
    frame["salary_imputed"] = frame["salary_min"].isna() | frame["salary_max"].isna()

    # --- consistency fixes -------------------------------------------------
    swapped = int((frame["salary_min"] > frame["salary_max"]).sum())
    low = frame[["salary_min", "salary_max"]].min(axis=1)
    high = frame[["salary_min", "salary_max"]].max(axis=1)
    frame["salary_min"], frame["salary_max"] = low, high

    swapped_exp = int((frame["experience_min"] > frame["experience_max"]).sum())
    exp_low = frame[["experience_min", "experience_max"]].min(axis=1)
    exp_high = frame[["experience_min", "experience_max"]].max(axis=1)
    frame["experience_min"], frame["experience_max"] = exp_low, exp_high

    frame = frame[frame["salary_min"] > 0]
    frame = frame[frame["experience_max"] <= 40]

    duplicates = int(frame.duplicated(subset=["job_id"]).sum())
    frame = frame.drop_duplicates(subset=["job_id"])

    # --- derived features --------------------------------------------------
    frame["salary_midpoint"] = ((frame["salary_min"] + frame["salary_max"]) / 2).round(0).astype(int)
    frame["experience_midpoint"] = (frame["experience_min"] + frame["experience_max"]) / 2
    frame["posted_year"] = frame["posted_date"].dt.year
    frame["posted_quarter_num"] = frame["posted_date"].dt.quarter
    frame["posted_quarter"] = (
        frame["posted_year"].astype(str) + "-Q" + frame["posted_quarter_num"].astype(str)
    )
    frame["salary_band"] = pd.cut(
        frame["salary_midpoint"],
        bins=[0, 600000, 1000000, 1600000, 2500000, np.inf],
        labels=["<6L", "6-10L", "10-16L", "16-25L", "25L+"],
    )
    frame["experience_band"] = pd.cut(
        frame["experience_midpoint"],
        bins=[-0.1, 1.5, 3.5, 5.5, 8.5, np.inf],
        labels=["0-1 years", "2-3 years", "4-5 years", "6-8 years", "9+ years"],
    )

    # --- joins -------------------------------------------------------------
    role_columns = roles[["title", "family", "seniority", "demand_score"]].rename(
        columns={
            "title": "role_title",
            "family": "role_family",
            "seniority": "role_seniority",
            "demand_score": "role_demand_score",
        }
    )
    company_columns = companies[["name", "industry", "headquarters", "company_size"]].rename(
        columns={
            "name": "company_name",
            "industry": "company_industry",
            "headquarters": "company_headquarters",
            "company_size": "company_size",
        }
    )

    before_join = len(frame)
    frame = frame.merge(role_columns, on="role_title", how="left")
    frame = frame.merge(company_columns, on="company_name", how="left")
    unmatched_roles = int(frame["role_family"].isna().sum())
    frame = frame.dropna(subset=["role_family"])
    unmatched_companies = before_join - len(frame) - unmatched_roles
    report["unmatched_company_rows"] = max(0, int(unmatched_companies))

    report.update(
        {
            "invalid_dates_dropped": invalid_dates,
            "invalid_experience_dropped": invalid_experience,
            "salary_values_imputed": missing_salary,
            "salary_min_max_swapped": swapped,
            "experience_min_max_swapped": swapped_exp,
            "duplicate_job_ids_dropped": duplicates,
            "unmatched_role_rows_dropped": unmatched_roles,
            "output_rows": int(len(frame)),
        }
    )
    return frame, report


def build_role_skill_matrix(role_skills: pd.DataFrame) -> pd.DataFrame:
    """Role x skill matrix of importance values (0 when a role does not need it)."""
    matrix = role_skills.pivot_table(
        index="role_title", columns="skill_name", values="importance", aggfunc="max"
    )
    return matrix.fillna(0).astype(int)


def build_role_profiles(jobs_clean: pd.DataFrame, role_skill_matrix: pd.DataFrame) -> pd.DataFrame:
    """Per-role aggregates used by the analysis and the comparison page."""
    grouped = jobs_clean.groupby("role_title")
    profiles = pd.DataFrame(
        {
            "posting_count": grouped.size(),
            "avg_salary_midpoint": grouped["salary_midpoint"].mean().round(0),
            "median_salary_midpoint": grouped["salary_midpoint"].median().round(0),
            "min_salary": grouped["salary_min"].min(),
            "max_salary": grouped["salary_max"].max(),
            "avg_experience": grouped["experience_midpoint"].mean().round(2),
            "role_family": grouped["role_family"].first(),
            "role_seniority": grouped["role_seniority"].first(),
            "demand_score": grouped["role_demand_score"].first(),
            "required_skill_count": role_skill_matrix.reindex(grouped.groups.keys()).gt(0).sum(axis=1),
            "total_importance": role_skill_matrix.reindex(grouped.groups.keys()).sum(axis=1),
        }
    ).sort_values("posting_count", ascending=False)
    profiles.index.name = "role_title"
    return profiles.reset_index()


def clean_skill_demand(demand: pd.DataFrame, skills: pd.DataFrame) -> pd.DataFrame:
    """Validate the quarterly demand table and attach skill categories."""
    frame = strip_strings(demand.copy(), ["skill_name", "period"])
    frame["job_count"] = pd.to_numeric(frame["job_count"], errors="coerce").fillna(0).astype(int)
    frame["growth_rate"] = pd.to_numeric(frame["growth_rate"], errors="coerce").fillna(0.0)
    frame["z_score"] = pd.to_numeric(frame["z_score"], errors="coerce").fillna(0.0)
    frame = frame.merge(skills[["name", "category"]].rename(columns={"name": "skill_name"}), on="skill_name", how="left")
    return frame.sort_values(["skill_name", "period"]).reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean and prepare the job market sample dataset.")
    parser.add_argument("--data-dir", default=DEFAULT_DATA_DIR, help="folder containing the raw CSVs")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help="folder for the cleaned outputs")
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    frames = load_datasets(args.data_dir)

    print("Loaded raw data:")
    for key, frame in frames.items():
        print(f"  {key:12s} {frame.shape[0]:>7,d} rows  x {frame.shape[1]:>2d} cols")

    roles = strip_strings(frames["roles"].copy(), ["title", "family", "seniority"])
    companies = strip_strings(frames["companies"].copy(), ["name", "industry", "headquarters"])
    skills = strip_strings(frames["skills"].copy(), ["name", "category"])

    jobs_clean, job_report = clean_jobs(frames["jobs"], roles, companies)

    # Skills per posting, validated against the skill catalogue.
    job_skills = strip_strings(frames["job_skills"].copy(), ["skill_name"])
    job_skills["importance"] = pd.to_numeric(job_skills["importance"], errors="coerce").fillna(3).astype(int)
    known_skills = set(skills["name"])
    unknown_job_skills = int((~job_skills["skill_name"].isin(known_skills)).sum())
    job_skills_clean = job_skills[job_skills["skill_name"].isin(known_skills)]
    job_skills_clean = job_skills_clean.merge(
        jobs_clean[["job_id", "posted_quarter", "role_title", "salary_midpoint"]], on="job_id", how="inner"
    )
    job_skills_clean = job_skills_clean.drop_duplicates(subset=["job_id", "skill_name"])

    role_skills = strip_strings(frames["role_skills"].copy(), ["role_title", "skill_name"])
    role_skills["importance"] = pd.to_numeric(role_skills["importance"], errors="coerce").fillna(3).astype(int)
    unknown_role_skills = int((~role_skills["skill_name"].isin(known_skills)).sum())
    role_skills = role_skills[role_skills["skill_name"].isin(known_skills)]
    role_skills = role_skills[role_skills["role_title"].isin(set(roles["title"]))]
    role_skills = role_skills.drop_duplicates(subset=["role_title", "skill_name"])

    transitions = strip_strings(frames["transitions"].copy(), ["from_role", "to_role", "transition_type"])
    transitions = transitions[
        transitions["from_role"].isin(set(roles["title"])) & transitions["to_role"].isin(set(roles["title"]))
    ].drop_duplicates(subset=["from_role", "to_role"])

    demand_clean = clean_skill_demand(frames["demand"], skills)

    role_skill_matrix = build_role_skill_matrix(role_skills)
    role_profiles = build_role_profiles(jobs_clean, role_skill_matrix)

    # ---------------------------------------------------------------- outputs
    outputs = {
        "clean_jobs.csv": jobs_clean,
        "clean_job_skills.csv": job_skills_clean,
        "clean_role_skills.csv": role_skills,
        "clean_skill_demand.csv": demand_clean,
        "clean_career_transitions.csv": transitions,
        "role_skill_matrix.csv": role_skill_matrix.reset_index(),
        "role_profiles.csv": role_profiles,
    }
    for filename, frame in outputs.items():
        frame.to_csv(os.path.join(args.out_dir, filename), index=False)
        print(f"  wrote {filename:32s} {frame.shape[0]:>7,d} rows x {frame.shape[1]:>2d} cols")

    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "data_dir": args.data_dir,
        "out_dir": args.out_dir,
        "data_disclaimer": "Synthetic sample data generated for academic use; not live market statistics.",
        "raw_row_counts": {key: int(len(frame)) for key, frame in frames.items()},
        "cleaning_report": job_report,
        "validation": {
            "unknown_skills_in_job_skills": unknown_job_skills,
            "unknown_skills_in_role_skills": unknown_role_skills,
            "job_skill_rows_kept": int(len(job_skills_clean)),
            "role_skill_rows_kept": int(len(role_skills)),
            "career_transition_rows_kept": int(len(transitions)),
            "quarters_observed": sorted(demand_clean["period"].unique().tolist()),
        },
        "derived_features": [
            "salary_midpoint",
            "experience_midpoint",
            "posted_quarter",
            "salary_band",
            "experience_band",
            "role_skill_matrix",
        ],
    }
    summary_path = os.path.join(args.out_dir, "preprocess_summary.json")
    with open(summary_path, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)

    print("\nCleaning report:")
    for key, value in job_report.items():
        print(f"  {key:34s} {value}")
    print(f"\nWrote {summary_path}")

    # A quick sanity check so a broken dataset does not silently pass.
    if len(jobs_clean) == 0 or len(role_skill_matrix) == 0:
        raise SystemExit("Preprocessing produced empty tables - check the input dataset.")
    print("\nPreprocessing complete.")


if __name__ == "__main__":
    main()
