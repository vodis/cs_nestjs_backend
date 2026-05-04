# INFRASTRUCTURE_ROADMAP.md

## Goal

Move from "containers on one Ubuntu server with low visibility" to a reliable, observable, secure production platform for the gateway and side services.

This roadmap is intentionally phased:

- Phase 1: immediate reliability on current host
- Phase 2: production maturity on single-host/multi-host Docker
- Phase 3: Kubernetes adoption when operationally justified

Related document:

- `DEPLOYMENT_AND_MIGRATIONS_GUIDE.md` for service ownership, schema strategy, and migration rollout rules.

## Current Risk Profile

- Single server failure can stop all services.
- Limited automatic recovery and weak alerting.
- Low observability (unknown failures, unknown latency causes).
- Manual operational handling increases incident time.

## Architecture Direction

- Edge proxy (`nginx` or Traefik) for TLS and routing.
- Services run in Docker with health checks and restart policies.
- Centralized observability stack (metrics, logs, uptime, alerting).
- Clear runbooks and recovery procedures.
- Kubernetes introduced only when scale/complexity requires it.

## Domain and Routing Standard (`craftscript.com`)

Use subdomain-based routing with strict separation by exposure level.

Canonical DNS layout:

- `api.craftscript.com` -> public gateway API
- `admin-api.craftscript.com` -> restricted admin API (IP allowlist/VPN)
- `i18n-api.craftscript.com` -> translation service (public or internal by policy)
- `status.craftscript.com` -> optional public status page

Internal-only services should not be publicly routed:

- `core-finance`, `solver`, `spot`, workers, and databases stay on private network only.
- Access internal services through service-to-service networking, not public DNS.

TLS and edge policy:

- Enforce HTTPS for all public endpoints with automatic certificate renewal.
- Redirect HTTP to HTTPS globally.
- Use HSTS, secure ciphers, and modern TLS defaults.
- Attach WAF/rate limits to `api.craftscript.com` and other public endpoints.

---

## Phase 1 (Now, 1-2 weeks): Stabilize Current Dedicated Server

### 1) Runtime Resilience

- Configure all critical services with:
  - `restart: always`
  - container-level `healthcheck`
  - resource limits (`cpus`, `memory`)
- Ensure stack auto-starts after host reboot (`systemd` unit around compose stack).
- Add host-level disk/CPU/memory monitoring with alerts.

### 2) Edge and Traffic Control

- Put `nginx` (or Traefik) in front of all services.
- Enforce TLS termination (Let's Encrypt or managed certs).
- Route by host/path to gateway and internal services.
- Apply basic rate limiting and request size limits on edge.

### 3) Observability Baseline

- Metrics: Prometheus + Grafana.
- Logs: Loki + Promtail (or ELK if preferred).
- Uptime probes from outside the server (health endpoint checks).
- Correlated request IDs in logs (`traceId`, `requestId`).

### 4) Alerting Baseline

Send alerts to Telegram/Slack for:

- host unreachable
- container unhealthy/down
- error-rate spike
- p95 latency SLO burn
- disk space below threshold
- DB unavailable

### 5) Backup and Recovery

- Automated PostgreSQL backups (daily full + WAL or logical strategy).
- Off-host backup storage (different machine/object storage).
- Recovery drill at least monthly (restore verification).

### 6) Security Hardening

- Secrets out of repo and compose files; inject via environment/secret store.
- Firewall: expose only required ports (`80/443`, restricted SSH).
- SSH hardening (keys only, disable password auth, fail2ban).
- Regular patch window for host and container base images.

---

## Phase 2 (2-6 weeks): Production Maturity Without Kubernetes

### 1) Deployment Discipline

- CI builds immutable images tagged by commit SHA.
- Blue/green or rolling deploy script on current host.
- Automatic rollback if health checks fail post-deploy.

### 2) Service-Level Objectives

Track and alert on:

- API availability
- endpoint p95/p99 latency
- business flow success rates (withdraw, deposit, swap, orders)
- queue/workflow lag (Temporal + event processing)

### 3) Isolation and Capacity

- Separate PostgreSQL from app host when possible.
- Optional split:
  - public edge/gateway host
  - private internal services host
- Add Redis for cache and rate-limits with persistence strategy defined.

### 4) Operational Readiness

- Incident response runbooks:
  - server down
  - DB degraded
  - downstream provider outage
  - rollback process
- On-call checklist and escalation path.

---

## Phase 3 (When Ready): Kubernetes Adoption

Adopt Kubernetes only when these triggers are consistently true:

- 5+ actively changing services
- frequent deployments requiring safer progressive delivery
- need for multi-node high availability and stronger self-healing
- team has bandwidth for platform operations

### Recommended Path

- Prefer managed Kubernetes if available.
- If staying on dedicated servers: evaluate `k3s` first.
- Keep same observability stack concepts (Prometheus/Grafana/Loki).
- Adopt GitOps (Argo CD/Flux) after initial cluster stabilization.

### Kubernetes Minimum Controls

- readiness/liveness probes for every service
- resource requests/limits
- network policies
- secret management integration
- pod disruption budgets for critical services
- horizontal pod autoscaling where useful

---

## Nginx vs Kubernetes (Decision Clarifier)

- `nginx` solves edge routing/TLS only.
- Kubernetes solves scheduling, self-healing, rolling deployment, and scaling.
- For current stage: deploy `nginx` **and** strengthen Docker operations first.
- Move to Kubernetes after Phase 1 and 2 controls are stable.

---

## Minimal Compose Standards (Immediate)

Every service should define at least:

- `restart: always`
- `healthcheck` command with interval/retries
- resource constraints
- structured JSON logs
- no hardcoded secrets

Example skeleton:

```yaml
services:
  gateway:
    image: your-org/gateway:${IMAGE_TAG}
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    environment:
      NODE_ENV: production
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 1024M
```

---

## 30-Day Implementation Plan

Week 1:

- add health checks + restart policies
- add edge proxy TLS + routing
- wire uptime probe + host/container alerts

Week 2:

- deploy Prometheus/Grafana/Loki
- instrument gateway SLO dashboards
- add backup automation and test restore

Week 3:

- implement safe deploy + rollback scripts
- finalize incident runbooks
- harden server access and secrets handling

Week 4:

- load test hot endpoints
- review SLO/error budgets
- decide if Kubernetes trigger criteria are met

---

## Success Criteria

Infrastructure is considered "controlled" when:

- any service/host outage is detected within minutes
- auto-restart works for common crash cases
- on-call has clear runbooks for top incidents
- restore from backup is proven
- latency/error SLOs are visible and alertable
- deployments are repeatable with rollback safety
