"""
generate_seed.py
=================
Generates the SAMPLE dataset used by the Job Market Intelligence application.

IMPORTANT DISCLAIMER
--------------------
Every record produced by this script is SYNTHETIC SAMPLE DATA. Company names are
fictional. Salaries are illustrative (annual, INR) and are NOT live market
statistics. The goal of the generator is to produce a self-consistent dataset
that has the same *shape* as a real job-posting dump so that the application
code (SQL analytics, knowledge graph, career-path traversal, ML analysis) can be
developed and evaluated.

Usage
-----
    python3 generate_seed.py                # default 560 job postings
    python3 generate_seed.py --jobs 800     # custom number of job postings

Outputs (written to ../data/):
    job_roles.csv           role master data (salary band, demand score)
    sample_skills.csv       skill master data (category + description)
    companies.csv           fictional hiring companies
    sample_jobs.csv         job postings linked to role + company
    role_skills.csv         SKILL_REQUIRED_FOR edges (role -> skill + importance)
    job_skills.csv          skills attached to each job posting
    career_transitions.csv  LEADS_TO edges (role -> role transition)
    skill_demand.csv        per-quarter historical demand per skill

Everything is deterministic (random.Random(SEED)) so re-running the script
produces byte-identical files.
"""

import argparse
import csv
import os
import random
from collections import defaultdict
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.normpath(os.path.join(HERE, "..", "data"))

SEED = 42
RNG = random.Random(SEED)

# Analysis window: quarterly history used for trend / emerging-skill detection.
QUARTERS = [
    "2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4",
    "2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4",
]
PERIOD_START = date(2025, 1, 1)
PERIOD_END = date(2026, 10, 20)

# Trend windows. The final quarter of the dataset is partial (the observation
# window ends mid quarter), so trend is measured between the first three full
# quarters and the last three full quarters. Shares are always normalised by the
# number of postings in the quarter, so a small quarter cannot distort growth.
# A larger posting volume is needed than a normal "demo" dataset because a
# per-quarter sample of only a few dozen postings is dominated by noise.
BASELINE_QUARTERS = ["2025-Q1", "2025-Q2", "2025-Q3"]
RECENT_QUARTERS = ["2026-Q1", "2026-Q2", "2026-Q3"]
MIN_TOTAL_FOR_TREND = 30

