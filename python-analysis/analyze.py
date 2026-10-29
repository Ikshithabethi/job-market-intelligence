"""
analyze.py
==========
Analyses the cleaned job market sample dataset with pandas and scikit-learn.

Analyses performed
------------------
  1. Skill demand       - most requested skills and the share of postings.
  2. Trend validation   - recomputes the baseline vs recent share change and a
                          two-proportion z-test, then cross-checks the stored
                          growth_rate values from the dataset.
  3. Role clustering    - KMeans over the role x skill importance matrix,
                          standardised, to group roles with similar skill needs.
  4. Role similarity    - cosine similarity between role skill vectors, which is
                          the same relationship the knowledge graph labels
                          SIMILAR_TO.
  5. Salary model       - LinearRegression predicting a posting's salary
                          midpoint from experience, role family and seniority,
                          reported with R2 / MAE so the fit is not oversold.

Inputs : ./output/*.csv produced by preprocess.py
Outputs: ./output/analysis_*.csv and ./output/analysis_report.json

All figures describe SYNTHETIC SAMPLE DATA and must not be presented as live
job market statistics.

Usage
-----
    python3 preprocess.py
    python3 analyze.py
    python3 analyze.py --clusters 6
"""

from __future__ import annotations

import argparse
import json
import os
import warnings
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# NumPy on macOS links against Apple's Accelerate BLAS, which emits spurious
# "divide by zero / overflow / invalid value encountered in matmul" warnings for
# perfectly finite inputs (verified against a plain product of two random
# matrices). These are unrelated to this dataset and would flood the report.
warnings.filterwarnings("ignore", message=r".*encountered in matmul", category=RuntimeWarning)

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT_DIR = os.path.join(HERE, "output")

# Windows mirrored from generate_seed.py so the recomputation is comparable.
BASELINE_QUARTERS = ["2025-Q1", "2025-Q2", "2025-Q3"]
RECENT_QUARTERS = ["2026-Q1", "2026-Q2", "2026-Q3"]
SIGNIFICANCE_Z = 2.58
MIN_SAMPLE = 30


def load_outputs(out_dir: str) -> dict:
    """Read the tables written by preprocess.py."""
    required = {
        "jobs": "clean_jobs.csv",
        "job_skills": "clean_job_skills.csv",
        "role_skills": "clean_role_skills.csv",
        "demand": "clean_skill_demand.csv",
        "role_matrix": "role_skill_matrix.csv",
        "role_profiles": "role_profiles.csv",
        "transitions": "clean_career_transitions.csv",
    }
    frames = {}
    missing = []
    for key, filename in required.items():
        path = os.path.join(out_dir, filename)
        if not os.path.exists(path):
            missing.append(path)
        else:
            frames[key] = pd.read_csv(path)
    if missing:
        raise FileNotFoundError(
            "Missing preprocessed file(s):\n  "
            + "\n  ".join(missing)
            + "\nRun preprocess.py first."
        )
    return frames


