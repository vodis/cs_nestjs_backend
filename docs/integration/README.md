# Integration documentation

Guides for integrating this backend with clients and **cs_orchestrator**.

| Document | Role |
|----------|------|
| [Agent portfolio integration](agent-portfolio.md) | Read-only MCP, OAuth client identity, consent, admission limits and rollout |
| [ORCHESTRATOR_INTEGRATION.md](../ORCHESTRATOR_INTEGRATION.md) | Boundaries (Dockerfile + CI → GHCR; orchestrator deploys by digest), branch flow, metadata |
| [../phases/nestjs-backend-onboarding.md](../phases/nestjs-backend-onboarding.md) | Cutover status vs platform catalog |

**Normative contracts** (maintained in the orchestrator repo):

- `cs_orchestrator/ORCHESTRATOR_DEPLOYMENT_PIPELINE_CONTRACT.md`
- `cs_orchestrator/docs/integration/SERVICE_INTEGRATION_GUIDE.md`
- `cs_orchestrator/docs/phases/nestjs-backend-onboarding.md`