# ---------------------------------------------------------------------------
# 1. SKILLS  (name, category, description)
# ---------------------------------------------------------------------------
SKILLS = [
    # --- Programming ---
    ("Python", "Programming", "General purpose language widely used for data and backend work"),
    ("R", "Programming", "Statistical programming language for analysis and reporting"),
    ("Java", "Programming", "Object oriented language for enterprise backend systems"),
    ("JavaScript", "Programming", "Language of the web, used in browser and Node.js runtimes"),
    ("TypeScript", "Programming", "Typed superset of JavaScript used in large frontends"),
    ("C++", "Programming", "High performance language used in systems and robotics"),
    ("C#", "Programming", "Language used with the .NET platform"),
    ("Go", "Programming", "Compiled language used for services and infrastructure tooling"),
    ("SQL", "Programming", "Query language for relational databases"),
    ("Scala", "Programming", "JVM language commonly used with Apache Spark"),
    ("Shell Scripting", "Programming", "Automating tasks with bash and shell tools"),
    ("Kotlin", "Programming", "Modern language for Android and JVM services"),
    ("Swift", "Programming", "Language for Apple platform applications"),
    ("Rust", "Programming", "Memory safe systems programming language"),
    ("MATLAB", "Programming", "Numerical computing environment used in engineering"),
    ("PHP", "Programming", "Server side language used in classic web stacks"),
    ("Ruby", "Programming", "Dynamic language used with the Rails framework"),
    # --- Databases ---
    ("MySQL", "Databases", "Open source relational database"),
    ("PostgreSQL", "Databases", "Advanced open source relational database"),
    ("MongoDB", "Databases", "Document oriented NoSQL database"),
    ("Redis", "Databases", "In memory key value store used for caching"),
    ("Oracle Database", "Databases", "Enterprise relational database"),
    ("SQL Server", "Databases", "Microsoft relational database"),
    ("Snowflake", "Databases", "Cloud data warehouse with separated compute and storage"),
    ("BigQuery", "Databases", "Google Cloud serverless analytics warehouse"),
    ("Amazon Redshift", "Databases", "AWS columnar data warehouse"),
    ("Databricks", "Databases", "Lakehouse platform built on Apache Spark"),
    ("Cassandra", "Databases", "Distributed wide column NoSQL database"),
    ("Elasticsearch", "Databases", "Distributed search and analytics engine"),
    # --- Data Engineering ---
    ("Apache Spark", "Data Engineering", "Distributed data processing engine"),
    ("Apache Airflow", "Data Engineering", "Workflow orchestration for data pipelines"),
    ("Apache Kafka", "Data Engineering", "Distributed event streaming platform"),
    ("dbt", "Data Engineering", "SQL based transformation framework for analytics"),
    ("ETL Pipelines", "Data Engineering", "Extract transform load data movement design"),
    ("Apache Hadoop", "Data Engineering", "Distributed storage and batch processing framework"),
    ("Apache Hive", "Data Engineering", "SQL layer over Hadoop distributed storage"),
    ("Data Modeling", "Data Engineering", "Designing normalized and dimensional schemas"),
    ("Data Warehousing", "Data Engineering", "Designing analytical storage layers"),
    ("Delta Lake", "Data Engineering", "Transactional storage layer for lakehouse tables"),
    ("Apache Flink", "Data Engineering", "Stream processing engine with event time semantics"),
    ("Pandas", "Data Engineering", "Python data manipulation library"),
    ("NumPy", "Data Engineering", "Python numerical computing library"),
    ("Data Quality", "Data Engineering", "Testing, monitoring and improving dataset accuracy"),
    ("Data Governance", "Data Engineering", "Policies, lineage and access control for data assets"),
    # --- Machine Learning ---
    ("Machine Learning", "Machine Learning", "Building models that learn patterns from data"),
    ("Deep Learning", "Machine Learning", "Neural network based model development"),
    ("Scikit-learn", "Machine Learning", "Classical machine learning library in Python"),
    ("TensorFlow", "Machine Learning", "Deep learning framework by Google"),
    ("PyTorch", "Machine Learning", "Deep learning framework popular in research"),
    ("Keras", "Machine Learning", "High level neural network API"),
    ("Natural Language Processing", "Machine Learning", "Working with text data and language models"),
    ("Computer Vision", "Machine Learning", "Image and video understanding with models"),
    ("Reinforcement Learning", "Machine Learning", "Learning policies through reward signals"),
    ("Feature Engineering", "Machine Learning", "Creating informative model inputs"),
    ("Model Deployment", "Machine Learning", "Serving trained models in production"),
    ("MLflow", "Machine Learning", "Experiment tracking and model registry"),
    ("Kubeflow", "Machine Learning", "Running ML pipelines on Kubernetes"),
    ("Hyperparameter Tuning", "Machine Learning", "Searching model configurations systematically"),
    ("Recommender Systems", "Machine Learning", "Ranking and personalisation models"),
    ("Time Series Analysis", "Machine Learning", "Forecasting and temporal pattern modelling"),
    ("Generative AI", "Machine Learning", "Building with generative models"),
    ("Large Language Models", "Machine Learning", "Working with transformer based language models"),
    ("Retrieval Augmented Generation", "Machine Learning", "Grounding LLM answers in retrieved documents"),
    ("Prompt Engineering", "Machine Learning", "Designing effective prompts for LLMs"),
    ("Transformers", "Machine Learning", "Attention based neural network architecture"),
    ("MLOps", "Machine Learning", "Operating machine learning systems in production"),
    # --- Statistics ---
    ("Statistics", "Statistics", "Descriptive and inferential statistical reasoning"),
    ("A/B Testing", "Statistics", "Designing and reading controlled experiments"),
    ("Hypothesis Testing", "Statistics", "Formal statistical decision making"),
    ("Regression Analysis", "Statistics", "Modelling relationships between variables"),
    ("Bayesian Statistics", "Statistics", "Probabilistic modelling with priors"),
    ("Probability", "Statistics", "Foundations of uncertainty and random variables"),
    ("Experimental Design", "Statistics", "Planning experiments to avoid bias"),
    ("Causal Inference", "Statistics", "Estimating causal effects from observational data"),
    # --- Visualization ---
    ("Tableau", "Visualization", "Self service business intelligence tool"),
    ("Power BI", "Visualization", "Microsoft business intelligence platform"),
    ("Looker", "Visualization", "Cloud BI and semantic modelling tool"),
    ("Matplotlib", "Visualization", "Python plotting library"),
    ("Seaborn", "Visualization", "Statistical plotting library built on Matplotlib"),
    ("Plotly", "Visualization", "Interactive charting library"),
    ("Google Analytics", "Visualization", "Web and product traffic analytics"),
    ("Microsoft Excel", "Visualization", "Spreadsheet analysis and quick modelling"),
    ("Data Storytelling", "Visualization", "Turning analysis into a clear narrative"),
    ("Dashboard Design", "Visualization", "Designing usable analytical dashboards"),
    ("Streamlit", "Visualization", "Fast Python apps for data demos"),
    # --- Cloud & DevOps ---
    ("AWS", "Cloud & DevOps", "Amazon Web Services cloud platform"),
    ("Microsoft Azure", "Cloud & DevOps", "Microsoft cloud platform"),
    ("Google Cloud Platform", "Cloud & DevOps", "Google cloud platform"),
    ("Docker", "Cloud & DevOps", "Container packaging and runtime"),
    ("Kubernetes", "Cloud & DevOps", "Container orchestration platform"),
    ("Terraform", "Cloud & DevOps", "Declarative infrastructure as code tool"),
    ("CI/CD", "Cloud & DevOps", "Automated build, test and release pipelines"),
    ("Jenkins", "Cloud & DevOps", "Automation server for build pipelines"),
    ("Linux", "Cloud & DevOps", "Unix like operating system administration"),
    ("Git", "Cloud & DevOps", "Distributed version control system"),
    ("GitHub Actions", "Cloud & DevOps", "CI/CD workflows hosted on GitHub"),
    ("Prometheus", "Cloud & DevOps", "Metrics collection and alerting system"),
    ("Grafana", "Cloud & DevOps", "Monitoring and observability dashboards"),
    ("Ansible", "Cloud & DevOps", "Agentless configuration management"),
    ("Serverless Computing", "Cloud & DevOps", "Functions as a service application design"),
    ("Cloud Security", "Cloud & DevOps", "Securing cloud accounts, networks and data"),
    ("Site Reliability Practices", "Cloud & DevOps", "SLIs, SLOs, error budgets and toil reduction"),
    ("Infrastructure as Code", "Cloud & DevOps", "Managing environments through versioned code"),
    # --- Web & Software ---
    ("React", "Web & Software", "Component based frontend library"),
    ("Node.js", "Web & Software", "JavaScript runtime for servers"),
    ("Express.js", "Web & Software", "Minimal Node.js web framework"),
    ("REST API Design", "Web & Software", "Designing resource oriented HTTP APIs"),
    ("GraphQL", "Web & Software", "Query language for APIs"),
    ("HTML", "Web & Software", "Markup language for web documents"),
    ("CSS", "Web & Software", "Styling language for web interfaces"),
    ("Spring Boot", "Web & Software", "Java framework for production services"),
    ("Django", "Web & Software", "Batteries included Python web framework"),
    ("Flask", "Web & Software", "Lightweight Python web framework"),
    ("FastAPI", "Web & Software", "Typed async Python API framework"),
    ("Microservices", "Web & Software", "Decomposing systems into independent services"),
    ("Redux", "Web & Software", "Predictable state container for React apps"),
    ("Next.js", "Web & Software", "React framework with server rendering"),
    ("Jest", "Web & Software", "JavaScript testing framework"),
    ("System Design", "Web & Software", "Designing scalable distributed systems"),
    ("Object Oriented Design", "Web & Software", "Designing maintainable class structures"),
    ("Test Automation", "Web & Software", "Automating regression test suites"),
    ("Selenium", "Web & Software", "Browser automation tool for testing"),
    ("Playwright", "Web & Software", "Modern cross browser automation framework"),
    # --- Security ---
    ("Network Security", "Security", "Protecting networks from intrusion"),
    ("Penetration Testing", "Security", "Ethically attacking systems to find flaws"),
    ("SIEM Tools", "Security", "Centralised security event monitoring"),
    ("Threat Modeling", "Security", "Structured analysis of security threats"),
    ("Cryptography", "Security", "Encryption, hashing and key management"),
    ("Identity and Access Management", "Security", "Authentication and authorisation systems"),
    ("Incident Response", "Security", "Detecting and containing security incidents"),
    # --- Business & Soft Skills ---
    ("Communication", "Business & Soft Skills", "Explaining technical work to mixed audiences"),
    ("Problem Solving", "Business & Soft Skills", "Structured decomposition of ambiguous problems"),
    ("Stakeholder Management", "Business & Soft Skills", "Aligning business partners and delivery teams"),
    ("Team Collaboration", "Business & Soft Skills", "Working effectively in cross functional teams"),
    ("Agile Scrum", "Business & Soft Skills", "Iterative delivery ceremonies and practices"),
    ("Presentation Skills", "Business & Soft Skills", "Presenting findings and recommendations"),
    ("Critical Thinking", "Business & Soft Skills", "Challenging assumptions with evidence"),
    ("Mentoring", "Business & Soft Skills", "Growing junior team members"),
    ("Technical Documentation", "Business & Soft Skills", "Writing clear specs, runbooks and reports"),
    ("Product Thinking", "Business & Soft Skills", "Prioritising work by user and business value"),
    ("Domain Knowledge BFSI", "Business & Soft Skills", "Banking, financial services and insurance context"),
    ("Domain Knowledge Healthcare", "Business & Soft Skills", "Healthcare and life sciences context"),
    ("Domain Knowledge E-commerce", "Business & Soft Skills", "Retail and marketplace context"),
    ("Requirement Gathering", "Business & Soft Skills", "Eliciting and documenting business needs"),
    ("Process Improvement", "Business & Soft Skills", "Removing waste from existing workflows"),
    ("Financial Modeling", "Business & Soft Skills", "Forecasting and valuation models"),
    ("Risk Analysis", "Business & Soft Skills", "Identifying and quantifying business risk"),
]

# Skills whose relative share of job requirements rises / falls over the window.
# This is what makes the "emerging skills" feature data driven instead of hardcoded.
SKILL_TREND = {
    "Generative AI": 0.28, "Large Language Models": 0.30,
    "Retrieval Augmented Generation": 0.32, "Prompt Engineering": 0.30,
    "MLOps": 0.22, "MLflow": 0.20, "Databricks": 0.22, "dbt": 0.24,
    "Snowflake": 0.18, "Kubernetes": 0.16, "Terraform": 0.14,
    "Delta Lake": 0.22, "Apache Airflow": 0.18, "Streamlit": 0.18,
    "FastAPI": 0.18, "Playwright": 0.16, "Cloud Security": 0.14,
    "Causal Inference": 0.20, "Data Governance": 0.18,
    "Apache Hadoop": -0.26, "Apache Hive": -0.24, "Oracle Database": -0.22,
    "MATLAB": -0.24, "Keras": -0.20, "Jenkins": -0.18, "Selenium": -0.16,
    "Microsoft Excel": -0.14, "PHP": -0.20,
}

