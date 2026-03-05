# DLR Deployment Matrix

This document tracks all DataLayer Relay (DLR) script deployments across platforms and environments.

## Active Deployments

### Vanilla Platform (Main Site Sections)

| Environment | Version | Deployed Date | Deployed By | Key Changes | Status |
|-------------|---------|---------------|-------------|-------------|--------|
| **Prod** | dlr-vanilla-v3.3.1 | 2026-02-19 | - | Expanded event blocklist with GA4 and data layer events, consent mode support | ✅ Active |
| **QA2** | dlr-vanilla-v3.3.1 (async) | 2026-02-18 | - | Expanded event blocklist with GA4 and data layer events, consent mode support, async loading | ✅ Active |
| **Test** | dlr-vanilla-v2.6.1 | - | - | Performance optimization + allowlist | ✅ Active |

### Landing Pages (Sitecore)

| Environment | Version | Deployed Date | Deployed By | Key Changes | Status |
|-------------|---------|---------------|-------------|-------------|--------|
| **Prod** | dlr-sitecore-v3.3.1 | 2026-02-23 | - | Expanded event blocklist with GA4 and data layer events, consent mode support | ✅ Active |

### Casino Platform

| Environment | Version | Deployed Date | Deployed By | Key Changes | Status |
|-------------|---------|---------------|-------------|-------------|--------|
| **Prod** | - | - | - | Not deployed yet | ⏸️ Pending |
| **QA2** | - | - | - | Not deployed yet | ⏸️ Pending |

### In-Game Platform

| Environment | Version | Deployed Date | Deployed By | Key Changes | Status |
|-------------|---------|---------------|-------------|-------------|--------|
| **Prod** | - | - | - | Not deployed yet | ⏸️ Pending |
| **QA2** | - | - | - | Not deployed yet | ⏸️ Pending |

### Bingo Platform

| Environment | Version | Deployed Date | Deployed By | Key Changes | Status |
|-------------|---------|---------------|-------------|-------------|--------|
| **Prod** | - | - | - | Not deployed yet | ⏸️ Pending |
| **QA2** | - | - | - | Not deployed yet | ⏸️ Pending |

### Poker Platform

| Environment | Version | Deployed Date | Deployed By | Key Changes | Status |
|-------------|---------|---------------|-------------|-------------|--------|
| **Prod** | - | - | - | Not deployed yet | ⏸️ Pending |
| **QA2** | - | - | - | Not deployed yet | ⏸️ Pending |

---

## Configuration Matrix

### Hardcoded Values (Current State)

| Platform | MEASUREMENT_ID | SERVER_CONTAINER_URL | Notes |
|----------|----------------|---------------------|-------|
| Vanilla | G-M59XDSPFYX | https://sst.sporting.bet.br | Main site tracking |
| Sitecore | G-M59XDSPFYX | https://sst.sporting.bet.br | Landing pages |
| Casino | TBD | TBD | Awaiting configuration |
| In-Game | TBD | TBD | Awaiting configuration |
| Bingo | TBD | TBD | Awaiting configuration |
| Poker | TBD | TBD | Awaiting configuration |

> **Note:** Dynamic injection system is planned for future releases. Currently, these values are hardcoded in deployment-ready scripts.

---

## Deployment Process

1. **Update Source:** Modify `src/datalayer-relay.js` with required changes
2. **Set Version:** Update `RELAY_VERSION` variable to match deployment target
   - Format: `v{major}.{minor}.{patch}-{platform}-{environment}`
   - Example: `v3.3.1-vanilla-prod`
3. **Configure:** Set `MEASUREMENT_ID` and `SERVER_CONTAINER_URL` for target platform
4. **Build:** Generate deployment file named `dlr-{platform}-v{version}.js`
5. **Test:** Verify in target environment
6. **Deploy:** Upload to production
7. **Update Matrix:** Record deployment in this document

---

## Status Legend

- ✅ **Active** - Currently deployed and stable
- 🚧 **WIP** - Work in progress, not deployed
- ⏸️ **Pending** - Awaiting deployment
- ⚠️ **Issues** - Deployed but has known issues
- 🔄 **Rolling Back** - Being replaced with previous version
- ⏩ **Superseded** - Replaced by newer version
- 🗄️ **Archived** - No longer in use

---

## Notes

- All deployment-ready scripts are stored in `Current deployment/` folder
- Source code is maintained in `src/datalayer-relay.js`
- Dynamic injection system (planned) will eliminate need for hardcoded values
- Each platform may have different event filtering and parameter handling requirements