# ---------------------------------------------------------------------------
# 1 + 2. Skill demand and trend analysis
# ---------------------------------------------------------------------------
def analyse_skill_demand(jobs: pd.DataFrame, job_skills: pd.DataFrame) -> tuple:
    """Skill leaderboard plus share based trend detection."""
    total_postings = int(jobs["job_id"].nunique())

    leaderboard = (
        job_skills.groupby("skill_name")
        .agg(
            posting_count=("job_id", "nunique"),
            avg_importance=("importance", "mean"),
        )
        .reset_index()
    )
    leaderboard["share_percent"] = (100 * leaderboard["posting_count"] / total_postings).round(2)
    leaderboard["avg_importance"] = leaderboard["avg_importance"].round(2)

    # --- quarterly shares ---------------------------------------------------
    postings_per_quarter = jobs.groupby("posted_quarter")["job_id"].nunique().rename("quarter_postings")
    per_quarter = (
        job_skills.merge(postings_per_quarter, left_on="posted_quarter", right_index=True, how="left")
        .groupby(["skill_name", "posted_quarter"])
        .agg(skill_postings=("job_id", "nunique"), quarter_postings=("quarter_postings", "max"))
        .reset_index()
    )
    per_quarter["share"] = per_quarter["skill_postings"] / per_quarter["quarter_postings"]

    baseline = per_quarter[per_quarter["posted_quarter"].isin(BASELINE_QUARTERS)]
    recent = per_quarter[per_quarter["posted_quarter"].isin(RECENT_QUARTERS)]

    base_agg = baseline.groupby("skill_name").agg(
        base_postings=("skill_postings", "sum"), base_total=("quarter_postings", "sum")
    )
    recent_agg = recent.groupby("skill_name").agg(
        recent_postings=("skill_postings", "sum"), recent_total=("quarter_postings", "sum")
    )

    trends = base_agg.join(recent_agg, how="outer").fillna(0).reset_index()
    trends = trends[(trends["base_total"] > 0) & (trends["recent_total"] > 0)].copy()
    trends["total_postings"] = trends["base_postings"] + trends["recent_postings"]
    trends["base_share"] = trends["base_postings"] / trends["base_total"]
    trends["recent_share"] = trends["recent_postings"] / trends["recent_total"]

    # Two proportion z-test: pooled standard error of the share difference.
    trends["pooled"] = (trends["base_postings"] + trends["recent_postings"]) / (
        trends["base_total"] + trends["recent_total"]
    )
    trends["standard_error"] = np.sqrt(
        trends["pooled"] * (1 - trends["pooled"]) * (1 / trends["base_total"] + 1 / trends["recent_total"])
    )
    trends["computed_z"] = np.where(
        trends["standard_error"] > 0,
        (trends["recent_share"] - trends["base_share"]) / trends["standard_error"],
        0.0,
    )
    trends["significant"] = (trends["computed_z"].abs() >= SIGNIFICANCE_Z) & (trends["total_postings"] >= MIN_SAMPLE)
    trends["computed_growth_percent"] = np.where(
        trends["significant"] & (trends["base_share"] > 0),
        (100 * (trends["recent_share"] - trends["base_share"]) / trends["base_share"]),
        0.0,
    )

    trends["base_share_percent"] = (trends["base_share"] * 100).round(2)
    trends["recent_share_percent"] = (trends["recent_share"] * 100).round(2)
    trends["computed_z"] = trends["computed_z"].round(2)
    trends["computed_growth_percent"] = trends["computed_growth_percent"].round(2)

    trends = trends.sort_values("computed_growth_percent", ascending=False).reset_index(drop=True)

    emerging = trends[trends["computed_growth_percent"] > 0].head(10)
    declining = trends[trends["computed_growth_percent"] < 0].sort_values("computed_growth_percent").head(10)

    return leaderboard.sort_values("posting_count", ascending=False), trends, emerging, declining


def validate_against_dataset(trends: pd.DataFrame, demand: pd.DataFrame) -> dict:
    """
    Cross-check the recomputed trend with the growth_rate stored in the dataset.
    A small gap is expected (the dataset stores the value computed at generation
    time), so we report the agreement rate instead of asserting equality.
    """
    stored = (
        demand.groupby("skill_name")
        .agg(stored_growth_rate=("growth_rate", "first"), stored_z=("z_score", "first"))
        .reset_index()
    )
    comparison = trends.merge(stored, on="skill_name", how="left")
    comparison["stored_growth_rate"] = comparison["stored_growth_rate"].fillna(0.0)
    comparison["stored_z"] = comparison["stored_z"].fillna(0.0)
    comparison["direction_matches"] = np.sign(comparison["computed_growth_percent"]) == np.sign(
        comparison["stored_growth_rate"]
    )

    both_significant = comparison[
        (comparison["significant"]) & (comparison["stored_growth_rate"].abs() > 0)
    ]
    agreement = (
        float(both_significant["direction_matches"].mean() * 100) if len(both_significant) > 0 else 0.0
    )

    return {
        "skills_compared": int(len(comparison)),
        "skills_significant_in_both": int(len(both_significant)),
        "direction_agreement_percent": round(agreement, 1),
        "max_absolute_growth_gap": round(
            float((comparison["computed_growth_percent"] - comparison["stored_growth_rate"]).abs().max()), 2
        ),
        "comparison": comparison,
    }