# ---------------------------------------------------------------------------
# 2. JOB ROLES  (title, family, seniority, salary_min, salary_max, weight, description)
#    salary values are illustrative annual INR
# ---------------------------------------------------------------------------
ROLES = [
    ("Data Analyst", "Data & Analytics", "Entry", 420000, 900000, 10,
     "Turn raw business data into reports and insights that guide day to day decisions."),
    ("Senior Data Analyst", "Data & Analytics", "Senior", 900000, 1800000, 7,
     "Own analytical workstreams end to end and mentor junior analysts."),
    ("Business Analyst", "Business & Product", "Entry", 450000, 1100000, 9,
     "Translate business needs into requirements, process maps and measurable outcomes."),
    ("Business Intelligence Analyst", "Data & Analytics", "Mid", 600000, 1400000, 8,
     "Build semantic models and dashboards that the business relies on daily."),
    ("Product Analyst", "Business & Product", "Mid", 700000, 1600000, 7,
     "Measure product usage, run experiments and inform roadmap decisions."),
    ("Marketing Analyst", "Business & Product", "Entry", 400000, 950000, 6,
     "Analyse campaigns, channels and funnel performance to improve acquisition."),
    ("Financial Analyst", "Business & Product", "Mid", 550000, 1300000, 7,
     "Build forecast models, variance analyses and investment cases."),
    ("Risk Analyst", "Business & Product", "Mid", 600000, 1500000, 6,
     "Assess credit, market and operational risk exposures with quantitative methods."),
    ("Quantitative Analyst", "Data & Analytics", "Senior", 1200000, 3000000, 4,
     "Develop pricing, signal or portfolio models using statistical and numerical methods."),
    ("Statistician", "Data & Analytics", "Mid", 650000, 1500000, 4,
     "Apply statistical methodology to study design, measurement and inference."),
    ("Analytics Engineer", "Data & Analytics", "Mid", 800000, 1800000, 7,
     "Own the transformation layer between raw warehouse data and analytics models."),
    ("Data Engineer", "Data Platform", "Mid", 700000, 1700000, 10,
     "Build reliable batch and streaming pipelines that move and reshape data."),
    ("Senior Data Engineer", "Data Platform", "Senior", 1400000, 2800000, 8,
     "Design data platform architecture and lead pipeline reliability work."),
    ("Data Architect", "Data Platform", "Lead", 2200000, 4200000, 4,
     "Define the enterprise data architecture, standards and platform roadmap."),
    ("Data Governance Analyst", "Data Platform", "Mid", 700000, 1600000, 4,
     "Implement data quality rules, lineage, cataloguing and access policies."),
    ("Database Administrator", "Data Platform", "Mid", 600000, 1500000, 5,
     "Keep relational databases performant, backed up and highly available."),
    ("Data Scientist", "Data & Analytics", "Mid", 900000, 2200000, 10,
     "Frame business problems as models and deliver measurable predictive value."),
    ("Senior Data Scientist", "Data & Analytics", "Senior", 1800000, 3800000, 7,
     "Lead modelling strategy and mentor the data science team."),
    ("Machine Learning Engineer", "AI & Machine Learning", "Mid", 1000000, 2400000, 10,
     "Productionise models: training infrastructure, serving and monitoring."),
    ("Senior Machine Learning Engineer", "AI & Machine Learning", "Senior", 2000000, 4200000, 6,
     "Own ML platform components and coach engineers on modelling quality."),
    ("MLOps Engineer", "AI & Machine Learning", "Mid", 1100000, 2600000, 6,
     "Automate the ML lifecycle: pipelines, registries, rollout and drift detection."),
    ("NLP Engineer", "AI & Machine Learning", "Mid", 1100000, 2600000, 5,
     "Build text understanding and language generation systems."),
    ("Computer Vision Engineer", "AI & Machine Learning", "Mid", 1100000, 2600000, 5,
     "Build image and video understanding models for real products."),
    ("AI Research Engineer", "AI & Machine Learning", "Senior", 1800000, 4000000, 4,
     "Prototype and evaluate novel model architectures and training methods."),
    ("Robotics Software Engineer", "AI & Machine Learning", "Mid", 900000, 2200000, 3,
     "Develop perception, planning and control software for robotic systems."),
    ("Analytics Manager", "Leadership", "Lead", 1800000, 3800000, 5,
     "Lead a team of analysts and own the analytical roadmap for a business unit."),
    ("Data Science Manager", "Leadership", "Lead", 2500000, 4800000, 4,
     "Lead data scientists and own modelling standards and delivery."),
    ("Product Manager", "Business & Product", "Senior", 1600000, 3800000, 7,
     "Own product outcomes: discovery, prioritisation and delivery trade-offs."),
    ("Technical Product Manager", "Business & Product", "Senior", 2000000, 4200000, 5,
     "Own a technical product area such as data or platform services."),
    ("Backend Developer", "Software Engineering", "Mid", 600000, 1600000, 9,
     "Design and build service APIs, business logic and data access layers."),
    ("Senior Backend Developer", "Software Engineering", "Senior", 1500000, 3200000, 7,
     "Own service architecture, reliability and review quality across a codebase."),
    ("Frontend Developer", "Software Engineering", "Mid", 550000, 1500000, 8,
     "Build accessible, performant user interfaces from design specifications."),
    ("Full Stack Developer", "Software Engineering", "Mid", 700000, 1700000, 9,
     "Deliver features across UI, API and database layers."),
    ("Senior Full Stack Developer", "Software Engineering", "Senior", 1600000, 3400000, 6,
     "Lead feature delivery across the stack and set engineering standards."),
    ("Software Engineer", "Software Engineering", "Entry", 600000, 1400000, 10,
     "Write well tested code and grow into owning components independently."),
    ("Senior Software Engineer", "Software Engineering", "Senior", 1600000, 3600000, 8,
     "Design systems, lead technical decisions and mentor engineers."),
    ("DevOps Engineer", "Cloud & Platform", "Mid", 900000, 2000000, 8,
     "Automate build, deployment and infrastructure for reliable delivery."),
    ("Site Reliability Engineer", "Cloud & Platform", "Senior", 1300000, 2900000, 6,
     "Own service reliability through SLOs, observability and incident response."),
    ("Cloud Engineer", "Cloud & Platform", "Mid", 900000, 2100000, 7,
     "Provision and operate cloud infrastructure and networking."),
    ("Platform Engineer", "Cloud & Platform", "Senior", 1200000, 2600000, 5,
     "Build internal developer platforms that speed up other teams."),
    ("Solution Architect", "Cloud & Platform", "Lead", 2200000, 4500000, 4,
     "Design end to end solutions spanning applications, data and infrastructure."),
    ("QA Automation Engineer", "Quality & Security", "Mid", 550000, 1400000, 6,
     "Automate functional and regression testing across the release pipeline."),
    ("Security Analyst", "Quality & Security", "Mid", 650000, 1500000, 5,
     "Monitor, triage and respond to security alerts and vulnerabilities."),
    ("Cybersecurity Engineer", "Quality & Security", "Senior", 1100000, 2500000, 5,
     "Engineer controls, detection and hardening across infrastructure and apps."),
    ("Mobile App Developer", "Software Engineering", "Mid", 600000, 1600000, 5,
     "Build and ship native or cross platform mobile applications."),
]

