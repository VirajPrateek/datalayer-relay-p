# DLR Deployment Matrix

This document tracks all DataLayer Relay (DLR) script deployments across platforms and environments.

## Active Deployments

### Vanilla Platform (Main Site Sections)

| Environment | Version | Deployed Date | Deployed By | Key Changes | Status |
|-------------|---------|---------------|-------------|-------------|--------|
| **Prod** | dlr-vanilla-v3.4.0 | - | - | Gtag-style consent handling, cookie banner event forwarding, expanded OneTrust banner events | 📋 Shared with team |
| **QA2** | dlr-vanilla-v3.4.0 | - | - | Gtag-style consent handling, cookie banner event forwarding | 📋 Shared with team |
| **Test** | dlr-vanilla-v3.4.0 (Partytown) | - | - | Gtag-style consent handling, cookie banner event forwarding, Partytown variant | 📋 Shared with team |

### Landing Pages (Sitecore)

| Environment | Version | Deployed Date | Deployed By | Key Changes | Status |
|-------------|---------|---------------|-------------|-------------|--------|
| **QA** | dlr-sitecore-v3.4.0 | - | - | Gtag-style consent handling, cookie banner event forwarding | 📋 Shared with team |

### Casino Platform

| Environment | Version | Deployed Date | Deployed By | Key Changes | Status |
|-------------|---------|---------------|-------------|-------------|--------|
| **Prod** | dlr-casino-v3.4.0 | - | - | Gtag-style consent handling, cookie banner event forwarding | 📋 Shared with team |
| **QA** | - | - | - | Not deployed yet | ⏸️ Pending |

### In-Game Platform

| Environment | Version | Deployed Date | Deployed By | Key Changes | Status |
|-------------|---------|---------------|-------------|-------------|--------|
| **Prod** | - | - | - | Not deployed yet | ⏸️ Pending |
| **QA2** | - | - | - | Not deployed yet | ⏸️ Pending |

### Bingo Platform

| Environment | Version | Deployed Date | Deployed By | Key Changes | Status |
|-------------|---------|---------------|-------------|-------------|--------|
| **Prod** | dlr-bingo-v3.4.0 | - | - | Gtag-style consent handling, cookie banner event forwarding | 📋 Shared with team |
| **QA** | - | - | - | Not deployed yet | ⏸️ Pending |

### Poker Platform

| Environment | Version | Deployed Date | Deployed By | Key Changes | Status |
|-------------|---------|---------------|-------------|-------------|--------|
| **Prod** | - | - | - | Not deployed yet | ⏸️ Pending |
| **QA** | dlr-poker-v3.4.0 | - | - | Gtag-style consent handling, cookie banner event forwarding | 📋 Shared with team |

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
   - Format: `dlr-{platform}-v{major}.{minor}.{patch}`
   - Example: `dlr-vanilla-v3.4.0`
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
