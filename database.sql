-- =============================================================================
-- Web-Based Job Market Intelligence and Career Path Analytics Using Knowledge Graphs
-- MySQL schema, indexes and a small SAMPLE data subset.
--
-- IMPORTANT
--   * All data in this file is SYNTHETIC SAMPLE DATA for academic use.
--     Company names are fictional and salaries are illustrative (annual, INR).
--   * This file creates the schema plus a small, internally consistent sample so
--     that the API returns data immediately after running it.
--   * The FULL dataset (45 roles, 147 skills, 40 companies, 8000 postings) is
--     loaded from data/*.csv by the backend seed script:  npm run seed
--     That script truncates these tables and reloads them from the CSVs, so the
--     sample rows below are only a starting point.
--   * The demo user (demo@example.com / Demo@123) is created by `npm run seed`
--     because the bcrypt hash must be generated at runtime.
--
-- Usage:
--   mysql -u root -p < database.sql
-- =============================================================================

CREATE DATABASE IF NOT EXISTS job_market_intelligence
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE job_market_intelligence;

-- Drop in child -> parent order so the script can be re-run safely.
DROP TABLE IF EXISTS saved_roadmaps;
DROP TABLE IF EXISTS user_skills;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS skill_demand;
DROP TABLE IF EXISTS career_paths;
DROP TABLE IF EXISTS role_skills;
DROP TABLE IF EXISTS job_skills;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS skills;
DROP TABLE IF EXISTS job_roles;

-- -----------------------------------------------------------------------------
-- job_roles : canonical job roles (knowledge-graph node type "role")
-- -----------------------------------------------------------------------------
CREATE TABLE job_roles (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title          VARCHAR(120)  NOT NULL,
  family         VARCHAR(80)   NOT NULL,
  seniority      ENUM('Entry','Mid','Senior','Lead') NOT NULL DEFAULT 'Mid',
  description    VARCHAR(500)  DEFAULT NULL,
  avg_salary_min INT UNSIGNED  DEFAULT NULL COMMENT 'illustrative annual salary, INR',
  avg_salary_max INT UNSIGNED  DEFAULT NULL COMMENT 'illustrative annual salary, INR',
  demand_score   DECIMAL(5,2)  NOT NULL DEFAULT 0 COMMENT '0-100, derived from posting volume and recency',
  is_emerging    TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '1 when recent posting share exceeds long run share',
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_job_roles_title (title),
  KEY idx_job_roles_family (family),
  KEY idx_job_roles_demand (demand_score),
  KEY idx_job_roles_seniority (seniority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- skills : skill master data (knowledge-graph node type "skill")
-- -----------------------------------------------------------------------------
CREATE TABLE skills (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120) NOT NULL,
  category    VARCHAR(80)  NOT NULL,
  description VARCHAR(400) DEFAULT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_skills_name (name),
  KEY idx_skills_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- companies : hiring organisations (knowledge-graph node type "company")
-- -----------------------------------------------------------------------------
CREATE TABLE companies (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(160) NOT NULL,
  industry     VARCHAR(120) DEFAULT NULL,
  headquarters VARCHAR(120) DEFAULT NULL,
  company_size VARCHAR(40)  DEFAULT NULL,
  founded_year SMALLINT UNSIGNED DEFAULT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_companies_name (name),
  KEY idx_companies_industry (industry),
  KEY idx_companies_hq (headquarters)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- jobs : job postings
-- -----------------------------------------------------------------------------
CREATE TABLE jobs (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title           VARCHAR(160) NOT NULL,
  company_id      INT UNSIGNED NOT NULL,
  role_id         INT UNSIGNED NOT NULL,
  location        VARCHAR(120) NOT NULL,
  employment_type ENUM('Full-time','Contract','Internship') NOT NULL DEFAULT 'Full-time',
  experience_min  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  experience_max  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  salary_min      INT UNSIGNED DEFAULT NULL,
  salary_max      INT UNSIGNED DEFAULT NULL,
  posted_date     DATE NOT NULL,
  description     TEXT,
  source          VARCHAR(60) NOT NULL DEFAULT 'sample-dataset',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_jobs_role (role_id),
  KEY idx_jobs_company (company_id),
  KEY idx_jobs_location (location),
  KEY idx_jobs_posted_date (posted_date),
  KEY idx_jobs_salary (salary_min, salary_max),
  KEY idx_jobs_experience (experience_min, experience_max),
  KEY idx_jobs_title (title),
  FULLTEXT KEY ft_jobs_search (title, description),
  CONSTRAINT fk_jobs_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_jobs_role    FOREIGN KEY (role_id)    REFERENCES job_roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- job_skills : skills demanded by a specific posting
-- -----------------------------------------------------------------------------
CREATE TABLE job_skills (
  job_id     INT UNSIGNED NOT NULL,
  skill_id   INT UNSIGNED NOT NULL,
  importance TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT '1-5, 5 = core requirement',
  PRIMARY KEY (job_id, skill_id),
  KEY idx_job_skills_skill (skill_id),
  CONSTRAINT fk_job_skills_job   FOREIGN KEY (job_id)   REFERENCES jobs (id)   ON DELETE CASCADE,
  CONSTRAINT fk_job_skills_skill FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- role_skills : SKILL_REQUIRED_FOR edges (role -> skill)
-- -----------------------------------------------------------------------------
CREATE TABLE role_skills (
  role_id    INT UNSIGNED NOT NULL,
  skill_id   INT UNSIGNED NOT NULL,
  importance TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT '1-5, 5 = core requirement',
  PRIMARY KEY (role_id, skill_id),
  KEY idx_role_skills_skill (skill_id),
  KEY idx_role_skills_importance (importance),
  CONSTRAINT fk_role_skills_role  FOREIGN KEY (role_id)  REFERENCES job_roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_role_skills_skill FOREIGN KEY (skill_id) REFERENCES skills (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- career_paths : LEADS_TO edges (role -> role transition)
-- -----------------------------------------------------------------------------
CREATE TABLE career_paths (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  from_role_id    INT UNSIGNED NOT NULL,
  to_role_id      INT UNSIGNED NOT NULL,
  transition_type ENUM('vertical','lateral','pivot') NOT NULL DEFAULT 'lateral',
  avg_years       DECIMAL(3,1) NOT NULL DEFAULT 2.0 COMMENT 'typical time to become effective in the target role',
  difficulty      TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT '1 = easy, 5 = hard',
  notes           VARCHAR(255) DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_career_paths_edge (from_role_id, to_role_id),
  KEY idx_career_paths_from (from_role_id),
  KEY idx_career_paths_to (to_role_id),
  KEY idx_career_paths_type (transition_type),
  CONSTRAINT fk_career_paths_from FOREIGN KEY (from_role_id) REFERENCES job_roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_career_paths_to   FOREIGN KEY (to_role_id)   REFERENCES job_roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- skill_demand : historical demand per skill per quarter (drives trend analysis)
-- -----------------------------------------------------------------------------
CREATE TABLE skill_demand (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  skill_id    INT UNSIGNED NOT NULL,
  period      VARCHAR(10) NOT NULL COMMENT 'quarter label, e.g. 2026-Q1',
  job_count   INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'postings in that quarter mentioning the skill',
  growth_rate DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT 'share change recent vs baseline window, in percent',
  z_score     DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT 'two proportion z statistic for the change',
  PRIMARY KEY (id),
  UNIQUE KEY uq_skill_demand (skill_id, period),
  KEY idx_skill_demand_period (period),
  KEY idx_skill_demand_skill (skill_id),
  CONSTRAINT fk_skill_demand_skill FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- users : application accounts
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name        VARCHAR(120) NOT NULL,
  email            VARCHAR(190) NOT NULL,
  password_hash    VARCHAR(255) NOT NULL COMMENT 'bcrypt hash, never a plain password',
  current_role_id  INT UNSIGNED DEFAULT NULL COMMENT 'career goal input: where the user is today',
  target_role_id   INT UNSIGNED DEFAULT NULL COMMENT 'career goal input: where the user wants to go',
  location         VARCHAR(120) DEFAULT NULL,
  experience_years DECIMAL(3,1) DEFAULT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_current_role (current_role_id),
  KEY idx_users_target_role (target_role_id),
  CONSTRAINT fk_users_current_role FOREIGN KEY (current_role_id) REFERENCES job_roles (id) ON DELETE SET NULL,
  CONSTRAINT fk_users_target_role  FOREIGN KEY (target_role_id)  REFERENCES job_roles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- user_skills : skills a user already has (drives gap analysis)
-- -----------------------------------------------------------------------------
CREATE TABLE user_skills (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  skill_id    INT UNSIGNED NOT NULL,
  proficiency ENUM('beginner','intermediate','advanced') NOT NULL DEFAULT 'beginner',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_skills (user_id, skill_id),
  KEY idx_user_skills_skill (skill_id),
  CONSTRAINT fk_user_skills_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE,
  CONSTRAINT fk_user_skills_skill FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- saved_roadmaps : career roadmaps a user has saved
--   * path_json          : ordered array of role steps returned by the traversal
--   * missing_skills_json: prioritised skill gaps for the target role
--   * roadmap_json       : full step by step plan with actions and priorities
-- -----------------------------------------------------------------------------
CREATE TABLE saved_roadmaps (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL,
  from_role_id      INT UNSIGNED DEFAULT NULL,
  to_role_id        INT UNSIGNED DEFAULT NULL,
  from_role_title   VARCHAR(120) NOT NULL COMMENT 'snapshot so the roadmap stays readable',
  to_role_title     VARCHAR(120) NOT NULL COMMENT 'snapshot so the roadmap stays readable',
  hops              TINYINT UNSIGNED NOT NULL DEFAULT 0,
  total_years       DECIMAL(4,1) DEFAULT NULL,
  path_json         JSON NOT NULL,
  missing_skills_json JSON NOT NULL,
  roadmap_json      JSON NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_saved_roadmaps_user (user_id),
  KEY idx_saved_roadmaps_created (created_at),
  CONSTRAINT fk_saved_roadmaps_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_roadmaps_from FOREIGN KEY (from_role_id) REFERENCES job_roles (id) ON DELETE SET NULL,
  CONSTRAINT fk_saved_roadmaps_to   FOREIGN KEY (to_role_id)   REFERENCES job_roles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SAMPLE DATA (subset - the full dataset is loaded by `npm run seed`)
-- =============================================================================

INSERT INTO job_roles (id, title, family, seniority, description, avg_salary_min, avg_salary_max, demand_score, is_emerging) VALUES
(1, 'Data Analyst', 'Data & Analytics', 'Entry', 'Turn raw business data into reports and insights that guide day to day decisions.', 420000, 900000, 100.00, 0),
(2, 'Senior Data Analyst', 'Data & Analytics', 'Senior', 'Own analytical workstreams end to end and mentor junior analysts.', 900000, 1800000, 78.60, 0),
(3, 'Business Analyst', 'Business & Product', 'Entry', 'Translate business needs into requirements, process maps and measurable outcomes.', 450000, 1100000, 89.20, 1),
(4, 'Business Intelligence Analyst', 'Data & Analytics', 'Mid', 'Build semantic models and dashboards that the business relies on daily.', 600000, 1400000, 82.50, 0),
(5, 'Product Analyst', 'Business & Product', 'Mid', 'Measure product usage, run experiments and inform roadmap decisions.', 700000, 1600000, 78.50, 0),
(6, 'Marketing Analyst', 'Business & Product', 'Entry', 'Analyse campaigns, channels and funnel performance to improve acquisition.', 400000, 950000, 82.70, 0);

INSERT INTO skills (id, name, category, description) VALUES
(1, 'Python', 'Programming', 'General purpose language widely used for data and backend work'),
(2, 'R', 'Programming', 'Statistical programming language for analysis and reporting'),
(3, 'Java', 'Programming', 'Object oriented language for enterprise backend systems'),
(4, 'JavaScript', 'Programming', 'Language of the web, used in browser and Node.js runtimes'),
(5, 'TypeScript', 'Programming', 'Typed superset of JavaScript used in large frontends'),
(6, 'C++', 'Programming', 'High performance language used in systems and robotics'),
(7, 'C#', 'Programming', 'Language used with the .NET platform'),
(8, 'Go', 'Programming', 'Compiled language used for services and infrastructure tooling'),
(9, 'SQL', 'Programming', 'Query language for relational databases'),
(10, 'Scala', 'Programming', 'JVM language commonly used with Apache Spark'),
(11, 'Shell Scripting', 'Programming', 'Automating tasks with bash and shell tools'),
(12, 'Kotlin', 'Programming', 'Modern language for Android and JVM services'),
(13, 'Swift', 'Programming', 'Language for Apple platform applications'),
(14, 'Rust', 'Programming', 'Memory safe systems programming language');

INSERT INTO companies (id, name, industry, headquarters, company_size, founded_year) VALUES
(1, 'Nimbus Analytics', 'Data & Analytics Services', 'Bengaluru', '1000-5000', 2011),
(2, 'Vertex Data Labs', 'Artificial Intelligence', 'Hyderabad', '201-1000', 2014),
(3, 'Quantum Retail Tech', 'E-commerce', 'Bengaluru', '5000-10000', 2009),
(4, 'Helios FinServe', 'Banking & Financial Services', 'Mumbai', '10000+', 1998),
(5, 'MedCore Systems', 'Healthcare Technology', 'Pune', '1000-5000', 2007);

INSERT INTO jobs (id, title, company_id, role_id, location, employment_type, experience_min, experience_max, salary_min, salary_max, posted_date, description) VALUES
(1, 'Data Analyst', 1, 1, 'Bengaluru', 'Full-time', 1, 3, 520000, 780000, '2026-05-18', 'Data Analyst role at Nimbus Analytics (Bengaluru). Core stack: SQL, Python, Microsoft Excel, Tableau. Experience required: 1-3 years. Sample posting generated for academic analysis.'),
(2, 'Data Analyst', 3, 1, 'Pune', 'Full-time', 2, 4, 610000, 850000, '2026-02-11', 'Data Analyst role at Quantum Retail Tech (Pune). Build dashboards and own reporting definitions. Sample posting generated for academic analysis.'),
(3, 'Junior Data Analyst (Associate Data Analyst)', 5, 1, 'Chennai', 'Internship', 0, 2, 210000, 320000, '2025-11-02', 'Associate Data Analyst role at MedCore Systems (Chennai). Sample posting generated for academic analysis.'),
(4, 'Senior Data Analyst', 2, 2, 'Hyderabad', 'Full-time', 5, 8, 1180000, 1640000, '2026-07-13', 'Senior Data Analyst role at Vertex Data Labs (Hyderabad). Own analytical workstreams and mentor analysts. Sample posting generated for academic analysis.'),
(5, 'Senior Data Analyst', 4, 2, 'Mumbai', 'Full-time', 6, 9, 1250000, 1720000, '2026-01-09', 'Senior Data Analyst role at Helios FinServe (Mumbai). Sample posting generated for academic analysis.'),
(6, 'Business Analyst', 3, 3, 'Bengaluru', 'Full-time', 2, 5, 560000, 820000, '2026-08-04', 'Business Analyst role at Quantum Retail Tech (Bengaluru). Elicit requirements and drive process improvement. Sample posting generated for academic analysis.'),
(7, 'Business Intelligence Analyst', 1, 4, 'Remote', 'Full-time', 3, 6, 720000, 1020000, '2026-03-09', 'Business Intelligence Analyst role at Nimbus Analytics (Remote). Own the semantic model and dashboards. Sample posting generated for academic analysis.'),
(8, 'Product Analyst', 5, 5, 'Pune', 'Full-time', 3, 6, 780000, 1100000, '2025-09-11', 'Product Analyst role at MedCore Systems (Pune). Measure product usage and run experiments. Sample posting generated for academic analysis.'),
(9, 'Marketing Analyst', 4, 6, 'Mumbai', 'Contract', 2, 5, 480000, 700000, '2026-06-21', 'Marketing Analyst role at Helios FinServe (Mumbai). Analyse campaign performance. Sample posting generated for academic analysis.'),
(10, 'Data Analyst', 2, 1, 'Hyderabad', 'Full-time', 2, 5, 640000, 900000, '2026-09-30', 'Data Analyst role at Vertex Data Labs (Hyderabad). Sample posting generated for academic analysis.');

-- role_skills subset: only skills present in the sample skills list above.
-- The full edge set (504 edges) is loaded from data/role_skills.csv by `npm run seed`.
INSERT INTO role_skills (role_id, skill_id, importance) VALUES
(1, 9, 5), (1, 1, 5), (1, 2, 3), (1, 4, 2), (1, 3, 2),
(2, 9, 5), (2, 1, 5), (2, 2, 4), (2, 8, 2),
(3, 9, 4), (3, 1, 3), (3, 11, 2), (3, 3, 2),
(4, 9, 5), (4, 1, 4), (4, 2, 3), (4, 8, 3),
(5, 9, 5), (5, 1, 5), (5, 2, 4), (5, 4, 2),
(6, 9, 4), (6, 1, 3), (6, 4, 2), (6, 2, 3);

INSERT INTO job_skills (job_id, skill_id, importance) VALUES
(1, 9, 5), (1, 1, 5), (1, 2, 4), (1, 11, 2),
(2, 9, 5), (2, 1, 4), (2, 2, 3),
(3, 9, 4), (3, 1, 4), (3, 2, 3),
(4, 9, 5), (4, 1, 5), (4, 2, 4), (4, 8, 2),
(5, 9, 5), (5, 1, 4), (5, 3, 2),
(6, 9, 4), (6, 1, 3), (6, 11, 2),
(7, 9, 5), (7, 1, 4), (7, 2, 3), (7, 8, 3),
(8, 9, 5), (8, 1, 5), (8, 2, 4), (8, 4, 2),
(9, 9, 4), (9, 1, 3), (9, 2, 3),
(10, 9, 5), (10, 1, 5), (10, 2, 4);

INSERT INTO career_paths (from_role_id, to_role_id, transition_type, avg_years, difficulty, notes) VALUES
(1, 2, 'vertical', 2.0, 2, 'Standard progression within the analytics ladder.'),
(1, 3, 'lateral', 1.5, 2, 'Analytics delivery skills transfer well to business analysis.'),
(1, 4, 'lateral', 1.5, 2, 'Deeper BI modelling and dashboard ownership.'),
(1, 5, 'lateral', 1.5, 2, 'Move closer to product decision making.'),
(1, 6, 'lateral', 1.0, 2, 'Channel and campaign analytics specialisation.'),
(3, 4, 'lateral', 1.5, 2, 'Add BI modelling and visualisation depth.'),
(3, 5, 'lateral', 1.5, 2, 'Analytics inside the product organisation.'),
(2, 4, 'lateral', 2.0, 2, 'Add BI modelling depth on top of senior analysis.');

-- skill_demand subset (quarterly history used for trend / emerging skill detection).
-- growth_rate is 0.0 where the two proportion z-test found no statistically
-- significant change between the baseline and recent windows, which is the
-- honest answer for these high volume but flat skills. Emerging and declining
-- examples (Generative AI, Large Language Models, Apache Hadoop, Microsoft
-- Excel, ...) arrive with the full dataset from data/skill_demand.csv.
INSERT INTO skill_demand (skill_id, period, job_count, growth_rate, z_score) VALUES
(1, '2025-Q1', 437, 0.00, -0.70), (1, '2025-Q2', 449, 0.00, -0.70), (1, '2025-Q3', 445, 0.00, -0.70),
(1, '2026-Q1', 425, 0.00, -0.70), (1, '2026-Q2', 455, 0.00, -0.70), (1, '2026-Q3', 423, 0.00, -0.70),
(9, '2025-Q1', 530, 0.00, 1.71), (9, '2025-Q2', 582, 0.00, 1.71), (9, '2025-Q3', 575, 0.00, 1.71),
(9, '2026-Q1', 573, 0.00, 1.71), (9, '2026-Q2', 596, 0.00, 1.71), (9, '2026-Q3', 588, 0.00, 1.71),
(2, '2025-Q1', 15, 0.00, 0.86), (2, '2025-Q2', 20, 0.00, 0.86), (2, '2025-Q3', 16, 0.00, 0.86),
(2, '2026-Q1', 14, 0.00, 0.86), (2, '2026-Q2', 26, 0.00, 0.86), (2, '2026-Q3', 20, 0.00, 0.86),
(5, '2025-Q1', 39, 0.00, 1.76), (5, '2025-Q2', 32, 0.00, 1.76), (5, '2025-Q3', 37, 0.00, 1.76),
(5, '2026-Q1', 50, 0.00, 1.76), (5, '2026-Q2', 35, 0.00, 1.76), (5, '2026-Q3', 50, 0.00, 1.76);