# ---------------------------------------------------------------------------
# 3. ROLE -> SKILLS (SKILL_REQUIRED_FOR edges). Order encodes importance:
#    first 3 skills are core, next 3 important, next 3 supporting, rest nice to have.
# ---------------------------------------------------------------------------
ROLE_SKILLS = {
    "Data Analyst": "SQL,Python,Microsoft Excel,Tableau,Statistics,Communication,Data Storytelling,Power BI,Dashboard Design,A/B Testing,Problem Solving,Requirement Gathering",
    "Senior Data Analyst": "SQL,Python,Tableau,Statistics,Data Storytelling,Communication,Power BI,Dashboard Design,Stakeholder Management,Mentoring,Process Improvement,Data Modeling",
    "Business Analyst": "Requirement Gathering,Communication,SQL,Microsoft Excel,Stakeholder Management,Process Improvement,Problem Solving,Presentation Skills,Agile Scrum,Domain Knowledge BFSI,Power BI,Technical Documentation",
    "Business Intelligence Analyst": "SQL,Power BI,Dashboard Design,Data Modeling,Microsoft Excel,Data Warehousing,Communication,Tableau,Data Storytelling,ETL Pipelines,Looker",
    "Product Analyst": "SQL,Python,A/B Testing,Statistics,Product Thinking,Dashboard Design,Google Analytics,Data Storytelling,Communication,Experimental Design,Streamlit",
    "Marketing Analyst": "SQL,Microsoft Excel,Google Analytics,Data Storytelling,Communication,Power BI,Statistics,A/B Testing,Dashboard Design,Presentation Skills",
    "Financial Analyst": "Microsoft Excel,Financial Modeling,SQL,Statistics,Risk Analysis,Communication,Power BI,Regression Analysis,Presentation Skills,Domain Knowledge BFSI",
    "Risk Analyst": "Risk Analysis,SQL,Statistics,Microsoft Excel,Python,Regression Analysis,Domain Knowledge BFSI,Communication,Critical Thinking,Power BI",
    "Quantitative Analyst": "Python,Statistics,Probability,Regression Analysis,Time Series Analysis,SQL,Bayesian Statistics,Financial Modeling,R,MATLAB",
    "Statistician": "Statistics,Probability,Hypothesis Testing,R,Regression Analysis,Experimental Design,Bayesian Statistics,A/B Testing,Causal Inference,Python",
    "Analytics Engineer": "SQL,dbt,Data Modeling,Data Warehousing,Snowflake,Python,ETL Pipelines,Git,Dashboard Design,Data Quality,Power BI,Delta Lake",
    "Data Engineer": "SQL,Python,ETL Pipelines,Apache Spark,Data Modeling,Apache Airflow,Apache Hadoop,Apache Hive,Data Warehousing,AWS,Git,Docker,Apache Kafka,Linux,Data Quality",
    "Senior Data Engineer": "SQL,Python,Apache Spark,Data Modeling,Apache Airflow,Apache Hadoop,Data Warehousing,Kubernetes,Apache Kafka,Databricks,Team Collaboration,Mentoring,System Design,Data Quality",
    "Data Architect": "Data Modeling,Data Warehousing,Data Governance,System Design,Data Quality,AWS,Snowflake,Kubernetes,Stakeholder Management,Mentoring,Technical Documentation,Delta Lake",
    "Data Governance Analyst": "Data Governance,Data Quality,SQL,Data Modeling,Communication,Domain Knowledge BFSI,Technical Documentation,Process Improvement,Data Warehousing,Stakeholder Management",
    "Database Administrator": "MySQL,PostgreSQL,SQL,Linux,Oracle Database,Data Modeling,Shell Scripting,AWS,Data Warehousing,Incident Response",
    "Data Scientist": "Python,Statistics,Machine Learning,SQL,Scikit-learn,Feature Engineering,Pandas,Data Storytelling,Hypothesis Testing,Deep Learning,Communication,Large Language Models",
    "Senior Data Scientist": "Python,Machine Learning,Statistics,Feature Engineering,Deep Learning,MLOps,Model Deployment,Communication,Mentoring,Stakeholder Management,Scikit-learn,Generative AI",
    "Machine Learning Engineer": "Python,Machine Learning,PyTorch,Model Deployment,Docker,MLOps,Scikit-learn,MLflow,Kubernetes,Feature Engineering,FastAPI,Generative AI",
    "Senior Machine Learning Engineer": "Python,Machine Learning,PyTorch,MLOps,Model Deployment,Kubernetes,Kubeflow,MLflow,Team Collaboration,Mentoring,System Design,Deep Learning",
    "MLOps Engineer": "Python,Docker,Kubernetes,MLOps,MLflow,CI/CD,Model Deployment,Terraform,AWS,Apache Airflow,Prometheus,Grafana,Linux",
    "NLP Engineer": "Python,Natural Language Processing,Deep Learning,Transformers,PyTorch,Feature Engineering,Model Deployment,Large Language Models,Retrieval Augmented Generation,Prompt Engineering,Communication",
    "Computer Vision Engineer": "Python,Computer Vision,Deep Learning,PyTorch,TensorFlow,Feature Engineering,Model Deployment,C++,Communication,Keras",
    "AI Research Engineer": "Python,Deep Learning,PyTorch,Transformers,Reinforcement Learning,Generative AI,Large Language Models,Hyperparameter Tuning,Technical Documentation,Critical Thinking",
    "Robotics Software Engineer": "C++,Python,Computer Vision,Linux,Reinforcement Learning,Deep Learning,Problem Solving,Object Oriented Design,Team Collaboration,MATLAB",
    "Analytics Manager": "SQL,Communication,Stakeholder Management,Data Storytelling,Team Collaboration,Agile Scrum,Mentoring,Presentation Skills,Problem Solving,Tableau",
    "Data Science Manager": "Machine Learning,Communication,Stakeholder Management,Mentoring,Python,Product Thinking,Agile Scrum,Presentation Skills,Team Collaboration,Statistics",
    "Product Manager": "Product Thinking,Communication,Stakeholder Management,Requirement Gathering,Agile Scrum,Presentation Skills,SQL,Critical Thinking,Problem Solving,Google Analytics",
    "Technical Product Manager": "Product Thinking,System Design,Communication,Stakeholder Management,SQL,REST API Design,Agile Scrum,Technical Documentation,Critical Thinking,Mentoring",
    "Backend Developer": "Node.js,SQL,REST API Design,JavaScript,Git,Docker,MongoDB,Microservices,Express.js,Team Collaboration,Redis,Linux",
    "Senior Backend Developer": "Node.js,SQL,System Design,Microservices,Docker,Kubernetes,REST API Design,Redis,Team Collaboration,Mentoring,PostgreSQL,CI/CD",
    "Frontend Developer": "JavaScript,React,HTML,CSS,Redux,Git,TypeScript,Next.js,REST API Design,Team Collaboration,Jest",
    "Full Stack Developer": "JavaScript,React,Node.js,SQL,REST API Design,HTML,CSS,Git,MongoDB,TypeScript,Express.js,Docker,Agile Scrum",
    "Senior Full Stack Developer": "JavaScript,React,Node.js,SQL,System Design,TypeScript,REST API Design,Docker,Kubernetes,Team Collaboration,Mentoring,CI/CD",
    "Software Engineer": "Java,SQL,Git,Object Oriented Design,Problem Solving,Communication,Data Modeling,Docker,Linux,Agile Scrum,Jest",
    "Senior Software Engineer": "Java,System Design,SQL,Microservices,Docker,Kubernetes,CI/CD,Object Oriented Design,Team Collaboration,Mentoring,Spring Boot,AWS",
    "DevOps Engineer": "Docker,Kubernetes,CI/CD,AWS,Terraform,Linux,Git,Ansible,Prometheus,Shell Scripting,Grafana,Jenkins",
    "Site Reliability Engineer": "Kubernetes,Linux,Prometheus,Grafana,Site Reliability Practices,Docker,AWS,Terraform,Python,Incident Response,CI/CD,Git",
    "Cloud Engineer": "AWS,Terraform,Linux,Docker,Kubernetes,Cloud Security,Infrastructure as Code,Ansible,CI/CD,Serverless Computing,Python,Git",
    "Platform Engineer": "Kubernetes,Docker,Terraform,CI/CD,Linux,Infrastructure as Code,Go,Prometheus,AWS,System Design,Team Collaboration,Site Reliability Practices",
    "Solution Architect": "System Design,Microservices,AWS,Data Modeling,Stakeholder Management,Technical Documentation,Team Collaboration,Mentoring,Docker,Kubernetes,Domain Knowledge E-commerce,Communication",
    "QA Automation Engineer": "Selenium,Java,Test Automation,SQL,Git,Playwright,CI/CD,Problem Solving,Communication,Agile Scrum,Jest",
    "Security Analyst": "Network Security,SIEM Tools,Incident Response,Linux,Communication,Threat Modeling,Problem Solving,Python,Identity and Access Management,Cryptography",
    "Cybersecurity Engineer": "Network Security,Penetration Testing,Cloud Security,Cryptography,Identity and Access Management,Threat Modeling,Python,Linux,Docker,Technical Documentation,Incident Response",
    "Mobile App Developer": "Kotlin,Java,Swift,React,REST API Design,Git,Problem Solving,Team Collaboration,Agile Scrum,Object Oriented Design",
}