# ---------------------------------------------------------------------------
# 3. Role clustering
# ---------------------------------------------------------------------------
def cluster_roles(role_matrix: pd.DataFrame, n_clusters: int = 5) -> pd.DataFrame:
    """KMeans over the standardised role x skill importance matrix."""
    skill_columns = [column for column in role_matrix.columns if column != "role_title"]
    features = role_matrix[skill_columns].to_numpy(dtype=float)

    scaler = StandardScaler()
    scaled = scaler.fit_transform(features)

    k = min(n_clusters, len(role_matrix))
    model = KMeans(n_clusters=k, n_init=10, random_state=42)
    labels = model.fit_predict(scaled)

    result = role_matrix[["role_title"]].copy()
    result["cluster"] = labels
    result["distance_to_centroid"] = np.linalg.norm(
        scaled - model.cluster_centers_[labels], axis=1
    ).round(3)

    # Describe each cluster by the skills it emphasises most.
    centroids = pd.DataFrame(model.cluster_centers_, columns=skill_columns)
    descriptions = {}
    for cluster_id in range(k):
        top_skills = centroids.loc[cluster_id].sort_values(ascending=False).head(6)
        descriptions[int(cluster_id)] = {
            "top_skills": top_skills.index.tolist(),
            "role_count": int((labels == cluster_id).sum()),
        }
    result.attrs["cluster_descriptions"] = descriptions
    result.attrs["inertia"] = round(float(model.inertia_), 2)
    return result


def evaluate_cluster_counts(role_matrix: pd.DataFrame, candidates: range) -> pd.DataFrame:
    """Inertia and silhouette score for a few k values, so k is chosen openly."""
    from sklearn.metrics import silhouette_score

    skill_columns = [column for column in role_matrix.columns if column != "role_title"]
    scaled = StandardScaler().fit_transform(role_matrix[skill_columns].to_numpy(dtype=float))

    rows = []
    for k in candidates:
        if k < 2 or k >= len(role_matrix):
            continue
        model = KMeans(n_clusters=k, n_init=10, random_state=42)
        labels = model.fit_predict(scaled)
        rows.append(
            {
                "clusters": k,
                "inertia": round(float(model.inertia_), 2),
                "silhouette": round(float(silhouette_score(scaled, labels)), 4),
            }
        )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 4. Role similarity (cosine on skill vectors)
# ---------------------------------------------------------------------------
def role_similarity(role_matrix: pd.DataFrame, top_n: int = 15) -> pd.DataFrame:
    skill_columns = [column for column in role_matrix.columns if column != "role_title"]
    vectors = role_matrix[skill_columns].to_numpy(dtype=float)
    similarity = cosine_similarity(vectors)

    titles = role_matrix["role_title"].tolist()
    rows = []
    for i in range(len(titles)):
        for j in range(i + 1, len(titles)):
            rows.append(
                {
                    "role_a": titles[i],
                    "role_b": titles[j],
                    "cosine_similarity": round(float(similarity[i, j]), 4),
                    "jaccard_similarity": round(
                        float(
                            np.sum((vectors[i] > 0) & (vectors[j] > 0))
                            / max(1, np.sum((vectors[i] > 0) | (vectors[j] > 0)))
                        ),
                        4,
                    ),
                }
            )
    frame = pd.DataFrame(rows).sort_values("cosine_similarity", ascending=False).reset_index(drop=True)
    return frame.head(top_n)


