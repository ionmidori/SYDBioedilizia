# GitHub Enterprise Policies

Governance and security standards for enterprise-grade repositories.

## 1. Access & Security

- **MFA Enforcement**: Required for all contributors.
- **SSO/OIDC**: Preferred authentication for CI/CD runners (GitHub Actions).
- **IP Allow List**: If required by organizational policy.
- **Personal Access Tokens (PATs)**: Must be fine-grained and expires < 90 days.

## 2. Repository Rulesets

- **Branch Protection**:
  - Require PR reviews (at least 1 for non-critical, 2 for architectural).
  - Require status checks (CI/Lint) to pass.
  - Disable force-push to `main`.
- **Visibility**: Repositories are `Private` by default. Transfers require Senior management approval.

## 3. Automation (GitHub Actions)

- **Principle of Least Privilege**: Default `GITHUB_TOKEN` set to `read-all` or `none` in YAML.
- **Action Veracity**: Use only verified Actions or pinned commit SHAs.
- **Secrets Management**: Use GitHub Environment Secrets for Production deployments.

## 4. Continuity & Compliance

- **Audit Logs**: Reviewed monthly for anomalous activity.
- **CODEOWNERS**: Mandatory for `directives/` and `src/core/`.
- **Disaster Recovery**: Maintain local "Cold Storage" backups or cross-cloud mirrors (e.g., GitLab/S3).