# ---------------------------------------------------------------------------
# 4. COMPANIES (fictional - clearly labelled sample data)
# ---------------------------------------------------------------------------
COMPANIES = [
    ("Nimbus Analytics", "Data & Analytics Services", "Bengaluru", "1000-5000", 2011),
    ("Vertex Data Labs", "Artificial Intelligence", "Hyderabad", "201-1000", 2014),
    ("Quantum Retail Tech", "E-commerce", "Bengaluru", "5000-10000", 2009),
    ("Helios FinServe", "Banking & Financial Services", "Mumbai", "10000+", 1998),
    ("MedCore Systems", "Healthcare Technology", "Pune", "1000-5000", 2007),
    ("Arcadia Cloudworks", "Cloud Infrastructure", "Hyderabad", "501-1000", 2013),
    ("Lumen Insights", "Market Research", "Gurugram", "201-500", 2016),
    ("Trellis Software", "Enterprise Software", "Pune", "1000-5000", 2005),
    ("BlueOrbit Logistics", "Logistics & Supply Chain", "Chennai", "5000-10000", 2003),
    ("Northwind Payments", "Fintech", "Bengaluru", "501-1000", 2015),
    ("Solstice Health AI", "Healthcare Technology", "Hyderabad", "51-200", 2019),
    ("Cobalt Mobility", "Automotive Technology", "Chennai", "1000-5000", 2010),
    ("Pinecrest Analytics", "Consulting", "Mumbai", "5000-10000", 1996),
    ("Aeris Telecom", "Telecommunications", "Noida", "10000+", 2001),
    ("Zenith Retail Group", "Retail", "Gurugram", "10000+", 1994),
    ("Fabricly Commerce", "E-commerce", "Bengaluru", "501-1000", 2018),
    ("Ironclad Security", "Cybersecurity", "Pune", "201-500", 2012),
    ("Meridian Insurance", "Insurance", "Mumbai", "5000-10000", 1988),
    ("Aurora Energy Digital", "Energy & Utilities", "Ahmedabad", "1000-5000", 2006),
    ("Lattice Learning", "EdTech", "Bengaluru", "201-500", 2017),
    ("Sable Manufacturing Systems", "Industrial IoT", "Pune", "1000-5000", 1999),
    ("Harborline Shipping Tech", "Logistics & Supply Chain", "Chennai", "501-1000", 2011),
    ("Crestview Capital Analytics", "Investment Management", "Mumbai", "201-500", 2014),
    ("Vireo Biotech Data", "Life Sciences", "Hyderabad", "51-200", 2020),
    ("Pathway Consulting", "Consulting", "Gurugram", "1000-5000", 2004),
    ("Summit Grid Tech", "Energy & Utilities", "Noida", "5000-10000", 2000),
    ("Onyx Media Network", "Media & Entertainment", "Mumbai", "501-1000", 2008),
    ("Cloverleaf Agritech", "Agritech", "Pune", "201-500", 2018),
    ("Delta Foodworks", "Consumer Goods", "Bengaluru", "5000-10000", 1992),
    ("Sterling Travel Systems", "Travel & Hospitality", "Gurugram", "1000-5000", 2002),
    ("Beacon GovTech", "Public Sector Technology", "Noida", "501-1000", 2013),
    ("Prism Gaming Studios", "Gaming", "Hyderabad", "201-500", 2016),
    ("Falcon Aerospace Software", "Aerospace", "Bengaluru", "1000-5000", 1997),
    ("Copperline Bank", "Banking & Financial Services", "Chennai", "10000+", 1995),
    ("Elevate HR Cloud", "HR Technology", "Pune", "501-1000", 2015),
    ("Nova Semiconductors", "Semiconductors", "Bengaluru", "1000-5000", 2009),
    ("Jedwood Realty Analytics", "Real Estate", "Mumbai", "201-500", 2012),
    ("Tandem Freight Cloud", "Logistics & Supply Chain", "Hyderabad", "501-1000", 2014),
    ("Willow Pharma Data", "Pharmaceuticals", "Ahmedabad", "1000-5000", 2001),
    ("Granite Public Cloud", "Cloud Infrastructure", "Bengaluru", "201-500", 2019),
]

LOCATIONS = [
    ("Bengaluru", 0.20), ("Hyderabad", 0.16), ("Pune", 0.13), ("Mumbai", 0.12),
    ("Gurugram", 0.10), ("Chennai", 0.09), ("Noida", 0.08), ("Kolkata", 0.04),
    ("Ahmedabad", 0.03), ("Remote", 0.05),
]

EMPLOYMENT_TYPES = [("Full-time", 0.88), ("Contract", 0.08), ("Internship", 0.04)]

SENIORITY_EXPERIENCE = {
    "Entry": (0, 3),
    "Mid": (2, 6),
    "Senior": (5, 11),
    "Lead": (8, 15),
}

FAMILY_DUTY = {
    "Data & Analytics": [
        "own the analysis from question framing through to recommendation",
        "build and maintain models that stakeholders trust",
        "translate ambiguous business questions into measurable definitions",
    ],
    "Data Platform": [
        "design and operate data pipelines that other teams depend on",
        "improve data reliability, freshness and cost efficiency",
        "model warehouse layers that support analytics and reporting",
    ],
    "AI & Machine Learning": [
        "take models from notebook prototype to monitored production service",
        "improve model quality through better features and evaluation",
        "partner with product teams to embed intelligence into the product",
    ],
    "Software Engineering": [
        "deliver well tested features across the stack",
        "improve code quality, observability and release confidence",
        "break down work and ship incrementally",
    ],
    "Cloud & Platform": [
        "automate infrastructure and delivery so teams ship safely",
        "improve reliability, cost and security of the platform",
        "build tooling that reduces manual operational work",
    ],
    "Quality & Security": [
        "reduce release risk through automation and testing depth",
        "detect, triage and remediate security or quality issues",
        "raise the engineering bar through reviews and standards",
    ],
    "Business & Product": [
        "define requirements and success metrics with business owners",
        "improve processes using data and structured problem solving",
        "communicate findings that change decisions",
    ],
    "Leadership": [
        "grow a high performing team and set technical direction",
        "own delivery outcomes across several workstreams",
        "balance roadmap ambition against team capacity",
    ],
}