# ---------------------------------------------------------------------------
# 5. Salary model
# ---------------------------------------------------------------------------
def salary_model(jobs: pd.DataFrame) -> tuple:
    """
    Linear regression on salary midpoint.
    Categorical columns are one-hot encoded; a held out test split keeps the
    reported metrics honest.
    """
    frame = jobs[
        ["salary_midpoint", "experience_midpoint", "role_family", "role_seniority", "employment_type"]
    ].dropna()

    features = pd.get_dummies(
        frame[["experience_midpoint", "role_family", "role_seniority", "employment_type"]],
        columns=["role_family", "role_seniority", "employment_type"],
        drop_first=True,
        dtype=float,
    )
    target = frame["salary_midpoint"].astype(float)

    x_train, x_test, y_train, y_test = train_test_split(features, target, test_size=0.25, random_state=42)

    model = LinearRegression()
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)

    metrics = {
        "training_rows": int(len(x_train)),
        "test_rows": int(len(x_test)),
        "feature_count": int(features.shape[1]),
        "r2_test": round(float(r2_score(y_test, predictions)), 4),
        "mae_test": int(round(float(mean_absolute_error(y_test, predictions)))),
        "target_mean_salary": int(round(float(target.mean()))),
    }

    coefficients = (
        pd.DataFrame({"feature": features.columns, "coefficient": model.coef_.round(0).astype(int)})
        .assign(absolute=lambda d: d["coefficient"].abs())
        .sort_values("absolute", ascending=False)
        .drop(columns="absolute")
        .reset_index(drop=True)
    )

    def group_effect(prefix: str) -> float:
        """Sum |coefficient| for every dummy column that starts with `prefix`."""
        mask = np.array([column.startswith(prefix) for column in features.columns])
        return float(np.abs(model.coef_[mask]).sum()) if mask.any() else 0.0

    importance = pd.DataFrame(
        {
            "feature_group": ["experience", "role_family", "role_seniority", "employment_type"],
            "absolute_effect": [
                abs(float(model.coef_[features.columns.get_loc("experience_midpoint")]))
                if "experience_midpoint" in features.columns
                else 0.0,
                group_effect("role_family_"),
                group_effect("role_seniority_"),
                group_effect("employment_type_"),
            ],
        }
    )
    total = importance["absolute_effect"].sum()
    importance["share_percent"] = (
        (100 * importance["absolute_effect"] / total).round(1) if total > 0 else 0.0
    )

    return metrics, coefficients, importance


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Analyse the cleaned job market sample dataset.")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    parser.add_argument("--clusters", type=int, default=5, help="number of role clusters for KMeans")
    args = parser.parse_args()

    data = load_outputs(args.out_dir)
    jobs = data["jobs"]
    job_skills = data["job_skills"]
    role_matrix = data["role_matrix"]
    demand = data["demand"]

    print("=" * 78)
    print("Job Market Intelligence - analysis report (SYNTHETIC SAMPLE DATA)")
    print("=" * 78)
    print(f"postings: {jobs['job_id'].nunique():,}   roles: {len(role_matrix)}   "
          f"skills tracked: {job_skills['skill_name'].nunique()}   "
          f"quarters: {jobs['posted_quarter'].nunique()}")
    print(f"average salary midpoint: {jobs['salary_midpoint'].mean():,.0f}   "
          f"average experience: {jobs['experience_midpoint'].mean():.1f} years")

    # 1. demand -------------------------------------------------------------
    leaderboard, trends, emerging, declining = analyse_skill_demand(jobs, job_skills)
    print("\n[1] Top 10 skills by share of postings")
    print(
        leaderboard.head(10)
        .assign(posting_count=lambda d: d["posting_count"].map("{:,}".format))
        .to_string(index=False, columns=["skill_name", "posting_count", "share_percent", "avg_importance"])
    )

    # 2. trend --------------------------------------------------------------
    print("\n[2] Emerging skills (recomputed, statistically significant)")
    if len(emerging) > 0:
        print(
            emerging.head(8).to_string(
                index=False,
                columns=["skill_name", "base_share_percent", "recent_share_percent",
                         "computed_growth_percent", "computed_z"],
            )
        )
    else:
        print("  none met the significance threshold")

    print("\n[2] Declining skills (recomputed, statistically significant)")
    if len(declining) > 0:
        print(
            declining.head(8).to_string(
                index=False,
                columns=["skill_name", "base_share_percent", "recent_share_percent",
                         "computed_growth_percent", "computed_z"],
            )
        )
    else:
        print("  none met the significance threshold")

    validation = validate_against_dataset(trends, demand)
    print(
        f"\n[2] Cross-check against the growth_rate stored in the dataset: "
        f"{validation['skills_compared']} skills compared, "
        f"{validation['skills_significant_in_both']} significant in both, "
        f"direction agreement {validation['direction_agreement_percent']}%."
    )

    # 3. clustering ---------------------------------------------------------
    print(f"\n[3] Role clustering (KMeans, k={args.clusters}) over {role_matrix.shape[1] - 1} skill features")
    clusters = cluster_roles(role_matrix, args.clusters)
    descriptions = clusters.attrs["cluster_descriptions"]
    for cluster_id, info in sorted(descriptions.items()):
        members = clusters[clusters["cluster"] == cluster_id]["role_title"].tolist()
        print(f"  cluster {cluster_id} ({info['role_count']} roles) - leading skills: {', '.join(info['top_skills'][:4])}")
        print(f"      {', '.join(members[:6])}{' ...' if len(members) > 6 else ''}")

    k_scores = evaluate_cluster_counts(role_matrix, range(3, 9))
    best_k = int(k_scores.sort_values("silhouette", ascending=False).iloc[0]["clusters"])
    print(f"  silhouette scores by k: {dict(zip(k_scores['clusters'], k_scores['silhouette']))}")
    print(f"  best silhouette at k={best_k} (using k={args.clusters} for readability)")

    # 4. similarity ---------------------------------------------------------
    similar = role_similarity(role_matrix, top_n=15)
    print("\n[4] Most similar role pairs (cosine similarity on skill vectors)")
    print(similar.head(8).to_string(index=False))

    # 5. salary -------------------------------------------------------------
    metrics, coefficients, importance = salary_model(jobs)
    print("\n[5] Salary model (linear regression on salary midpoint)")
    print(
        f"  R2 (held out 25%): {metrics['r2_test']}   MAE: {metrics['mae_test']:,}   "
        f"mean salary: {metrics['target_mean_salary']:,}   features: {metrics['feature_count']}"
    )
    print("  driver share of explained magnitude:")
    print(importance.to_string(index=False, columns=["feature_group", "share_percent"]))
    print("  largest individual coefficients:")
    print(coefficients.head(6).to_string(index=False))

    # ------------------------------------------------------------- outputs
    leaderboard.to_csv(os.path.join(args.out_dir, "analysis_skill_demand.csv"), index=False)
    trends.to_csv(os.path.join(args.out_dir, "analysis_skill_trends.csv"), index=False)
    clusters.to_csv(os.path.join(args.out_dir, "analysis_role_clusters.csv"), index=False)
    k_scores.to_csv(os.path.join(args.out_dir, "analysis_cluster_scores.csv"), index=False)
    similar.to_csv(os.path.join(args.out_dir, "analysis_similar_roles.csv"), index=False)
    coefficients.to_csv(os.path.join(args.out_dir, "analysis_salary_coefficients.csv"), index=False)
    importance.to_csv(os.path.join(args.out_dir, "analysis_salary_drivers.csv"), index=False)

    report = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "data_disclaimer": (
            "Every figure below describes SYNTHETIC SAMPLE DATA generated for academic use. "
            "It is not live job market data and must not be used for real decisions."
        ),
        "dataset": {
            "postings": int(jobs["job_id"].nunique()),
            "roles": int(len(role_matrix)),
            "skills_tracked": int(job_skills["skill_name"].nunique()),
            "quarters": sorted(jobs["posted_quarter"].unique().tolist()),
            "mean_salary_midpoint": int(round(float(jobs["salary_midpoint"].mean()))),
            "mean_experience_years": round(float(jobs["experience_midpoint"].mean()), 2),
        },
        "skill_demand_top10": leaderboard.head(10).to_dict(orient="records"),
        "trend_windows": {"baseline": BASELINE_QUARTERS, "recent": RECENT_QUARTERS,
                          "significance_z": SIGNIFICANCE_Z, "min_sample": MIN_SAMPLE},
        "emerging_skills": emerging[
            ["skill_name", "base_share_percent", "recent_share_percent", "computed_growth_percent", "computed_z"]
        ].to_dict(orient="records"),
        "declining_skills": declining[
            ["skill_name", "base_share_percent", "recent_share_percent", "computed_growth_percent", "computed_z"]
        ].to_dict(orient="records"),
        "trend_validation": {
            "skills_compared": validation["skills_compared"],
            "skills_significant_in_both": validation["skills_significant_in_both"],
            "direction_agreement_percent": validation["direction_agreement_percent"],
            "max_absolute_growth_gap": validation["max_absolute_growth_gap"],
        },
        "role_clusters": {
            "k": args.clusters,
            "inertia": clusters.attrs.get("inertia"),
            "descriptions": {str(k): v for k, v in descriptions.items()},
            "assignments": clusters[["role_title", "cluster"]].to_dict(orient="records"),
            "silhouette_by_k": k_scores.to_dict(orient="records"),
            "best_k_by_silhouette": best_k,
        },
        "most_similar_role_pairs": similar.head(10).to_dict(orient="records"),
        "salary_model": {
            "metrics": metrics,
            "driver_share_percent": importance.to_dict(orient="records"),
            "top_coefficients": coefficients.head(10).to_dict(orient="records"),
        },
    }
    report_path = os.path.join(args.out_dir, "analysis_report.json")
    with open(report_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    print(f"\nWrote {report_path}")
    print("Analysis complete.")


if __name__ == "__main__":
    main()