# ---------------------------------------------------------------------------
# 5. CAREER TRANSITIONS (LEADS_TO edges)
#    (from_role, to_role, transition_type, avg_years, difficulty 1-5, notes)
# ---------------------------------------------------------------------------
TRANSITIONS = [
    ("Data Analyst", "Senior Data Analyst", "vertical", 2.0, 2, "Standard progression within the analytics ladder."),
    ("Data Analyst", "Business Analyst", "lateral", 1.5, 2, "Analytics delivery skills transfer well to business analysis."),
    ("Data Analyst", "Business Intelligence Analyst", "lateral", 1.5, 2, "Deeper BI modelling and dashboard ownership."),
    ("Data Analyst", "Product Analyst", "lateral", 1.5, 2, "Move closer to product decision making."),
    ("Data Analyst", "Marketing Analyst", "lateral", 1.0, 2, "Channel and campaign analytics specialisation."),
    ("Data Analyst", "Financial Analyst", "lateral", 1.5, 3, "Requires financial modelling and domain knowledge."),
    ("Data Analyst", "Risk Analyst", "lateral", 2.0, 3, "Requires risk frameworks and regulatory context."),
    ("Data Analyst", "Analytics Engineer", "pivot", 2.5, 4, "Pivot into the data transformation layer with dbt and warehouse skills."),
    ("Data Analyst", "Data Engineer", "pivot", 3.0, 4, "Pivot into pipeline engineering; needs Spark and orchestration depth."),
    ("Data Analyst", "Data Scientist", "pivot", 3.0, 4, "Pivot into modelling; needs machine learning and statistics depth."),
    ("Senior Data Analyst", "Data Scientist", "pivot", 2.5, 3, "Strong analytical base makes this a short pivot."),
    ("Senior Data Analyst", "Analytics Engineer", "pivot", 2.0, 3, "Own the semantic and transformation layer."),
    ("Senior Data Analyst", "Data Engineer", "pivot", 2.5, 4, "Add distributed processing and orchestration."),
    ("Senior Data Analyst", "Analytics Manager", "vertical", 2.5, 3, "First people-management step in analytics."),
    ("Senior Data Analyst", "Product Analyst", "lateral", 1.5, 3, "Senior analytics role closer to product."),
    ("Business Analyst", "Business Intelligence Analyst", "lateral", 1.5, 2, "Add BI modelling and visualisation depth."),
    ("Business Analyst", "Data Analyst", "lateral", 1.5, 2, "Shift from requirements to hands-on analysis."),
    ("Business Analyst", "Product Analyst", "lateral", 1.5, 2, "Analytics inside the product organisation."),
    ("Business Analyst", "Product Manager", "pivot", 3.0, 4, "Full ownership of product outcomes."),
    ("Business Analyst", "Technical Product Manager", "pivot", 3.0, 5, "Requires system design literacy."),
    ("Business Intelligence Analyst", "Senior Data Analyst", "vertical", 2.0, 2, "Grow analytical depth and ownership."),
    ("Business Intelligence Analyst", "Analytics Engineer", "pivot", 2.5, 3, "Move from reporting to modelled data."),
    ("Business Intelligence Analyst", "Data Engineer", "pivot", 3.0, 4, "Pipeline engineering pivot."),
    ("Analytics Engineer", "Data Engineer", "lateral", 1.5, 3, "Add orchestration, streaming and cloud depth."),
    ("Analytics Engineer", "Data Scientist", "pivot", 2.5, 4, "Requires modelling and experimentation depth."),
    ("Data Engineer", "Senior Data Engineer", "vertical", 2.5, 2, "Own platform components end to end."),
    ("Data Engineer", "Analytics Engineer", "lateral", 1.5, 3, "Move up the warehouse stack."),
    ("Data Engineer", "MLOps Engineer", "pivot", 3.0, 4, "Apply platform skills to the ML lifecycle."),
    ("Data Engineer", "Cloud Engineer", "pivot", 2.5, 4, "Infrastructure and networking specialisation."),
    ("Data Engineer", "Data Architect", "vertical", 4.0, 5, "Long-horizon architecture track."),
    ("Senior Data Engineer", "Data Architect", "vertical", 3.0, 4, "Natural step into architecture."),
    ("Senior Data Engineer", "MLOps Engineer", "lateral", 2.0, 3, "Platform mindset transfers directly."),
    ("Senior Data Engineer", "Analytics Manager", "pivot", 3.0, 4, "Move into people and delivery leadership."),
    ("Data Architect", "Solution Architect", "lateral", 3.0, 4, "Broaden from data to end to end solutions."),
    ("Data Architect", "Analytics Manager", "lateral", 3.0, 4, "Leadership route with architecture context."),
    ("Data Governance Analyst", "Analytics Engineer", "pivot", 3.0, 4, "Move from policy to implementation."),
    ("Data Governance Analyst", "Data Architect", "pivot", 4.0, 5, "Long-horizon architecture track."),
    ("Database Administrator", "Data Engineer", "pivot", 3.0, 4, "Classic DBA to data engineering pivot."),
    ("Database Administrator", "Cloud Engineer", "pivot", 3.0, 4, "Cloud infrastructure specialisation."),
    ("Database Administrator", "Backend Developer", "pivot", 2.5, 4, "Add application development."),
    ("Data Scientist", "Senior Data Scientist", "vertical", 3.0, 3, "Own modelling strategy."),
    ("Data Scientist", "Machine Learning Engineer", "lateral", 2.0, 3, "Engineering heavy sibling role of data science."),
    ("Data Scientist", "Statistician", "lateral", 1.5, 3, "Methodology-focused track."),
    ("Data Scientist", "NLP Engineer", "pivot", 2.0, 4, "Specialise in language data."),
    ("Data Scientist", "Computer Vision Engineer", "pivot", 2.5, 5, "Specialise in visual data; heavy deep learning."),
    ("Data Scientist", "Data Science Manager", "vertical", 4.0, 4, "People leadership in data science."),
    ("Data Scientist", "AI Research Engineer", "pivot", 3.0, 5, "Research heavy; needs novel architecture experience."),
    ("Senior Data Scientist", "Data Science Manager", "vertical", 2.5, 4, "First management step."),
    ("Senior Data Scientist", "AI Research Engineer", "pivot", 2.0, 5, "Research track from senior level."),
    ("Senior Data Scientist", "Senior Machine Learning Engineer", "lateral", 2.0, 3, "Deepen the engineering side of modelling."),
    ("Machine Learning Engineer", "Senior Machine Learning Engineer", "vertical", 2.5, 3, "Own ML platform components."),
    ("Machine Learning Engineer", "MLOps Engineer", "lateral", 1.5, 3, "Shift from modelling to lifecycle automation."),
    ("Machine Learning Engineer", "NLP Engineer", "lateral", 2.0, 4, "Domain specialisation in language."),
    ("Machine Learning Engineer", "AI Research Engineer", "pivot", 3.0, 5, "Requires research output."),
    ("Senior Machine Learning Engineer", "MLOps Engineer", "lateral", 2.0, 3, "Platform reliability focus."),
    ("Senior Machine Learning Engineer", "AI Research Engineer", "lateral", 2.0, 4, "Research collaboration route."),
    ("MLOps Engineer", "Site Reliability Engineer", "pivot", 2.5, 4, "Reliability engineering on ML systems."),
    ("MLOps Engineer", "Cloud Engineer", "lateral", 2.0, 3, "Infrastructure focused sibling role."),
    ("NLP Engineer", "AI Research Engineer", "lateral", 2.0, 4, "Move from applied to research work."),
    ("Computer Vision Engineer", "AI Research Engineer", "lateral", 2.5, 4, "Research route with vision depth."),
    ("Computer Vision Engineer", "Robotics Software Engineer", "pivot", 3.0, 5, "Perception plus control systems."),
    ("Robotics Software Engineer", "Computer Vision Engineer", "lateral", 2.0, 4, "Shift from control to perception."),
    ("Robotics Software Engineer", "Machine Learning Engineer", "lateral", 2.5, 4, "Generalise modelling skills."),
    ("Statistician", "Data Scientist", "lateral", 2.0, 3, "Strong statistics base with added engineering."),
    ("Statistician", "Quantitative Analyst", "lateral", 2.5, 4, "Numerical and financial modelling depth."),
    ("Quantitative Analyst", "Data Scientist", "lateral", 2.0, 4, "Move into broader product modelling."),
    ("Quantitative Analyst", "Machine Learning Engineer", "lateral", 2.5, 4, "Engineering heavy modelling role."),
    ("Financial Analyst", "Risk Analyst", "lateral", 1.5, 3, "Risk frameworks and modelling."),
    ("Financial Analyst", "Quantitative Analyst", "pivot", 3.0, 5, "Heavy quantitative pivot."),
    ("Risk Analyst", "Quantitative Analyst", "pivot", 2.5, 5, "Deepen stochastic and numerical methods."),
    ("Risk Analyst", "Data Scientist", "pivot", 3.0, 4, "Apply modelling to broader problems."),
    ("Product Analyst", "Product Manager", "vertical", 3.0, 3, "Analytics to product ownership."),
    ("Product Analyst", "Data Analyst", "lateral", 1.5, 2, "Broader analytical remit."),
    ("Marketing Analyst", "Business Analyst", "lateral", 2.0, 3, "Broaden beyond marketing."),
    ("Marketing Analyst", "Product Analyst", "lateral", 2.0, 3, "Move from channels to product metrics."),
    ("Analytics Manager", "Data Science Manager", "lateral", 2.5, 3, "Broader remit across analytics and science."),
    ("Analytics Manager", "Product Manager", "pivot", 3.0, 4, "Move from insight to product ownership."),
    ("Data Science Manager", "Analytics Manager", "lateral", 2.0, 3, "Analytics leadership remit."),
    ("Product Manager", "Technical Product Manager", "lateral", 2.0, 3, "Technical product ownership."),
    ("Technical Product Manager", "Product Manager", "lateral", 1.5, 3, "Broader product ownership."),
    ("Technical Product Manager", "Solution Architect", "pivot", 3.0, 5, "Deep technical design route."),
    ("Software Engineer", "Senior Software Engineer", "vertical", 2.5, 2, "Standard engineering progression."),
    ("Software Engineer", "Backend Developer", "lateral", 1.5, 2, "Backend specialisation."),
    ("Software Engineer", "Frontend Developer", "lateral", 1.5, 3, "Frontend specialisation."),
    ("Software Engineer", "DevOps Engineer", "pivot", 2.5, 4, "Delivery automation pivot."),
    ("Software Engineer", "Data Engineer", "pivot", 3.0, 4, "Data platform pivot."),
    ("Senior Software Engineer", "Solution Architect", "vertical", 3.0, 4, "Architecture track."),
    ("Senior Software Engineer", "Platform Engineer", "lateral", 2.0, 3, "Internal platform specialisation."),
    ("Senior Software Engineer", "Technical Product Manager", "pivot", 3.5, 5, "Product route for technical leaders."),
    ("Backend Developer", "Senior Backend Developer", "vertical", 2.5, 2, "Own service architecture."),
    ("Backend Developer", "Full Stack Developer", "lateral", 1.5, 3, "Add frontend delivery skills."),
    ("Backend Developer", "Software Engineer", "lateral", 1.0, 2, "Broader engineering remit."),
    ("Backend Developer", "DevOps Engineer", "pivot", 2.5, 4, "Add delivery automation."),
    ("Backend Developer", "Data Engineer", "pivot", 3.0, 4, "Move to data movement and modelling."),
    ("Frontend Developer", "Full Stack Developer", "lateral", 1.5, 3, "Add backend and database work."),
    ("Frontend Developer", "Mobile App Developer", "pivot", 2.0, 4, "Platform specific development."),
    ("Full Stack Developer", "Senior Full Stack Developer", "vertical", 2.5, 2, "Own feature areas end to end."),
    ("Full Stack Developer", "Backend Developer", "lateral", 1.5, 2, "Depth over breadth on the server."),
    ("Full Stack Developer", "DevOps Engineer", "pivot", 2.5, 4, "Delivery automation route."),
    ("Full Stack Developer", "Technical Product Manager", "pivot", 3.5, 5, "Product route."),
    ("Senior Backend Developer", "Solution Architect", "vertical", 3.0, 4, "Architecture track."),
    ("Senior Backend Developer", "Platform Engineer", "lateral", 2.0, 3, "Platform specialisation."),
    ("Senior Full Stack Developer", "Solution Architect", "vertical", 3.0, 4, "Architecture track."),
    ("Senior Full Stack Developer", "Senior Software Engineer", "lateral", 1.5, 3, "Broaden engineering scope."),
    ("Mobile App Developer", "Full Stack Developer", "pivot", 2.0, 4, "Add web stack breadth."),
    ("Mobile App Developer", "Senior Software Engineer", "vertical", 3.0, 4, "Seniority jump plus breadth."),
    ("DevOps Engineer", "Site Reliability Engineer", "lateral", 2.0, 3, "Reliability focused sibling role."),
    ("DevOps Engineer", "Cloud Engineer", "lateral", 1.5, 3, "Cloud infrastructure specialisation."),
    ("DevOps Engineer", "Platform Engineer", "lateral", 2.0, 3, "Internal developer platform focus."),
    ("Cloud Engineer", "Site Reliability Engineer", "lateral", 2.0, 3, "Reliability engineering."),
    ("Cloud Engineer", "DevOps Engineer", "lateral", 1.5, 3, "Delivery pipeline focus."),
    ("Site Reliability Engineer", "Platform Engineer", "lateral", 2.0, 3, "Platform engineering route."),
    ("Platform Engineer", "Solution Architect", "vertical", 3.0, 4, "Architecture track."),
    ("QA Automation Engineer", "Backend Developer", "pivot", 3.0, 4, "Move from testing into development."),
    ("QA Automation Engineer", "DevOps Engineer", "pivot", 3.0, 4, "Move into delivery automation."),
    ("QA Automation Engineer", "Site Reliability Engineer", "pivot", 3.5, 5, "Reliability engineering pivot."),
    ("Security Analyst", "Cybersecurity Engineer", "vertical", 2.5, 3, "Move from monitoring to engineering."),
    ("Security Analyst", "Cloud Engineer", "pivot", 3.0, 4, "Cloud infrastructure route."),
    ("Cybersecurity Engineer", "Site Reliability Engineer", "pivot", 3.0, 4, "Reliability with security depth."),
    ("Solution Architect", "Technical Product Manager", "lateral", 3.0, 4, "Product route for architects."),
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def weighted_choice(pairs):
    """pairs: list of (value, weight) tuples."""
    values = [p[0] for p in pairs]
    weights = [p[1] for p in pairs]
    return RNG.choices(values, weights=weights, k=1)[0]


def quarter_of(d):
    return "%d-Q%d" % (d.year, (d.month - 1) // 3 + 1)


def importance_for(index):
    """Order in the role skill list encodes importance on a 1-5 scale."""
    if index < 3:
        return 5
    if index < 6:
        return 4
    if index < 9:
        return 3
    return 2


def random_posting_date():
    span = (PERIOD_END - PERIOD_START).days
    return PERIOD_START + timedelta(days=RNG.randint(0, span))


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(header)
        writer.writerows(rows)
    print("  wrote %-28s %5d rows" % (os.path.basename(path), len(rows)))


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------
def build_job_skills(role, job_id, role_skill_rows, posting_date):
    """Attach 5-9 skills to a posting. Probability of including a skill grows or
    shrinks over the quarters using SKILL_TREND, which is what creates genuine
    skill growth / decline signal in skill_demand.csv."""
    q_index = QUARTERS.index(quarter_of(posting_date))
    candidates = role_skill_rows[role]
    chosen = []
    for skill, importance in candidates:
        base = {5: 0.90, 4: 0.72, 3: 0.45, 2: 0.22}[importance]
        trend = SKILL_TREND.get(skill, 0.0)
        prob = base * (1.0 + trend * q_index)
        prob = max(0.03, min(0.98, prob))
        if RNG.random() < prob:
            chosen.append((skill, importance))
    if len(chosen) < 4:
        for skill, importance in candidates[:4]:
            if (skill, importance) not in chosen:
                chosen.append((skill, importance))
    chosen = chosen[:9]
    return [(job_id, skill, importance) for skill, importance in chosen]


def main():
    parser = argparse.ArgumentParser(description="Generate the sample job market dataset.")
    parser.add_argument("--jobs", type=int, default=2000, help="number of job postings to generate")
    args = parser.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)
    print("Generating sample dataset (synthetic, illustrative values only)")
    print("Output directory: %s" % DATA_DIR)

    # ---- roles -----------------------------------------------------------
    role_rows = []
    for rid, (title, family, seniority, smin, smax, weight, desc) in enumerate(ROLES, start=1):
        role_rows.append([rid, title, family, seniority, desc, smin, smax, 0.0, 0])
    role_index = {r[1]: r[0] for r in role_rows}
    role_meta = {title: dict(family=f, seniority=s, smin=a, smax=b, weight=w)
                 for (title, f, s, a, b, w, _d) in ROLES}

    # ---- skills ----------------------------------------------------------
    skill_rows = []
    for sid, (name, category, desc) in enumerate(SKILLS, start=1):
        skill_rows.append([sid, name, category, desc])
    skill_index = {s[1]: s[0] for s in skill_rows}

    # validate role_skills references
    missing = set()
    role_skill_rows = {}
    for role_title in role_index:
        raw = [s.strip() for s in ROLE_SKILLS[role_title].split(",") if s.strip()]
        cleaned = []
        for idx, name in enumerate(raw):
            if name not in skill_index:
                missing.add(name)
                continue
            cleaned.append((name, importance_for(idx)))
        if len(cleaned) < 8:
            raise SystemExit("Role %s has only %d valid skills" % (role_title, len(cleaned)))
        names = [c[0] for c in cleaned]
        if len(names) != len(set(names)):
            dupes = sorted({n for n in names if names.count(n) > 1})
            raise SystemExit("Role %s lists duplicate skills: %s" % (role_title, dupes))
        role_skill_rows[role_title] = cleaned
    if missing:
        raise SystemExit("Unknown skills referenced in ROLE_SKILLS: %s" % sorted(missing))

    rs_out = []
    for role_title, items in role_skill_rows.items():
        for name, imp in items:
            rs_out.append([role_title, name, imp])

    # ---- companies -------------------------------------------------------
    company_rows = []
    for cid, (name, industry, hq, size, founded) in enumerate(COMPANIES, start=1):
        company_rows.append([cid, name, industry, hq, size, founded])
    company_index = {c[1]: c[0] for c in company_rows}

    # ---- job postings ----------------------------------------------------
    role_titles = list(role_index.keys())
    weights = [role_meta[t]["weight"] for t in role_titles]
    jobs = []
    job_skills = []
    skill_demand = defaultdict(lambda: defaultdict(int))
    quarter_counts = {q: 0 for q in QUARTERS}
    role_recent = defaultdict(int)
    role_all = defaultdict(int)

    for jid in range(1, args.jobs + 1):
        role_title = RNG.choices(role_titles, weights=weights, k=1)[0]
        meta = role_meta[role_title]
        company_name = RNG.choice([c[1] for c in company_rows])
        city = weighted_choice(LOCATIONS)
        emp_type = weighted_choice(EMPLOYMENT_TYPES)
        exp_lo, exp_hi = SENIORITY_EXPERIENCE[meta["seniority"]]
        exp_min = RNG.randint(exp_lo, max(exp_lo, exp_hi - 2))
        exp_max = min(exp_hi + 3, exp_min + RNG.randint(2, 4))

        t = min(1.0, exp_min / 12.0)
        band = meta["smax"] - meta["smin"]
        low = meta["smin"] + band * t * 0.70
        high = meta["smin"] + band * (0.30 + t * 0.70)
        jitter = lambda v: int(round(v * RNG.uniform(0.94, 1.06) / 10000.0) * 10000)
        salary_min = max(300000, jitter(low))
        salary_max = max(salary_min + 80000, jitter(high))
        if emp_type == "Internship":
            salary_min = max(180000, int(salary_min * 0.35))
            salary_max = max(salary_min + 40000, int(salary_max * 0.40))

        posted = random_posting_date()
        quarter = quarter_of(posted)
        quarter_counts[quarter] += 1

        core = [s for s, _i in role_skill_rows[role_title][:4]]
        duty = RNG.choice(FAMILY_DUTY[meta["family"]])
        title = role_title
        if RNG.random() < 0.12:
            prefix = RNG.choice(["Associate", "Lead", "Principal"])
            if meta["seniority"] in ("Entry", "Mid") and prefix == "Associate":
                title = "Associate " + role_title
            elif meta["seniority"] in ("Senior", "Lead"):
                title = prefix + " " + role_title
        description = (
            "%s role at %s (%s). You will %s. Core stack: %s. "
            "Experience required: %d-%d years. Employment type: %s. "
            "Sample posting generated for academic analysis." % (
                title, company_name, city, duty, ", ".join(core),
                exp_min, exp_max, emp_type)
        )

        jobs.append([
            jid, title, company_name, role_title, city, emp_type,
            exp_min, exp_max, salary_min, salary_max, posted.isoformat(), description,
        ])
        role_all[role_title] += 1

        for row in build_job_skills(role_title, jid, role_skill_rows, posted):
            job_skills.append(list(row))
            skill_demand[row[1]][quarter] += 1

        # "recent" window = last two full quarters of the dataset
        if quarter in RECENT_QUARTERS:
            role_recent[role_title] += 1

    # ---- demand scores (derived from the generated postings) --------------
    totals = {t: role_all[t] for t in role_titles}
    recent_totals = {t: role_recent[t] for t in role_titles}
    max_total = max(totals.values()) or 1
    for r in role_rows:
        title = r[1]
        share = totals[title] / float(args.jobs)
        recent_share = recent_totals[title] / float(sum(recent_totals.values()) or 1)
        # demand = volume (65%) + recent momentum (35%), normalised to 0-100
        demand = 100.0 * (0.65 * (totals[title] / float(max_total)) + 0.35 * min(1.0, recent_share / max(1e-9, share)))
        r[7] = round(min(100.0, demand), 1)
        r[8] = 1 if recent_share > share * 1.15 and totals[title] >= 4 else 0

    # ---- skill demand history -------------------------------------------
    # raw_counts[skill][period] -> number of postings mentioning the skill
    quarter_totals = {q: quarter_counts.get(q, 0) for q in QUARTERS}
    base_postings = sum(quarter_totals[q] for q in BASELINE_QUARTERS) or 1
    recent_postings = sum(quarter_totals[q] for q in RECENT_QUARTERS) or 1

    demand_rows = []
    for name, per_q in skill_demand.items():
        counts = [per_q.get(q, 0) for q in QUARTERS]
        total = sum(counts)
        if total == 0:
            continue
        base_count = sum(per_q.get(q, 0) for q in BASELINE_QUARTERS)
        recent_count = sum(per_q.get(q, 0) for q in RECENT_QUARTERS)
        base_share = base_count / float(base_postings)
        recent_share = recent_count / float(recent_postings)

        # Two proportion z-test between the baseline and recent windows. Without
        # this guard, sampling noise on low volume skills shows up as a fake
        # "+200% growth" signal, which would be dishonest to present as insight.
        pooled = (base_count + recent_count) / float(base_postings + recent_postings)
        se = (pooled * (1.0 - pooled) * (1.0 / base_postings + 1.0 / recent_postings)) ** 0.5
        z = (recent_share - base_share) / se if se > 0 else 0.0
        significant = (abs(z) >= 2.58 and total >= MIN_TOTAL_FOR_TREND and base_count >= 5)

        if not significant or base_share <= 0:
            growth = 0.0
        else:
            growth = round(100.0 * (recent_share - base_share) / base_share, 2)
        z_round = round(z, 2)
        for q, c in zip(QUARTERS, counts):
            demand_rows.append([name, q, c, growth, z_round])
    demand_rows.sort(key=lambda row: (row[0], QUARTERS.index(row[1])))

    # ---- write -----------------------------------------------------------
    write_csv(os.path.join(DATA_DIR, "job_roles.csv"),
              ["role_id", "title", "family", "seniority", "description",
               "avg_salary_min", "avg_salary_max", "demand_score", "is_emerging"], role_rows)
    write_csv(os.path.join(DATA_DIR, "sample_skills.csv"),
              ["skill_id", "name", "category", "description"], skill_rows)
    write_csv(os.path.join(DATA_DIR, "companies.csv"),
              ["company_id", "name", "industry", "headquarters", "company_size", "founded_year"],
              company_rows)
    write_csv(os.path.join(DATA_DIR, "sample_jobs.csv"),
              ["job_id", "title", "company_name", "role_title", "location", "employment_type",
               "experience_min", "experience_max", "salary_min", "salary_max", "posted_date",
               "description"], jobs)
    write_csv(os.path.join(DATA_DIR, "role_skills.csv"),
              ["role_title", "skill_name", "importance"], rs_out)
    write_csv(os.path.join(DATA_DIR, "job_skills.csv"),
              ["job_id", "skill_name", "importance"], job_skills)
    write_csv(os.path.join(DATA_DIR, "career_transitions.csv"),
              ["from_role", "to_role", "transition_type", "avg_years", "difficulty", "notes"],
              [list(t) for t in TRANSITIONS])
    write_csv(os.path.join(DATA_DIR, "skill_demand.csv"),
              ["skill_name", "period", "job_count", "growth_rate", "z_score"], demand_rows)

    # ---- console summary -------------------------------------------------
    print("\nSummary")
    print("  roles              : %d" % len(role_rows))
    print("  skills             : %d" % len(skill_rows))
    print("  companies          : %d" % len(company_rows))
    print("  job postings       : %d" % len(jobs))
    print("  role_skill edges   : %d" % len(rs_out))
    print("  job_skill edges    : %d" % len(job_skills))
    print("  career transitions : %d" % len(TRANSITIONS))
    print("  skill demand rows  : %d" % len(demand_rows))
    print("  postings per quarter: %s" % {k: v for k, v in quarter_counts.items() if v})
    print("\nNOTE: all values are synthetic sample data for academic use.")


if __name__ == "__main__":
    main()
